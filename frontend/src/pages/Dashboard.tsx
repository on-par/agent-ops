import { useState } from "react";
import {
  Search,
  Plus,
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  ClipboardList,
  ChevronRight,
  Check,
  AlertTriangle,
  XCircle,
  Loader2,
} from "lucide-react";

// Stats data
const stats = [
  {
    label: "Active Agents",
    value: "12",
    change: "+3 from yesterday",
    trend: "up",
    icon: Users,
    iconClass: "stat-icon-cyan",
    accent: "var(--cyan-glow)",
  },
  {
    label: "Tasks Completed",
    value: "1,847",
    change: "+12.5% this week",
    trend: "up",
    icon: CheckCircle2,
    iconClass: "stat-icon-emerald",
    accent: "var(--emerald)",
  },
  {
    label: "In Queue",
    value: "38",
    change: "-8 from peak",
    trend: "down",
    icon: Clock,
    iconClass: "stat-icon-amber",
    accent: "var(--amber)",
  },
  {
    label: "Success Rate",
    value: "98.7%",
    change: "+0.3% improvement",
    trend: "up",
    icon: Activity,
    iconClass: "stat-icon-violet",
    accent: "var(--violet)",
  },
];

// Active agents data
const activeAgents = [
  {
    id: 1,
    name: "CodeReviewer-A1",
    type: "Code Analysis",
    emoji: "🤖",
    tasks: 247,
    rate: 99.2,
    status: "active",
    gradient: "from-cyan-500 to-blue-600",
  },
  {
    id: 2,
    name: "DataProcessor-B2",
    type: "ETL Pipeline",
    emoji: "🔍",
    tasks: "1.2k",
    rate: 98.8,
    status: "active",
    gradient: "from-violet-500 to-pink-500",
  },
  {
    id: 3,
    name: "ReportGen-C3",
    type: "Analytics",
    emoji: "📊",
    tasks: 89,
    rate: 100,
    status: "idle",
    gradient: "from-amber-400 to-orange-500",
  },
  {
    id: 4,
    name: "Deployer-D4",
    type: "CI/CD",
    emoji: "🚀",
    tasks: 156,
    rate: 97.4,
    status: "active",
    gradient: "from-emerald-500 to-cyan-500",
  },
  {
    id: 5,
    name: "Monitor-E5",
    type: "Health Check",
    emoji: "⚠️",
    tasks: 43,
    rate: 82.1,
    status: "error",
    gradient: "from-red-500 to-orange-500",
  },
  {
    id: 6,
    name: "TestRunner-F6",
    type: "QA Automation",
    emoji: "🧪",
    tasks: 312,
    rate: 99.7,
    status: "active",
    gradient: "from-indigo-500 to-violet-600",
  },
];

// Live activity data
const liveActivity = [
  {
    id: 1,
    message: "Code review completed",
    agent: "CodeReviewer-A1",
    time: "2s ago",
    status: "success",
  },
  {
    id: 2,
    message: "Processing data batch #4821",
    agent: "DataProcessor-B2",
    time: "15s ago",
    status: "pending",
  },
  {
    id: 3,
    message: "Deployment to staging",
    agent: "Deployer-D4",
    time: "1m ago",
    status: "success",
  },
  {
    id: 4,
    message: "High memory usage detected",
    agent: "Monitor-E5",
    time: "3m ago",
    status: "warning",
  },
  {
    id: 5,
    message: "All tests passed (156/156)",
    agent: "TestRunner-F6",
    time: "5m ago",
    status: "success",
  },
  {
    id: 6,
    message: "Connection timeout to API",
    agent: "Monitor-E5",
    time: "8m ago",
    status: "error",
  },
];

// Up next queue
const upNextTasks = [
  {
    id: 1,
    title: "Security audit scan",
    subtitle: "Assigned to CodeReviewer-A1",
    status: "ASSIGNED",
    priority: "high",
  },
  {
    id: 2,
    title: "Daily report generation",
    subtitle: "Template: analytics-daily",
    status: "WAITING",
    priority: "medium",
  },
  {
    id: 3,
    title: "Database backup",
    subtitle: "Scheduled: 02:00 UTC",
    status: "WAITING",
    priority: "low",
  },
];

// Chart bar data
const chartBars = [
  { completed: 60, pending: 15 },
  { completed: 75, pending: 20 },
  { completed: 45, pending: 10 },
  { completed: 90, pending: 25 },
  { completed: 70, pending: 18 },
  { completed: 85, pending: 22 },
  { completed: 55, pending: 12 },
  { completed: 95, pending: 8 },
];

// Chart time periods
const timePeriods = ["24h", "7d", "30d"];

function StatCard({ stat, index }: { stat: (typeof stats)[0]; index: number }) {
  const Icon = stat.icon;

  return (
    <div
      className="card-hover bg-[var(--bg-card)] rounded-2xl p-5 border border-white/[0.04] animate-slide-up"
      style={{
        animationDelay: `${index * 50}ms`,
        ["--card-accent" as string]: stat.accent,
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-[13px] font-medium text-[var(--text-secondary)] uppercase tracking-wide">
          {stat.label}
        </span>
        <div
          className={`w-9 h-9 rounded-xl ${stat.iconClass} flex items-center justify-center`}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div
        className={`font-mono text-[32px] font-semibold text-[var(--text-primary)] mb-2 tracking-tight ${stat.label === "Active Agents" ? "text-glow-cyan" : ""}`}
      >
        {stat.value}
      </div>
      <div
        className={`flex items-center gap-1 text-xs font-medium ${stat.trend === "up" ? "text-[var(--emerald)]" : "text-[var(--rose)]"}`}
      >
        {stat.trend === "up" ? (
          <TrendingUp className="w-3.5 h-3.5" />
        ) : (
          <TrendingDown className="w-3.5 h-3.5" />
        )}
        {stat.change}
      </div>
    </div>
  );
}

function ThroughputChart({
  selectedPeriod,
  onPeriodChange,
}: {
  selectedPeriod: string;
  onPeriodChange: (p: string) => void;
}) {
  const yLabels = ["200", "150", "100", "50", "0"];
  const xLabels = [
    "00:00",
    "03:00",
    "06:00",
    "09:00",
    "12:00",
    "15:00",
    "18:00",
    "21:00",
  ];

  return (
    <div className="bg-[var(--bg-card)] rounded-2xl p-6 border border-white/[0.04] animate-slide-up">
      <div className="flex items-center justify-between mb-5">
        <h2 className="flex items-center gap-2.5 text-[var(--text-primary)] font-semibold text-base">
          <BarChart3 className="w-5 h-5 text-[var(--cyan-glow)]" />
          Task Throughput
        </h2>
        <div className="tab-container flex gap-1">
          {timePeriods.map((period) => (
            <button
              key={period}
              onClick={() => onPeriodChange(period)}
              className={`tab-item ${selectedPeriod === period ? "active" : ""}`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* Chart area with bar chart */}
      <div className="relative h-64">
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-8 w-10 flex flex-col justify-between text-right pr-2">
          {yLabels.map((label) => (
            <span key={label} className="font-mono text-[11px] text-[var(--text-muted)]">
              {label}
            </span>
          ))}
        </div>

        {/* Chart grid and bars */}
        <div className="ml-12 h-full relative border-l border-b border-white/[0.06]">
          {/* Grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            {yLabels.map((_, i) => (
              <div key={i} className="border-t border-dashed border-white/[0.04]" />
            ))}
          </div>

          {/* Bar chart */}
          <div className="absolute left-0 right-0 top-0 bottom-8 flex items-end justify-around px-5 gap-4">
            {chartBars.map((bar, i) => (
              <div key={i} className="flex-1 max-w-[60px] h-full flex items-end gap-1">
                <div
                  className="flex-1 rounded-t transition-all duration-300 hover:brightness-125 cursor-pointer"
                  style={{
                    height: `${bar.completed}%`,
                    background: 'linear-gradient(180deg, var(--emerald), rgba(16, 185, 129, 0.3))'
                  }}
                />
                <div
                  className="flex-1 rounded-t transition-all duration-300 hover:brightness-125 cursor-pointer"
                  style={{
                    height: `${bar.pending}%`,
                    background: 'linear-gradient(180deg, var(--amber), rgba(245, 158, 11, 0.3))'
                  }}
                />
              </div>
            ))}
          </div>

          {/* X-axis labels */}
          <div className="absolute -bottom-6 left-0 right-0 flex justify-around">
            {xLabels.map((label) => (
              <span key={label} className="font-mono text-[11px] text-[var(--text-muted)]">
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-6 pt-4 border-t border-white/[0.04]">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded bg-[var(--emerald)]" />
          <span className="text-[13px] text-[var(--text-secondary)]">Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded bg-[var(--amber)]" />
          <span className="text-[13px] text-[var(--text-secondary)]">Pending</span>
        </div>
      </div>
    </div>
  );
}

function ActiveAgentsGrid() {
  return (
    <div className="bg-[var(--bg-card)] rounded-2xl p-6 border border-white/[0.04] animate-slide-up">
      <div className="flex items-center justify-between mb-5">
        <h2 className="flex items-center gap-2.5 text-[var(--text-primary)] font-semibold text-base">
          <Users className="w-5 h-5 text-[var(--cyan-glow)]" />
          Active Agents
        </h2>
        <button className="text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1">
          View all <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {activeAgents.map((agent) => (
          <div
            key={agent.id}
            className="bg-[var(--bg-elevated)] rounded-xl p-4 hover:bg-[var(--bg-hover)] transition-all cursor-pointer border border-transparent hover:border-[var(--cyan-glow)]/10"
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`relative w-10 h-10 rounded-xl bg-gradient-to-br ${agent.gradient} flex items-center justify-center text-lg ${agent.status === "active" ? "status-active" : agent.status === "idle" ? "status-idle" : "status-error"}`}
              >
                {agent.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[var(--text-primary)] text-sm truncate">
                  {agent.name}
                </div>
                <div className="text-xs text-[var(--text-muted)]">{agent.type}</div>
              </div>
            </div>
            <div className="flex items-center justify-between font-mono text-xs">
              <div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">
                  Tasks
                </div>
                <div className="text-[var(--text-primary)] font-medium">
                  {agent.tasks}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">
                  Rate
                </div>
                <div
                  className={`font-medium ${agent.rate >= 95 ? "text-[var(--emerald)]" : agent.rate >= 85 ? "text-[var(--amber)]" : "text-[var(--rose)]"}`}
                >
                  {agent.rate}%
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveActivityFeed() {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <Check className="w-4 h-4" />;
      case "pending":
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4" />;
      case "error":
        return <XCircle className="w-4 h-4" />;
      default:
        return <Check className="w-4 h-4" />;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case "success":
        return "activity-success";
      case "pending":
        return "activity-pending";
      case "warning":
        return "activity-warning";
      case "error":
        return "activity-error";
      default:
        return "activity-success";
    }
  };

  return (
    <div className="bg-[var(--bg-card)] rounded-2xl p-6 border border-white/[0.04] animate-slide-up">
      <h2 className="flex items-center gap-2.5 text-[var(--text-primary)] font-semibold text-base mb-5">
        <Activity className="w-5 h-5 text-[var(--cyan-glow)]" />
        Live Activity
      </h2>

      <div className="space-y-1 max-h-[400px] overflow-y-auto">
        {liveActivity.map((item, i) => (
          <div
            key={item.id}
            className="flex items-start gap-3 p-3 rounded-xl hover:bg-[var(--bg-elevated)] transition-colors animate-slide-in"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div
              className={`w-8 h-8 rounded-lg ${getStatusClass(item.status)} flex items-center justify-center flex-shrink-0`}
            >
              {getStatusIcon(item.status)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-[var(--text-primary)]">
                {item.message}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-medium text-[var(--cyan-glow)]">
                  {item.agent}
                </span>
                <span className="font-mono text-[11px] text-[var(--text-muted)]">
                  {item.time}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UpNextQueue() {
  const getPriorityClass = (priority: string) => {
    switch (priority) {
      case "high":
        return "priority-high";
      case "medium":
        return "priority-medium";
      case "low":
        return "priority-low";
      default:
        return "priority-medium";
    }
  };

  const getStatusClass = (status: string) => {
    return status === "ASSIGNED" ? "badge-assigned" : "badge-waiting";
  };

  return (
    <div className="bg-[var(--bg-card)] rounded-2xl p-6 border border-white/[0.04] animate-slide-up">
      <h2 className="flex items-center gap-2.5 text-[var(--text-primary)] font-semibold text-base mb-5">
        <ClipboardList className="w-5 h-5 text-[var(--cyan-glow)]" />
        Up Next
      </h2>

      <div className="space-y-2">
        {upNextTasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <div className={`w-1 h-8 rounded ${getPriorityClass(task.priority)}`} />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                {task.title}
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5">
                {task.subtitle}
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase ${getStatusClass(task.status)}`}
            >
              {task.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Dashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState("24h");

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] relative">
      {/* Grid background */}
      <div className="grid-bg" />

      <div className="relative z-10 p-6 lg:p-8 max-w-[1600px] mx-auto">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 animate-fade-in">
          <h1 className="text-[28px] font-semibold text-[var(--text-primary)] flex items-center gap-3 tracking-tight">
            Mission Control
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--emerald)]/10 border border-[var(--emerald)]/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--emerald)] animate-blink" />
              <span className="text-xs font-medium text-[var(--emerald)]">LIVE</span>
            </span>
          </h1>

          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search agents, tasks..."
                className="w-[280px] pl-10 pr-14 py-2.5 bg-[var(--bg-card)] border border-white/[0.06] rounded-xl
                         text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                         focus:outline-none focus:border-[var(--cyan-glow)]/30 focus:ring-1 focus:ring-[var(--cyan-glow)]/20
                         transition-all"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-[var(--text-muted)] bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded">
                ⌘K
              </kbd>
            </div>

            {/* New Task Button */}
            <button className="btn-primary-gradient flex items-center gap-2 px-5 py-2.5 text-[var(--bg-deep)] text-sm font-semibold rounded-xl">
              <Plus className="w-[18px] h-[18px]" />
              New Task
            </button>

            {/* Avatar */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-rose-500 flex items-center justify-center text-white font-semibold text-sm cursor-pointer border-2 border-transparent hover:border-[var(--cyan-glow)] transition-colors">
              PR
            </div>
          </div>
        </header>

        {/* Stats Row */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat, i) => (
            <StatCard key={stat.label} stat={stat} index={i} />
          ))}
        </section>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
          {/* Left Column - Charts & Agents */}
          <div className="space-y-6">
            <ThroughputChart
              selectedPeriod={selectedPeriod}
              onPeriodChange={setSelectedPeriod}
            />
            <ActiveAgentsGrid />
          </div>

          {/* Right Column - Activity & Queue */}
          <div className="space-y-6">
            <LiveActivityFeed />
            <UpNextQueue />
          </div>
        </div>
      </div>
    </div>
  );
}
