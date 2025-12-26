import type { Duplex } from "stream";

/**
 * Terminal session representing an active PTY connection to a container
 */
export interface TerminalSession {
  /** Container ID this terminal is attached to */
  containerId: string;

  /** Docker exec instance ID */
  execId: string;

  /** Duplex stream for stdin/stdout communication */
  stream: Duplex;

  /** Optional session metadata */
  metadata?: {
    /** Timestamp when session was created */
    createdAt: number;

    /** Current terminal dimensions */
    dimensions?: {
      cols: number;
      rows: number;
    };
  };
}
