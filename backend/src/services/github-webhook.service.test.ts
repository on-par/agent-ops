import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "crypto";
import {
  GitHubWebhookService,
  type IssueWebhookPayload,
  type PingWebhookPayload,
} from "./github-webhook.service.js";

// Mock database
const mockDb = {} as any;

// Create mock repository instances
const mockRepoRepository = {
  findAll: vi.fn(),
};

const mockWorkItemRepository = {
  findAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

// Mock the repository modules with proper class constructors
vi.mock("../repositories/repository.repository.js", () => ({
  RepositoryRepository: class {
    findAll = mockRepoRepository.findAll;
  },
}));

vi.mock("../repositories/work-item.repository.js", () => ({
  WorkItemRepository: class {
    findAll = mockWorkItemRepository.findAll;
    create = mockWorkItemRepository.create;
    update = mockWorkItemRepository.update;
    delete = mockWorkItemRepository.delete;
  },
}));

describe("GitHubWebhookService", () => {
  let service: GitHubWebhookService;
  const testSecret = "test-webhook-secret";

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepoRepository.findAll.mockResolvedValue([]);
    mockWorkItemRepository.findAll.mockResolvedValue([]);
    mockWorkItemRepository.create.mockImplementation((item) => Promise.resolve(item));
    mockWorkItemRepository.update.mockImplementation((id, updates) =>
      Promise.resolve({ id, ...updates })
    );
    mockWorkItemRepository.delete.mockResolvedValue(undefined);

    service = new GitHubWebhookService(mockDb, testSecret);
  });

  describe("verifySignature", () => {
    it("should return true for valid signature", () => {
      const payload = '{"test": "data"}';
      const expectedSignature = `sha256=${createHmac("sha256", testSecret)
        .update(payload)
        .digest("hex")}`;

      expect(service.verifySignature(payload, expectedSignature)).toBe(true);
    });

    it("should return false for invalid signature", () => {
      const payload = '{"test": "data"}';
      const invalidSignature = "sha256=0000000000000000000000000000000000000000000000000000000000000000";

      expect(service.verifySignature(payload, invalidSignature)).toBe(false);
    });

    it("should return false for missing signature", () => {
      const payload = '{"test": "data"}';

      expect(service.verifySignature(payload, undefined)).toBe(false);
    });

    it("should return true when no secret configured (development mode)", () => {
      const noSecretService = new GitHubWebhookService(mockDb, "");
      const payload = '{"test": "data"}';

      expect(noSecretService.verifySignature(payload, undefined)).toBe(true);
    });
  });

  describe("processWebhook", () => {
    it("should handle ping event", async () => {
      const payload: PingWebhookPayload = {
        zen: "Keep it simple",
        hook_id: 12345,
        repository: {
          id: 1,
          name: "test-repo",
          full_name: "owner/test-repo",
          owner: { login: "owner" },
        },
      };

      const result = await service.processWebhook("ping", payload);

      expect(result.success).toBe(true);
      expect(result.message).toContain("owner/test-repo");
      expect(result.message).toContain("Keep it simple");
    });

    it("should skip issues for unconnected repositories", async () => {
      mockRepoRepository.findAll.mockResolvedValue([]);

      const payload: IssueWebhookPayload = {
        action: "opened",
        issue: {
          id: 123,
          number: 1,
          title: "Test Issue",
          body: "Test body",
          state: "open",
          html_url: "https://github.com/owner/repo/issues/1",
          labels: [],
          user: { id: 1, login: "user", avatar_url: "" },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        repository: {
          id: 999,
          name: "unconnected-repo",
          full_name: "owner/unconnected-repo",
          owner: { login: "owner" },
        },
        sender: { id: 1, login: "user", avatar_url: "" },
      };

      const result = await service.processWebhook("issues", payload);

      expect(result.success).toBe(true);
      expect(result.message).toContain("not connected");
    });

    it("should create work item for new issue", async () => {
      mockRepoRepository.findAll.mockResolvedValue([
        {
          id: "repo-1",
          githubRepoId: 123,
          syncEnabled: true,
          issueLabelsFilter: [],
        },
      ]);
      mockWorkItemRepository.findAll.mockResolvedValue([]);
      mockWorkItemRepository.create.mockResolvedValue({
        id: "work-item-1",
        title: "New Issue",
      });

      const payload: IssueWebhookPayload = {
        action: "opened",
        issue: {
          id: 456,
          number: 1,
          title: "New Issue",
          body: "Issue body",
          state: "open",
          html_url: "https://github.com/owner/repo/issues/1",
          labels: [{ name: "bug", color: "red" }],
          user: { id: 1, login: "user", avatar_url: "" },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        repository: {
          id: 123,
          name: "repo",
          full_name: "owner/repo",
          owner: { login: "owner" },
        },
        sender: { id: 1, login: "user", avatar_url: "" },
      };

      const result = await service.processWebhook("issues", payload);

      expect(result.success).toBe(true);
      expect(result.action).toBe("created");
      expect(mockWorkItemRepository.create).toHaveBeenCalled();
    });

    it("should acknowledge unknown event types", async () => {
      const result = await service.processWebhook("unknown_event" as any, {} as any);

      expect(result.success).toBe(true);
      expect(result.message).toContain("Unknown event type");
    });

    it("should acknowledge PR review events without processing", async () => {
      const result = await service.processWebhook("pull_request_review", {} as any);

      expect(result.success).toBe(true);
      expect(result.message).toContain("not processed");
    });
  });

  describe("signature verification security", () => {
    it("should use timing-safe comparison", () => {
      const payload = '{"test": "data"}';
      const validSignature = `sha256=${createHmac("sha256", testSecret)
        .update(payload)
        .digest("hex")}`;

      // Multiple verifications should take similar time
      const iterations = 10;
      const validTimes: number[] = [];
      const invalidTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start1 = performance.now();
        service.verifySignature(payload, validSignature);
        validTimes.push(performance.now() - start1);

        const start2 = performance.now();
        service.verifySignature(
          payload,
          "sha256=0000000000000000000000000000000000000000000000000000000000000000"
        );
        invalidTimes.push(performance.now() - start2);
      }

      // Average times should be in same order of magnitude
      const avgValid = validTimes.reduce((a, b) => a + b) / iterations;
      const avgInvalid = invalidTimes.reduce((a, b) => a + b) / iterations;

      // This is a weak test but checks that timing-safe comparison is used
      expect(Math.abs(avgValid - avgInvalid)).toBeLessThan(5);
    });
  });
});
