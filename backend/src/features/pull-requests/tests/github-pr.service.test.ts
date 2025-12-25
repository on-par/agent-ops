import { describe, it, expect, beforeEach, vi } from "vitest";
import { GitHubPRService } from "../services/github-pr.service.js";
import type { DrizzleDatabase } from "../../../shared/db/index.js";

// Mock Octokit
const mockOctokit = {
  rest: {
    pulls: {
      create: vi.fn().mockResolvedValue({
        data: {
          number: 123,
          html_url: "https://github.com/owner/repo/pull/123",
          state: "open",
          merged: false,
          head: { ref: "feature-branch" },
          base: { ref: "main" },
        },
      }),
    },
  },
};

vi.mock("octokit", () => ({
  Octokit: vi.fn(function() {
    return mockOctokit;
  }),
}));

describe("GitHubPRService", () => {
  let service: GitHubPRService;
  let mockDb: DrizzleDatabase;
  let mockWorkItemRepo: any;
  let mockRepoRepository: any;
  let mockConnectionRepo: any;

  beforeEach(() => {
    // Create mock repositories
    mockWorkItemRepo = {
      findById: vi.fn(),
      update: vi.fn(),
    };

    mockRepoRepository = {
      findById: vi.fn(),
    };

    mockConnectionRepo = {
      findById: vi.fn(),
    };

    // Create mock database
    mockDb = {} as DrizzleDatabase;

    // Create service instance
    service = new GitHubPRService(mockDb);

    // Replace repositories with mocks
    (service as any).workItemRepo = mockWorkItemRepo;
    (service as any).repoRepository = mockRepoRepository;
    (service as any).connectionRepo = mockConnectionRepo;
  });

  describe("createPullRequest", () => {
    it("should save PR URL and number to work item", async () => {
      // Arrange
      const workItemId = "work-item-123";
      const repositoryId = "repo-123";
      const connectionId = "conn-123";

      mockWorkItemRepo.findById.mockResolvedValue({
        id: workItemId,
        title: "Test Work Item",
        repositoryId,
      });

      mockRepoRepository.findById.mockResolvedValue({
        id: repositoryId,
        connectionId,
        owner: "owner",
        name: "repo",
        defaultBranch: "main",
      });

      mockConnectionRepo.findById.mockResolvedValue({
        id: connectionId,
        accessToken: "test-token",
      });

      mockWorkItemRepo.update.mockResolvedValue(undefined);

      // Act
      const result = await service.createPullRequest({
        workItemId,
        branchName: "feature-branch",
        title: "Test PR",
        body: "Test body",
      });

      // Assert
      expect(result.number).toBe(123);
      expect(result.htmlUrl).toBe("https://github.com/owner/repo/pull/123");
      expect(mockWorkItemRepo.update).toHaveBeenCalledWith(workItemId, {
        githubPrNumber: 123,
        githubPrUrl: "https://github.com/owner/repo/pull/123",
      });
    });

    it("should not fail if work item update fails", async () => {
      // Arrange
      const workItemId = "work-item-123";
      const repositoryId = "repo-123";
      const connectionId = "conn-123";

      mockWorkItemRepo.findById.mockResolvedValue({
        id: workItemId,
        title: "Test Work Item",
        repositoryId,
      });

      mockRepoRepository.findById.mockResolvedValue({
        id: repositoryId,
        connectionId,
        owner: "owner",
        name: "repo",
        defaultBranch: "main",
      });

      mockConnectionRepo.findById.mockResolvedValue({
        id: connectionId,
        accessToken: "test-token",
      });

      // Mock update to throw error
      mockWorkItemRepo.update.mockRejectedValue(new Error("Database error"));

      // Mock console.warn to prevent test output pollution
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Act
      const result = await service.createPullRequest({
        workItemId,
        branchName: "feature-branch",
        title: "Test PR",
        body: "Test body",
      });

      // Assert - should still return PR result even if update fails
      expect(result.number).toBe(123);
      expect(result.htmlUrl).toBe("https://github.com/owner/repo/pull/123");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to update work item with PR details"),
        expect.any(Error)
      );

      warnSpy.mockRestore();
    });
  });
});
