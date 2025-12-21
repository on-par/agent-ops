import { useState } from "react";
import {
  Columns3,
  Plus,
  MoreHorizontal,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  GripVertical,
  Bot,
  Tag,
} from "lucide-react";

// Mock kanban data
const initialColumns = [
  {
    id: "backlog",
    title: "Backlog",
    color: "var(--text-muted)",
    tasks: [
      {
        id: "task-1",
        title: "Implement OAuth2 flow",
        description: "Add social login support",
        priority: "high",
        agent: "CodeReviewer-A1",
        tags: ["auth", "feature"],
      },
      {
        id: "task-2",
        title: "Database migration script",
        description: "Migrate user table to new schema",
        priority: "medium",
        agent: null,
        tags: ["database"],
      },
    ],
  },
  {
    id: "todo",
    title: "To Do",
    color: "var(--blue)",
    tasks: [
      {
        id: "task-3",
        title: "API rate limiting",
        description: "Implement rate limiting middleware",
        priority: "high",
        agent: "SecurityScanner",
        tags: ["api", "security"],
      },
      {
        id: "task-4",
        title: "Unit tests for payment service",
        description: "Coverage target: 85%",
        priority: "medium",
        agent: "TestGenerator",
        tags: ["testing"],
      },
    ],
  },
  {
    id: "in-progress",
    title: "In Progress",
    color: "var(--amber)",
    tasks: [
      {
        id: "task-5",
        title: "Optimize database queries",
        description: "Fix N+1 queries in user repository",
        priority: "high",
        agent: "RefactorBot",
        tags: ["performance", "database"],
      },
      {
        id: "task-6",
        title: "Document API endpoints",
        description: "OpenAPI 3.1 specification",
        priority: "low",
        agent: "DocWriter",
        tags: ["documentation"],
      },
    ],
  },
  {
    id: "review",
    title: "Review",
    color: "var(--violet)",
    tasks: [
      {
        id: "task-7",
        title: "PR #247: User authentication",
        description: "feat/user-auth branch ready for review",
        priority: "high",
        agent: "CodeReviewer-A1",
        tags: ["pr", "auth"],
      },
    ],
  },
  {
    id: "done",
    title: "Done",
    color: "var(--emerald)",
    tasks: [
      {
        id: "task-8",
        title: "Setup CI/CD pipeline",
        description: "GitHub Actions workflow configured",
        priority: "medium",
        agent: "Deployer-D4",
        tags: ["devops"],
      },
      {
        id: "task-9",
        title: "Security audit",
        description: "Completed vulnerability scan",
        priority: "high",
        agent: "SecurityScanner",
        tags: ["security"],
      },
    ],
  },
];

const priorityColors: Record<string, string> = {
  high: "var(--rose)",
  medium: "var(--amber)",
  low: "var(--emerald)",
};

const tagColors: Record<string, string> = {
  auth: "var(--cyan-glow)",
  feature: "var(--blue)",
  database: "var(--violet)",
  api: "var(--amber)",
  security: "var(--rose)",
  testing: "var(--emerald)",
  performance: "var(--amber)",
  documentation: "var(--text-muted)",
  pr: "var(--violet)",
  devops: "var(--cyan-glow)",
};

function TaskCard({ task }: { task: (typeof initialColumns)[0]["tasks"][0] }) {
  return (
    <div className="group bg-[var(--bg-elevated)] rounded-xl p-4 border border-white/[0.04] hover:border-[var(--cyan-glow)]/20 transition-all cursor-grab active:cursor-grabbing">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: priorityColors[task.priority] }}
          />
          <span className="font-mono text-[10px] uppercase text-[var(--text-muted)]">
            {task.priority}
          </span>
        </div>
        <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-all">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      <h4 className="font-medium text-[var(--text-primary)] text-sm mb-1">
        {task.title}
      </h4>
      <p className="text-xs text-[var(--text-muted)] mb-3">{task.description}</p>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {task.tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase"
            style={{
              backgroundColor: `color-mix(in srgb, ${tagColors[tag] || "var(--text-muted)"} 15%, transparent)`,
              color: tagColors[tag] || "var(--text-muted)",
            }}
          >
            <Tag className="w-2.5 h-2.5" />
            {tag}
          </span>
        ))}
      </div>

      {/* Agent */}
      {task.agent && (
        <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04]">
          <div className="w-5 h-5 rounded bg-[var(--cyan-glow)]/10 flex items-center justify-center">
            <Bot className="w-3 h-3 text-[var(--cyan-glow)]" />
          </div>
          <span className="text-xs text-[var(--cyan-glow)] font-medium">
            {task.agent}
          </span>
        </div>
      )}

      {/* Drag handle */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="w-4 h-4 text-[var(--text-muted)]" />
      </div>
    </div>
  );
}

function KanbanColumn({
  column,
}: {
  column: (typeof initialColumns)[0];
}) {
  const statusIcons: Record<string, React.ReactNode> = {
    backlog: <Clock className="w-4 h-4" />,
    todo: <AlertCircle className="w-4 h-4" />,
    "in-progress": <Loader2 className="w-4 h-4 animate-spin" />,
    review: <AlertCircle className="w-4 h-4" />,
    done: <CheckCircle2 className="w-4 h-4" />,
  };

  return (
    <div className="flex-shrink-0 w-[320px]">
      {/* Column Header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: `color-mix(in srgb, ${column.color} 15%, transparent)`,
              color: column.color,
            }}
          >
            {statusIcons[column.id]}
          </div>
          <h3 className="font-semibold text-[var(--text-primary)]">
            {column.title}
          </h3>
          <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)]">
            {column.tasks.length}
          </span>
        </div>
        <button className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Tasks */}
      <div className="space-y-3 min-h-[200px] p-2 rounded-xl bg-[var(--bg-card)]/50 border border-white/[0.02]">
        {column.tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}

        {/* Add task button */}
        <button className="w-full p-3 rounded-xl border border-dashed border-white/[0.08] text-[var(--text-muted)] hover:border-[var(--cyan-glow)]/30 hover:text-[var(--cyan-glow)] transition-all flex items-center justify-center gap-2 text-sm">
          <Plus className="w-4 h-4" />
          Add task
        </button>
      </div>
    </div>
  );
}

export function Kanban() {
  const [columns] = useState(initialColumns);

  const totalTasks = columns.reduce((acc, col) => acc + col.tasks.length, 0);
  const inProgressCount = columns.find((c) => c.id === "in-progress")?.tasks.length || 0;

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] relative">
      {/* Grid background */}
      <div className="grid-bg" />

      <div className="relative z-10 p-6 lg:p-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[var(--cyan-glow)]/10 border border-[var(--cyan-glow)]/20 flex items-center justify-center">
              <Columns3 className="w-6 h-6 text-[var(--cyan-glow)]" />
            </div>
            <div>
              <h1 className="text-[28px] font-semibold text-[var(--text-primary)] tracking-tight">
                Kanban Board
              </h1>
              <p className="text-sm text-[var(--text-muted)]">
                Visualize and manage tasks across stages
              </p>
            </div>
          </div>

          <button className="btn-primary-gradient flex items-center gap-2 px-5 py-2.5 text-[var(--bg-deep)] text-sm font-semibold rounded-xl">
            <Plus className="w-[18px] h-[18px]" />
            New Task
          </button>
        </header>

        {/* Quick Stats */}
        <div className="flex items-center gap-6 mb-8">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--text-secondary)]">
              <span className="text-[var(--text-primary)] font-semibold font-mono">
                {totalTasks}
              </span>{" "}
              total tasks
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--amber)] animate-blink" />
            <span className="text-sm text-[var(--text-secondary)]">
              <span className="text-[var(--amber)] font-semibold font-mono">
                {inProgressCount}
              </span>{" "}
              in progress
            </span>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-6 min-w-max">
            {columns.map((column, i) => (
              <div
                key={column.id}
                className="animate-slide-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <KanbanColumn column={column} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
