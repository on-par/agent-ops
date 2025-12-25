import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { ContainerTerminalService } from "../services/container-terminal.service.js";
import type { DockerClientInterface } from "../interfaces/docker-client.interface.js";
import type { Duplex } from "stream";
import { EventEmitter } from "events";

describe("ContainerTerminalService", () => {
  let dockerClient: DockerClientInterface;
  let terminalService: ContainerTerminalService;

  beforeEach(() => {
    // Create mock Docker client
    dockerClient = {
      createContainer: vi.fn(),
      startContainer: vi.fn(),
      stopContainer: vi.fn(),
      removeContainer: vi.fn(),
      getContainer: vi.fn(),
      listContainers: vi.fn(),
      exec: vi.fn(),
      getLogs: vi.fn(),
    };

    terminalService = new ContainerTerminalService(dockerClient);
  });

  describe("attachTerminal", () => {
    it("should open PTY session in container", async () => {
      // Arrange
      const containerId = "test-container-123";
      const mockStream = new EventEmitter() as Duplex;
      mockStream.write = vi.fn();
      mockStream.end = vi.fn();

      // Mock Docker exec to return a stream
      const mockDockerClient = dockerClient as any;
      mockDockerClient.execCreate = vi.fn().mockResolvedValue({
        id: "exec-123",
      });
      mockDockerClient.execStart = vi.fn().mockResolvedValue(mockStream);

      // Act
      const session = await terminalService.attachTerminal(containerId);

      // Assert
      expect(session).toBeDefined();
      expect(session.containerId).toBe(containerId);
      expect(session.stream).toBeDefined();
      expect(session.execId).toBe("exec-123");
    });

    it("should allocate TTY for interactive session", async () => {
      // Arrange
      const containerId = "test-container-456";
      const mockStream = new EventEmitter() as Duplex;
      mockStream.write = vi.fn();
      mockStream.end = vi.fn();

      const mockDockerClient = dockerClient as any;
      mockDockerClient.execCreate = vi.fn().mockResolvedValue({
        id: "exec-456",
      });
      mockDockerClient.execStart = vi.fn().mockResolvedValue(mockStream);

      // Act
      await terminalService.attachTerminal(containerId);

      // Assert
      expect(mockDockerClient.execCreate).toHaveBeenCalledWith(
        containerId,
        expect.objectContaining({
          Tty: true,
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
        })
      );
    });

    it("should start shell in container", async () => {
      // Arrange
      const containerId = "test-container-789";
      const mockStream = new EventEmitter() as Duplex;
      mockStream.write = vi.fn();
      mockStream.end = vi.fn();

      const mockDockerClient = dockerClient as any;
      mockDockerClient.execCreate = vi.fn().mockResolvedValue({
        id: "exec-789",
      });
      mockDockerClient.execStart = vi.fn().mockResolvedValue(mockStream);

      // Act
      await terminalService.attachTerminal(containerId);

      // Assert
      expect(mockDockerClient.execCreate).toHaveBeenCalledWith(
        containerId,
        expect.objectContaining({
          Cmd: ["/bin/sh"],
        })
      );
    });

    it("should throw error if container not found", async () => {
      // Arrange
      const containerId = "non-existent-container";
      const mockDockerClient = dockerClient as any;
      mockDockerClient.execCreate = vi.fn().mockRejectedValue(
        new Error("Container not found")
      );

      // Act & Assert
      await expect(
        terminalService.attachTerminal(containerId)
      ).rejects.toThrow("Container not found");
    });
  });

  describe("resizeTerminal", () => {
    it("should resize terminal to specified dimensions", async () => {
      // Arrange
      const containerId = "test-container-resize";
      const mockStream = new EventEmitter() as Duplex;
      mockStream.write = vi.fn();
      mockStream.end = vi.fn();

      const mockDockerClient = dockerClient as any;
      mockDockerClient.execCreate = vi.fn().mockResolvedValue({
        id: "exec-resize",
      });
      mockDockerClient.execStart = vi.fn().mockResolvedValue(mockStream);
      mockDockerClient.execResize = vi.fn().mockResolvedValue(undefined);

      const session = await terminalService.attachTerminal(containerId);

      // Act
      await terminalService.resizeTerminal(session, 80, 24);

      // Assert
      expect(mockDockerClient.execResize).toHaveBeenCalledWith(
        "exec-resize",
        80,
        24
      );
    });

    it("should handle resize errors gracefully", async () => {
      // Arrange
      const containerId = "test-container-resize-error";
      const mockStream = new EventEmitter() as Duplex;
      mockStream.write = vi.fn();
      mockStream.end = vi.fn();

      const mockDockerClient = dockerClient as any;
      mockDockerClient.execCreate = vi.fn().mockResolvedValue({
        id: "exec-resize-error",
      });
      mockDockerClient.execStart = vi.fn().mockResolvedValue(mockStream);
      mockDockerClient.execResize = vi.fn().mockRejectedValue(
        new Error("Exec not running")
      );

      const session = await terminalService.attachTerminal(containerId);

      // Act & Assert - should not throw
      await expect(
        terminalService.resizeTerminal(session, 80, 24)
      ).resolves.not.toThrow();
    });
  });

  describe("detachTerminal", () => {
    it("should close stream and clean up session", async () => {
      // Arrange
      const containerId = "test-container-detach";
      const mockStream = new EventEmitter() as Duplex;
      mockStream.write = vi.fn();
      mockStream.end = vi.fn();
      mockStream.destroy = vi.fn();

      const mockDockerClient = dockerClient as any;
      mockDockerClient.execCreate = vi.fn().mockResolvedValue({
        id: "exec-detach",
      });
      mockDockerClient.execStart = vi.fn().mockResolvedValue(mockStream);

      const session = await terminalService.attachTerminal(containerId);

      // Act
      terminalService.detachTerminal(session);

      // Assert
      expect(mockStream.destroy).toHaveBeenCalled();
    });

    it("should handle already closed streams", async () => {
      // Arrange
      const containerId = "test-container-detach-closed";
      const mockStream = new EventEmitter() as Duplex;
      mockStream.write = vi.fn();
      mockStream.end = vi.fn();
      mockStream.destroy = vi.fn().mockImplementation(() => {
        throw new Error("Stream already closed");
      });

      const mockDockerClient = dockerClient as any;
      mockDockerClient.execCreate = vi.fn().mockResolvedValue({
        id: "exec-detach-closed",
      });
      mockDockerClient.execStart = vi.fn().mockResolvedValue(mockStream);

      const session = await terminalService.attachTerminal(containerId);

      // Act & Assert - should not throw
      expect(() => terminalService.detachTerminal(session)).not.toThrow();
    });
  });

  describe("writeToTerminal", () => {
    it("should relay stdin data to container", async () => {
      // Arrange
      const containerId = "test-container-write";
      const mockStream = new EventEmitter() as Duplex;
      mockStream.write = vi.fn();
      mockStream.end = vi.fn();

      const mockDockerClient = dockerClient as any;
      mockDockerClient.execCreate = vi.fn().mockResolvedValue({
        id: "exec-write",
      });
      mockDockerClient.execStart = vi.fn().mockResolvedValue(mockStream);

      const session = await terminalService.attachTerminal(containerId);
      const testData = "ls -la\n";

      // Act
      terminalService.writeToTerminal(session, testData);

      // Assert
      expect(mockStream.write).toHaveBeenCalledWith(testData);
    });
  });

  describe("onTerminalData", () => {
    it("should receive stdout data from container", async () => {
      // Arrange
      const containerId = "test-container-output";
      const mockStream = new EventEmitter() as Duplex;
      mockStream.write = vi.fn();
      mockStream.end = vi.fn();

      const mockDockerClient = dockerClient as any;
      mockDockerClient.execCreate = vi.fn().mockResolvedValue({
        id: "exec-output",
      });
      mockDockerClient.execStart = vi.fn().mockResolvedValue(mockStream);

      const session = await terminalService.attachTerminal(containerId);
      const dataHandler = vi.fn();

      // Act
      terminalService.onTerminalData(session, dataHandler);

      // Simulate data from container
      const testOutput = Buffer.from("command output");
      mockStream.emit("data", testOutput);

      // Assert
      expect(dataHandler).toHaveBeenCalledWith(testOutput);
    });
  });

  describe("onTerminalEnd", () => {
    it("should notify when terminal session ends", async () => {
      // Arrange
      const containerId = "test-container-end";
      const mockStream = new EventEmitter() as Duplex;
      mockStream.write = vi.fn();
      mockStream.end = vi.fn();

      const mockDockerClient = dockerClient as any;
      mockDockerClient.execCreate = vi.fn().mockResolvedValue({
        id: "exec-end",
      });
      mockDockerClient.execStart = vi.fn().mockResolvedValue(mockStream);

      const session = await terminalService.attachTerminal(containerId);
      const endHandler = vi.fn();

      // Act
      terminalService.onTerminalEnd(session, endHandler);

      // Simulate stream end
      mockStream.emit("end");

      // Assert
      expect(endHandler).toHaveBeenCalled();
    });
  });
});
