import { useState } from "react";
import {
  FileText,
  Plus,
  Search,
  MoreHorizontal,
  Copy,
  Edit3,
  Play,
  Clock,
  Zap,
  Bot,
  Code2,
  TestTube2,
  Shield,
  GitBranch,
} from "lucide-react";

// Mock templates data
const mockTemplates = [
  {
    id: "code-review",
    name: "Code Review",
    description: "Automated PR review with security and best practices checks",
    icon: Code2,
    color: "var(--cyan-glow)",
    agent: "CodeReviewer-A1",
    usageCount: 1247,
    avgDuration: "2.3m",
    lastUsed: "2 hours ago",
    steps: ["Analyze PR diff", "Check code style", "Security scan", "Generate report"],
  },
  {
    id: "unit-tests",
    name: "Unit Test Generation",
    description: "Generate comprehensive unit tests with target coverage",
    icon: TestTube2,
    color: "var(--emerald)",
    agent: "TestGenerator",
    usageCount: 3891,
    avgDuration: "4.1m",
    lastUsed: "15 minutes ago",
    steps: ["Parse source files", "Identify test cases", "Generate tests", "Run coverage"],
  },
  {
    id: "security-audit",
    name: "Security Audit",
    description: "Full security vulnerability scan and compliance check",
    icon: Shield,
    color: "var(--rose)",
    agent: "SecurityScanner",
    usageCount: 2156,
    avgDuration: "5.2m",
    lastUsed: "1 day ago",
    steps: ["Dependency scan", "OWASP checks", "Secret detection", "Generate report"],
  },
  {
    id: "branch-merge",
    name: "Branch Management",
    description: "Automated branch merging with conflict resolution",
    icon: GitBranch,
    color: "var(--violet)",
    agent: "BranchManager",
    usageCount: 567,
    avgDuration: "6.4m",
    lastUsed: "4 hours ago",
    steps: ["Fetch changes", "Resolve conflicts", "Run tests", "Merge branch"],
  },
];

function TemplateCard({ template }: { template: (typeof mockTemplates)[0] }) {
  const Icon = template.icon;

  return (
    <div className="group card-hover bg-[var(--bg-card)] rounded-2xl border border-white/[0.04] overflow-hidden">
      {/* Header with colored accent */}
      <div
        className="h-1"
        style={{ backgroundColor: template.color }}
      />

      <div className="p-5">
        {/* Icon and Title */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: `color-mix(in srgb, ${template.color} 15%, transparent)`,
                color: template.color,
              }}
            >
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-[var(--text-primary)]">
                {template.name}
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Bot className="w-3 h-3 text-[var(--cyan-glow)]" />
                <span className="text-xs text-[var(--cyan-glow)]">
                  {template.agent}
                </span>
              </div>
            </div>
          </div>

          {/* More options */}
          <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-all">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* Description */}
        <p className="text-sm text-[var(--text-muted)] mb-4">
          {template.description}
        </p>

        {/* Steps preview */}
        <div className="mb-4">
          <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider mb-2">
            Steps
          </div>
          <div className="flex flex-wrap gap-1.5">
            {template.steps.map((step, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--bg-elevated)] text-[11px] text-[var(--text-secondary)]"
              >
                <span className="w-4 h-4 rounded bg-[var(--bg-hover)] flex items-center justify-center text-[10px] font-mono text-[var(--text-muted)]">
                  {i + 1}
                </span>
                {step}
              </span>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 pt-4 border-t border-white/[0.04]">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span className="font-mono text-xs text-[var(--text-secondary)]">
              {template.usageCount.toLocaleString()} runs
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span className="font-mono text-xs text-[var(--text-secondary)]">
              ~{template.avgDuration}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4">
          <button
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{
              backgroundColor: `color-mix(in srgb, ${template.color} 15%, transparent)`,
              color: template.color,
            }}
          >
            <Play className="w-4 h-4" />
            Run
          </button>
          <button className="p-2.5 rounded-xl bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all">
            <Edit3 className="w-4 h-4" />
          </button>
          <button className="p-2.5 rounded-xl bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all">
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Templates() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTemplates = mockTemplates.filter((template) =>
    template.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalRuns = mockTemplates.reduce((acc, t) => acc + t.usageCount, 0);

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] relative">
      {/* Grid background */}
      <div className="grid-bg" />

      <div className="relative z-10 p-6 lg:p-8 max-w-[1600px] mx-auto">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[var(--cyan-glow)]/10 border border-[var(--cyan-glow)]/20 flex items-center justify-center">
              <FileText className="w-6 h-6 text-[var(--cyan-glow)]" />
            </div>
            <div>
              <h1 className="text-[28px] font-semibold text-[var(--text-primary)] tracking-tight">
                Templates
              </h1>
              <p className="text-sm text-[var(--text-muted)]">
                Reusable task workflows for your agents
              </p>
            </div>
          </div>

          <button className="btn-primary-gradient flex items-center gap-2 px-5 py-2.5 text-[var(--bg-deep)] text-sm font-semibold rounded-xl">
            <Plus className="w-[18px] h-[18px]" />
            New Template
          </button>
        </header>

        {/* Quick Stats */}
        <div className="flex items-center gap-6 mb-8">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--text-secondary)]">
              <span className="text-[var(--text-primary)] font-semibold font-mono">
                {mockTemplates.length}
              </span>{" "}
              templates
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[var(--text-muted)]" />
            <span className="text-sm text-[var(--text-secondary)]">
              <span className="text-[var(--emerald)] font-semibold font-mono">
                {totalRuns.toLocaleString()}
              </span>{" "}
              total runs
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-card)] border border-white/[0.06] rounded-xl
                       text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                       focus:outline-none focus:border-[var(--cyan-glow)]/30 focus:ring-1 focus:ring-[var(--cyan-glow)]/20
                       transition-all"
            />
          </div>
        </div>

        {/* Templates Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredTemplates.map((template, i) => (
            <div
              key={template.id}
              className="animate-slide-up"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <TemplateCard template={template} />
            </div>
          ))}

          {/* Add new template card */}
          <div
            className="animate-slide-up"
            style={{ animationDelay: `${filteredTemplates.length * 50}ms` }}
          >
            <button className="w-full h-full min-h-[300px] rounded-2xl border-2 border-dashed border-white/[0.08] hover:border-[var(--cyan-glow)]/30 bg-[var(--bg-card)]/50 flex flex-col items-center justify-center gap-3 text-[var(--text-muted)] hover:text-[var(--cyan-glow)] transition-all">
              <div className="w-12 h-12 rounded-xl bg-[var(--bg-elevated)] flex items-center justify-center">
                <Plus className="w-6 h-6" />
              </div>
              <span className="font-medium">Create New Template</span>
            </button>
          </div>
        </div>

        {filteredTemplates.length === 0 && (
          <div className="text-center py-16">
            <FileText className="w-16 h-16 text-[var(--text-muted)]/30 mx-auto mb-4" />
            <p className="text-[var(--text-muted)]">No templates found</p>
          </div>
        )}
      </div>
    </div>
  );
}
