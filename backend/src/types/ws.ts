import type { WorkItem, Worker, Trace } from "../db/schema.js";

// Client-to-Server Messages
export type ClientMessage =
  | { type: "ping" }
  | { type: "subscribe"; room: string }
  | { type: "unsubscribe"; room: string };

// Server-to-Client Messages
export type ServerMessage =
  | { type: "pong" }
  | { type: "initial_state"; data: InitialState }
  | { type: "worker_update"; data: Worker }
  | { type: "work_item_update"; data: WorkItem }
  | { type: "trace"; data: Trace }
  | { type: "error"; message: string };

// Initial state sent when client connects
export interface InitialState {
  workers: Worker[];
  workItems: WorkItem[];
  traces: Trace[];
}

// Room types for subscriptions
export type RoomType = "global" | `worker:${string}` | `work_item:${string}`;

// WebSocket connection with metadata
export interface WebSocketConnection {
  id: string;
  socket: any; // WebSocket instance
  rooms: Set<RoomType>;
}
