import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { GitOperationsService } from "./git-operations.service.js";
import type { SimpleGit, StatusResult } from "simple-git";

// Mock simple-git module
vi.mock("simple-git", () => {
  const mockGitInstance = {
    clone: vi.fn(),
    checkoutLocalBranch: vi.fn(),
    revparse: vi.fn(),
    add: vi.fn(),
    addConfig: vi.fn(),
    commit: vi.fn(),
    remote: vi.fn(),
    push: vi.fn(),
    diff: vi.fn(),
    status: vi.fn(),
    getRemotes: vi.fn(),
  };

  const mockFactory = vi.fn(() => mockGitInstance);

  return {
    simpleGit: mockFactory,
    default: mockFactory,
  };
});

// Import mocked module
import { simpleGit } from "simple-git";

describe("GitOperationsService", () => {
  let service: GitOperationsService;
  let mockGit: SimpleGit;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GitOperationsService();
    mockGit = simpleGit() as unknown as SimpleGit;
  });

  describe("cloneRepository", () => {
    it("should clone repository without token", async () => {
      const options = {
        url: "https://github.com/owner/repo.git",
        path: "/tmp/test-repo",
      };

      await service.cloneRepository(options);

      expect(simpleGit).toHaveBeenCalled();
      expect(mockGit.clone).toHaveBeenCalledWith(
        options.url,
        options.path,
        ["--depth", "1"]
      );
    });

    it("should clone repository with token", async () => {
      const options = {
        url: "https://github.com/owner/repo.git",
        path: "/tmp/test-repo",
        token: "test-token-123",
      };

      await service.cloneRepository(options);

      expect(mockGit.clone).toHaveBeenCalledWith(
        "https://test-token-123@github.com/owner/repo.git",
        options.path,
        ["--depth", "1"]
      );
    });

    it("should clone specific branch", async () => {
      const options = {
        url: "https://github.com/owner/repo.git",
        path: "/tmp/test-repo",
        branch: "develop",
      };

      await service.cloneRepository(options);

      expect(mockGit.clone).toHaveBeenCalledWith(
        options.url,
        options.path,
        ["--depth", "1", "--branch", "develop"]
      );
    });

    it("should clone with token and branch", async () => {
      const options = {
        url: "https://github.com/owner/repo.git",
        path: "/tmp/test-repo",
        token: "test-token-123",
        branch: "main",
      };

      await service.cloneRepository(options);

      expect(mockGit.clone).toHaveBeenCalledWith(
        "https://test-token-123@github.com/owner/repo.git",
        options.path,
        ["--depth", "1", "--branch", "main"]
      );
    });

    it("should handle clone failure", async () => {
      const options = {
        url: "https://github.com/owner/repo.git",
        path: "/tmp/test-repo",
      };

      (mockGit.clone as Mock).mockRejectedValueOnce(
        new Error("Authentication failed")
      );

      await expect(service.cloneRepository(options)).rejects.toThrow(
        "Failed to clone repository: Authentication failed"
      );
    });
  });

  describe("createBranch", () => {
    it("should create and checkout new branch", async () => {
      await service.createBranch("/tmp/repo", "feature/new-feature");

      expect(simpleGit).toHaveBeenCalledWith("/tmp/repo");
      expect(mockGit.checkoutLocalBranch).toHaveBeenCalledWith(
        "feature/new-feature"
      );
    });

    it("should handle branch creation failure", async () => {
      (mockGit.checkoutLocalBranch as Mock).mockRejectedValueOnce(
        new Error("Branch already exists")
      );

      await expect(
        service.createBranch("/tmp/repo", "feature/existing")
      ).rejects.toThrow("Failed to create branch: Branch already exists");
    });
  });

  describe("getCurrentBranch", () => {
    it("should return current branch name", async () => {
      (mockGit.revparse as Mock).mockResolvedValueOnce("main\n");

      const branch = await service.getCurrentBranch("/tmp/repo");

      expect(branch).toBe("main");
      expect(mockGit.revparse).toHaveBeenCalledWith(["--abbrev-ref", "HEAD"]);
    });

    it("should trim whitespace from branch name", async () => {
      (mockGit.revparse as Mock).mockResolvedValueOnce("  feature/test  \n");

      const branch = await service.getCurrentBranch("/tmp/repo");

      expect(branch).toBe("feature/test");
    });

    it("should handle error getting branch", async () => {
      (mockGit.revparse as Mock).mockRejectedValueOnce(
        new Error("Not a git repository")
      );

      await expect(service.getCurrentBranch("/tmp/repo")).rejects.toThrow(
        "Failed to get current branch: Not a git repository"
      );
    });
  });

  describe("stageAllChanges", () => {
    it("should stage all changes", async () => {
      await service.stageAllChanges("/tmp/repo");

      expect(simpleGit).toHaveBeenCalledWith("/tmp/repo");
      expect(mockGit.add).toHaveBeenCalledWith(".");
    });

    it("should handle staging failure", async () => {
      (mockGit.add as Mock).mockRejectedValueOnce(
        new Error("Permission denied")
      );

      await expect(service.stageAllChanges("/tmp/repo")).rejects.toThrow(
        "Failed to stage changes: Permission denied"
      );
    });
  });

  describe("commit", () => {
    it("should commit with message only", async () => {
      (mockGit.commit as Mock).mockResolvedValueOnce({
        commit: "abc123",
        branch: "main",
        summary: { changes: 1, insertions: 10, deletions: 5 },
      });

      const hash = await service.commit("/tmp/repo", {
        message: "Test commit",
      });

      expect(hash).toBe("abc123");
      expect(mockGit.commit).toHaveBeenCalledWith("Test commit");
      expect(mockGit.addConfig).not.toHaveBeenCalled();
    });

    it("should commit with author information", async () => {
      (mockGit.commit as Mock).mockResolvedValueOnce({
        commit: "def456",
        branch: "main",
        summary: { changes: 1, insertions: 10, deletions: 5 },
      });

      const hash = await service.commit("/tmp/repo", {
        message: "Test commit with author",
        author: {
          name: "Test User",
          email: "test@example.com",
        },
      });

      expect(hash).toBe("def456");
      expect(mockGit.addConfig).toHaveBeenCalledWith(
        "user.name",
        "Test User",
        false,
        "local"
      );
      expect(mockGit.addConfig).toHaveBeenCalledWith(
        "user.email",
        "test@example.com",
        false,
        "local"
      );
      expect(mockGit.commit).toHaveBeenCalledWith("Test commit with author");
    });

    it("should handle commit failure", async () => {
      (mockGit.commit as Mock).mockRejectedValueOnce(
        new Error("Nothing to commit")
      );

      await expect(
        service.commit("/tmp/repo", { message: "Empty commit" })
      ).rejects.toThrow("Failed to commit changes: Nothing to commit");
    });
  });

  describe("push", () => {
    it("should push branch without token", async () => {
      await service.push("/tmp/repo", "main");

      expect(simpleGit).toHaveBeenCalledWith("/tmp/repo");
      expect(mockGit.push).toHaveBeenCalledWith("origin", "main", [
        "--set-upstream",
      ]);
      expect(mockGit.remote).not.toHaveBeenCalled();
    });

    it("should push branch with token", async () => {
      (mockGit.getRemotes as Mock).mockResolvedValueOnce([
        {
          name: "origin",
          refs: {
            fetch: "https://github.com/owner/repo.git",
            push: "https://github.com/owner/repo.git",
          },
        },
      ]);

      await service.push("/tmp/repo", "feature/test", "test-token");

      expect(mockGit.getRemotes).toHaveBeenCalledWith(true);
      expect(mockGit.remote).toHaveBeenCalledWith([
        "set-url",
        "origin",
        "https://test-token@github.com/owner/repo.git",
      ]);
      expect(mockGit.push).toHaveBeenCalledWith("origin", "feature/test", [
        "--set-upstream",
      ]);
    });

    it("should handle push failure", async () => {
      (mockGit.push as Mock).mockRejectedValueOnce(
        new Error("Permission denied")
      );

      await expect(service.push("/tmp/repo", "main")).rejects.toThrow(
        "Failed to push branch: Permission denied"
      );
    });
  });

  describe("getDiff", () => {
    it("should return diff output", async () => {
      const mockDiff = `diff --git a/file.txt b/file.txt
index 123..456 100644
--- a/file.txt
+++ b/file.txt
@@ -1 +1 @@
-old content
+new content`;

      (mockGit.diff as Mock).mockResolvedValueOnce(mockDiff);

      const diff = await service.getDiff("/tmp/repo");

      expect(diff).toBe(mockDiff);
      expect(mockGit.diff).toHaveBeenCalled();
    });

    it("should return empty string when no changes", async () => {
      (mockGit.diff as Mock).mockResolvedValueOnce("");

      const diff = await service.getDiff("/tmp/repo");

      expect(diff).toBe("");
    });

    it("should handle diff failure", async () => {
      (mockGit.diff as Mock).mockRejectedValueOnce(
        new Error("Not a git repository")
      );

      await expect(service.getDiff("/tmp/repo")).rejects.toThrow(
        "Failed to get diff: Not a git repository"
      );
    });
  });

  describe("getStatus", () => {
    it("should return status summary", async () => {
      const mockStatus: Partial<StatusResult> = {
        staged: ["src/file1.ts", "src/file2.ts"],
        modified: ["src/file3.ts"],
        not_added: ["src/file4.ts", "src/file5.ts"],
        files: [],
        created: [],
        deleted: [],
        renamed: [],
        conflicted: [],
        isClean: () => false,
        current: "main",
        tracking: "origin/main",
        ahead: 0,
        behind: 0,
      };

      (mockGit.status as Mock).mockResolvedValueOnce(mockStatus);

      const status = await service.getStatus("/tmp/repo");

      expect(status).toEqual({
        staged: ["src/file1.ts", "src/file2.ts"],
        modified: ["src/file3.ts"],
        untracked: ["src/file4.ts", "src/file5.ts"],
      });
    });

    it("should handle empty status", async () => {
      const mockStatus: Partial<StatusResult> = {
        staged: [],
        modified: [],
        not_added: [],
        files: [],
        created: [],
        deleted: [],
        renamed: [],
        conflicted: [],
        isClean: () => true,
        current: "main",
        tracking: "origin/main",
        ahead: 0,
        behind: 0,
      };

      (mockGit.status as Mock).mockResolvedValueOnce(mockStatus);

      const status = await service.getStatus("/tmp/repo");

      expect(status).toEqual({
        staged: [],
        modified: [],
        untracked: [],
      });
    });

    it("should handle status failure", async () => {
      (mockGit.status as Mock).mockRejectedValueOnce(
        new Error("Not a git repository")
      );

      await expect(service.getStatus("/tmp/repo")).rejects.toThrow(
        "Failed to get status: Not a git repository"
      );
    });
  });

  describe("buildAuthenticatedUrl (private method testing via clone)", () => {
    it("should handle various GitHub URL formats", async () => {
      const testCases = [
        {
          input: "https://github.com/owner/repo.git",
          expected: "https://token@github.com/owner/repo.git",
        },
        {
          input: "https://github.com/owner/repo",
          expected: "https://token@github.com/owner/repo",
        },
      ];

      for (const { input, expected } of testCases) {
        vi.clearAllMocks();
        await service.cloneRepository({
          url: input,
          path: "/tmp/test",
          token: "token",
        });

        expect(mockGit.clone).toHaveBeenCalledWith(
          expected,
          "/tmp/test",
          expect.any(Array)
        );
      }
    });
  });
});
