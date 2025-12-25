/**
 * Dashboard types matching backend DashboardStats structure
 * These types are used for displaying aggregated statistics on the dashboard
 */

/**
 * Work item status values
 */
export type WorkItemStatus = 'backlog' | 'ready' | 'in_progress' | 'review' | 'done';

/**
 * Work item type values
 */
export type WorkItemType = 'task' | 'bug' | 'feature' | 'epic';

/**
 * Work item priority values
 */
export type WorkItemPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Repository sync status values
 */
export type RepoSyncStatus = 'pending' | 'syncing' | 'synced' | 'error';

/**
 * Worker/Agent status values
 */
export type WorkerStatus = 'idle' | 'working' | 'paused' | 'error' | 'terminated';

/**
 * Agent execution status values
 */
export type AgentExecutionStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled';

/**
 * Repository entity from backend
 */
export interface Repository {
  id: string;
  connectionId: string;
  githubRepoId: number;
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  description?: string;
  defaultBranch: string;
  isPrivate: boolean;
  syncEnabled: boolean;
  syncStatus: RepoSyncStatus;
  syncError?: string;
  lastSyncAt?: Date;
  issueLabelsFilter: string[];
  autoAssignAgents: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Worker/Agent entity from backend
 */
export interface Worker {
  id: string;
  templateId: string;
  status: WorkerStatus;
  currentWorkItemId?: string;
  currentRole?: string;
  sessionId: string;
  spawnedAt: Date;
  contextWindowUsed: number;
  contextWindowLimit: number;
  tokensUsed: number;
  costUsd: number;
  toolCalls: number;
  errors: number;
}

/**
 * Work item entity from backend
 */
export interface WorkItem {
  id: string;
  title: string;
  type: string;
  status: WorkItemStatus;
  repositoryId?: string;
  githubIssueId?: number;
  githubIssueNumber?: number;
  githubIssueUrl?: string;
  githubPrNumber?: number;
  githubPrUrl?: string;
  description: string;
  successCriteria: SuccessCriterion[];
  linkedFiles: string[];
  createdBy: string;
  assignedAgents: Record<string, string | undefined>;
  requiresApproval: Record<string, boolean>;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  parentId?: string;
  childIds: string[];
  blockedBy: string[];
}

/**
 * Success criterion for work items
 */
export interface SuccessCriterion {
  id: string;
  description: string;
  completed: boolean;
  verifiedBy?: string;
  verifiedAt?: number;
}

/**
 * Agent execution output
 */
export interface AgentExecutionOutput {
  summary?: string;
  filesChanged?: string[];
  testsRun?: boolean;
  testsPassed?: boolean;
  logs?: string[];
  diff?: string;
}

/**
 * Agent execution entity from backend
 */
export interface AgentExecution {
  id: string;
  workerId?: string;
  workItemId?: string;
  workspaceId?: string;
  templateId?: string;
  status: AgentExecutionStatus;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  tokensUsed: number;
  costUsd: number;
  toolCallsCount: number;
  errorMessage?: string;
  output?: AgentExecutionOutput;
  createdAt: Date;
}

/**
 * Repository statistics grouped by sync status
 */
export interface RepositoryStats {
  total: number;
  syncing: number;
  synced: number;
  error: number;
  items: Repository[];
}

/**
 * Agent/Worker statistics grouped by status
 */
export interface AgentStats {
  total: number;
  active: number;
  idle: number;
  working: number;
  error: number;
  items: Worker[];
}

/**
 * Work item statistics
 */
export interface WorkItemStats {
  byStatus: Record<WorkItemStatus, number>;
  recentCompletions: WorkItem[];
}

/**
 * Complete dashboard statistics aggregating all relevant data
 */
export interface DashboardStats {
  repositories: RepositoryStats;
  agents: AgentStats;
  workItems: WorkItemStats;
  recentActivity: AgentExecution[];
}
