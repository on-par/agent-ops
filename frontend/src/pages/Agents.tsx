import {
  Search,
  Bot,
  Zap,
  Users,
  Activity,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Code2,
  TestTube2,
  Wrench,
  Shield,
  FileCode,
  GitBranch,
  Plus,
} from "lucide-react";
import { useWorkersUIStore } from "../stores/workers.store";

// Mock data for agent cards
const mockAgents = [
  {
    id: "code-reviewer",
    name: "CodeReviewer",
    icon: Code2,
    status: "active",
    currentTask: "ANALYZING PULL REQUEST",
    context: "feat/user-auth #247",
    file: "src/auth/middleware.ts",
    progress: 73,
    followers: 9700,
    activity: [45, 62, 38, 71, 55, 82, 67, 91, 78, 85, 69, 94],
    tasksCompleted: 1247,
    avgTime: "2.3m",
    color: "cyan",
  },
  {
    id: "test-generator",
    name: "TestGenerator",
    icon: TestTube2,
    status: "active",
    currentTask: "GENERATING UNIT TESTS",
    context: "COVERAGE TARGET: 85%",
    file: "services/payment.service.ts",
    progress: 41,
    followers: 27803,
    activity: [23, 45, 67, 34, 56, 78, 45, 89, 67, 45, 78, 90],
    tasksCompleted: 3891,
    avgTime: "4.1m",
    color: "emerald",
  },
  {
    id: "refactor-bot",
    name: "RefactorBot",
    icon: Wrench,
    status: "active",
    currentTask: "OPTIMIZING DATABASE QUERIES",
    context: "N+1 DETECTION ACTIVE",
    file: "repositories/user.repository.ts",
    progress: 89,
    followers: 97007,
    activity: [78, 82, 75, 88, 91, 85, 79, 93, 87, 90, 84, 96],
    tasksCompleted: 8234,
    avgTime: "1.8m",
    color: "amber",
  },
  {
    id: "security-scanner",
    name: "SecurityScanner",
    icon: Shield,
    status: "idle",
    currentTask: "AWAITING DEPLOYMENT",
    context: "LAST SCAN: 2 HOURS AGO",
    file: "—",
    progress: 0,
    followers: 45231,
    activity: [12, 8, 15, 6, 0, 0, 0, 0, 0, 0, 0, 0],
    tasksCompleted: 2156,
    avgTime: "5.2m",
    color: "rose",
  },
  {
    id: "doc-writer",
    name: "DocWriter",
    icon: FileCode,
    status: "active",
    currentTask: "DOCUMENTING API ENDPOINTS",
    context: "OPENAPI 3.1 SPEC",
    file: "controllers/api.controller.ts",
    progress: 56,
    followers: 12450,
    activity: [34, 41, 52, 48, 63, 57, 71, 65, 74, 68, 79, 72],
    tasksCompleted: 1893,
    avgTime: "3.7m",
    color: "violet",
  },
  {
    id: "branch-manager",
    name: "BranchManager",
    icon: GitBranch,
    status: "paused",
    currentTask: "MERGE CONFLICT RESOLUTION",
    context: "BLOCKED: REQUIRES REVIEW",
    file: "main <- feature/payments",
    progress: 34,
    followers: 8923,
    activity: [56, 67, 72, 81, 45, 23, 12, 8, 5, 3, 2, 1],
    tasksCompleted: 567,
    avgTime: "6.4m",
    color: "blue",
  },
];

const colorMap: Record<
  string,
  { glow: string; bar: string; text: string; bg: string }
> = {
  cyan: {
    glow: "shadow-[0_0_20px_rgba(0,240,255,0.3)]",
    bar: "bg-[var(--cyan-glow)]",
    text: "text-[var(--cyan-glow)]",
    bg: "bg-[var(--cyan-glow)]/10",
  },
  emerald: {
    glow: "shadow-[0_0_20px_rgba(16,185,129,0.3)]",
    bar: "bg-[var(--emerald)]",
    text: "text-[var(--emerald)]",
    bg: "bg-[var(--emerald)]/10",
  },
  amber: {
    glow: "shadow-[0_0_20px_rgba(245,158,11,0.3)]",
    bar: "bg-[var(--amber)]",
    text: "text-[var(--amber)]",
    bg: "bg-[var(--amber)]/10",
  },
  rose: {
    glow: "shadow-[0_0_20px_rgba(244,63,94,0.3)]",
    bar: "bg-[var(--rose)]",
    text: "text-[var(--rose)]",
    bg: "bg-[var(--rose)]/10",
  },
  violet: {
    glow: "shadow-[0_0_20px_rgba(139,92,246,0.3)]",
    bar: "bg-[var(--violet)]",
    text: "text-[var(--violet)]",
    bg: "bg-[var(--violet)]/10",
  },
  blue: {
    glow: "shadow-[0_0_20px_rgba(59,130,246,0.3)]",
    bar: "bg-[var(--blue)]",
    text: "text-[var(--blue)]",
    bg: "bg-[var(--blue)]/10",
  },
};

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  return (
    <div className="flex items-end gap-[2px] h-8">
      {data.map((value, i) => {
        const height = ((value - min) / range) * 100;
        return (
          <div
            key={i}
            className={`w-1.5 rounded-sm ${colorMap[color].bar} opacity-60 transition-all duration-300`}
            style={{ height: `${Math.max(height, 8)}%` }}
          />
        );
      })}
    </div>
  );
}

function AgentCard({ agent }: { agent: (typeof mockAgents)[0] }) {
  const Icon = agent.icon;
  const colors = colorMap[agent.color];
  const isActive = agent.status === "active";
  const isPaused = agent.status === "paused";

  return (
    <div
      className={`
        relative group card-hover
        bg-[var(--bg-card)] backdrop-blur-sm
        border border-white/[0.04]
        rounded-2xl overflow-hidden
        transition-all duration-300
        ${isActive ? colors.glow : ""}
      `}
    >
      {/* Status indicator strip */}
      <div
        className={`
          absolute top-0 left-0 right-0 h-0.5
          ${isActive ? colors.bar : isPaused ? "bg-[var(--amber)]/50" : "bg-[var(--text-muted)]/30"}
        `}
      />

      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`
                w-10 h-10 rounded-xl
                bg-[var(--bg-elevated)] border border-white/[0.06]
                flex items-center justify-center
                ${isActive ? colors.text : "text-[var(--text-muted)]"}
              `}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-[var(--text-primary)] tracking-tight">
                {agent.name}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={`
                    inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider
                    ${isActive ? "text-[var(--emerald)]" : isPaused ? "text-[var(--amber)]" : "text-[var(--text-muted)]"}
                  `}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-[var(--emerald)] animate-blink" : isPaused ? "bg-[var(--amber)]" : "bg-[var(--text-muted)]"}`}
                  />
                  {agent.status}
                </span>
              </div>
            </div>
          </div>

          {/* Control buttons */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {isActive ? (
              <button className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                <Pause className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                <Play className="w-3.5 h-3.5" />
              </button>
            )}
            <button className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Current Task */}
      <div className="px-4 pb-3">
        <div className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
          Current Task
        </div>
        <div className={`font-mono text-xs ${colors.text} font-medium mb-1`}>
          {agent.currentTask}
        </div>
        <div className="font-mono text-[11px] text-[var(--text-secondary)] truncate">
          {agent.context}
        </div>
        {agent.file !== "—" && (
          <div className="font-mono text-[10px] text-[var(--text-muted)] mt-1 flex items-center gap-1">
            <FileCode className="w-3 h-3" />
            {agent.file}
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {agent.progress > 0 && (
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
              Progress
            </span>
            <span className={`font-mono text-xs font-semibold ${colors.text}`}>
              {agent.progress}%
            </span>
          </div>
          <div className="h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
            <div
              className={`h-full ${colors.bar} rounded-full transition-all duration-500 ease-out`}
              style={{ width: `${agent.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Activity Sparkline */}
      <div className="px-4 pb-3">
        <div className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">
          Activity
        </div>
        <MiniSparkline data={agent.activity} color={agent.color} />
      </div>

      {/* Stats Footer */}
      <div className="px-4 py-3 bg-[var(--bg-elevated)]/50 border-t border-white/[0.04]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <span className="font-mono text-xs text-[var(--text-secondary)]">
                {agent.followers.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <span className="font-mono text-xs text-[var(--text-secondary)]">
                {agent.tasksCompleted.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[var(--text-muted)]">
            <Activity className="w-3 h-3" />
            <span className="font-mono text-[10px]">{agent.avgTime}</span>
          </div>
        </div>
      </div>

      {/* Hover detail arrow */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0 translate-x-2">
        <ChevronRight className="w-5 h-5 text-[var(--text-muted)]" />
      </div>
    </div>
  );
}

export function Agents() {
  const searchQuery = useWorkersUIStore((state) => state.searchQuery);
  const statusFilter = useWorkersUIStore((state) => state.statusFilter);
  const setSearchQuery = useWorkersUIStore((state) => state.setSearchQuery);
  const setStatusFilter = useWorkersUIStore((state) => state.setStatusFilter);

  const filteredAgents = mockAgents.filter((agent) => {
    const matchesSearch = agent.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || agent.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeCount = mockAgents.filter((a) => a.status === "active").length;
  const totalTasks = mockAgents.reduce((acc, a) => acc + a.tasksCompleted, 0);

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] relative">
      {/* Grid background */}
      <div className="grid-bg" />

      <div className="relative z-10 p-6 lg:p-8 max-w-[1600px] mx-auto">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[var(--cyan-glow)]/10 border border-[var(--cyan-glow)]/20 flex items-center justify-center">
              <Bot className="w-6 h-6 text-[var(--cyan-glow)]" />
            </div>
            <div>
              <h1 className="text-[28px] font-semibold text-[var(--text-primary)] tracking-tight">
                Agent Operations
              </h1>
              <p className="text-sm text-[var(--text-muted)]">
                Real-time monitoring and control
              </p>
            </div>
          </div>

          <button className="btn-primary-gradient flex items-center gap-2 px-5 py-2.5 text-[var(--bg-deep)] text-sm font-semibold rounded-xl">
            <Plus className="w-[18px] h-[18px]" />
            New Agent
          </button>
        </header>

        {/* Quick Stats */}
        <div className="flex items-center gap-6 mb-8">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--emerald)] animate-blink" />
            <span className="text-sm text-[var(--text-secondary)]">
              <span className="text-[var(--emerald)] font-semibold font-mono">
                {activeCount}
              </span>{" "}
              active
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--text-muted)]" />
            <span className="text-sm text-[var(--text-secondary)]">
              <span className="text-[var(--text-primary)] font-semibold font-mono">
                {totalTasks.toLocaleString()}
              </span>{" "}
              tasks completed
            </span>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-card)] border border-white/[0.06] rounded-xl
                       text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                       focus:outline-none focus:border-[var(--cyan-glow)]/30 focus:ring-1 focus:ring-[var(--cyan-glow)]/20
                       transition-all"
            />
          </div>

          <div className="flex items-center gap-2">
            {(["all", "active", "paused", "idle"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status as any)}
                className={`
                  px-3 py-1.5 rounded-lg font-mono text-xs uppercase tracking-wider
                  transition-all
                  ${
                    statusFilter === status
                      ? "bg-[var(--cyan-glow)]/10 text-[var(--cyan-glow)] border border-[var(--cyan-glow)]/30"
                      : "bg-[var(--bg-card)] text-[var(--text-muted)] border border-white/[0.06] hover:bg-[var(--bg-hover)]"
                  }
                `}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Agent Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredAgents.map((agent, i) => (
            <div
              key={agent.id}
              className="animate-slide-up"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <AgentCard agent={agent} />
            </div>
          ))}
        </div>

        {filteredAgents.length === 0 && (
          <div className="text-center py-16">
            <Bot className="w-16 h-16 text-[var(--text-muted)]/30 mx-auto mb-4" />
            <p className="text-[var(--text-muted)]">No agents found</p>
          </div>
        )}
      </div>
    </div>
  );
}
