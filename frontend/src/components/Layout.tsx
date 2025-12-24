import { useState, useEffect } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Columns3,
  Bot,
  FileText,
  Settings,
  Menu,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/kanban", label: "Kanban Board", icon: Columns3 },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/templates", label: "Templates", icon: FileText },
] as const;

export function Layout() {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu on route change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: sync mobile menu state with route
    setIsMobileOpen(false);
  }, [location]);

  return (
    <div className="flex h-screen bg-[var(--bg-deep)]">
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar - Icon only */}
      <aside
        className={`
          fixed md:relative z-50
          w-[72px] h-full
          bg-[var(--bg-card)] border-r border-[var(--cyan-glow)]/10
          flex flex-col items-center
          py-5
          transition-transform duration-300 ease-in-out
          ${isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Logo with pulsing glow */}
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[var(--cyan-glow)] to-[var(--violet)] flex items-center justify-center mb-6 animate-pulse-glow">
          <span className="text-white font-bold text-lg">AO</span>
        </div>

        {/* Mobile close button */}
        <button
          onClick={() => setIsMobileOpen(false)}
          className="md:hidden absolute top-4 right-2 p-1 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col items-center gap-2 w-full px-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `group relative w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-200 ${
                  isActive
                    ? "bg-[var(--cyan-glow)]/10 text-[var(--cyan-glow)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active indicator bar */}
                  {isActive && (
                    <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-[var(--cyan-glow)] rounded-r glow-cyan" />
                  )}
                  <Icon className="w-[22px] h-[22px]" />
                  {/* Tooltip */}
                  <div
                    className="
                      absolute left-full ml-4 px-3 py-2
                      bg-[var(--bg-card)] border border-[var(--cyan-glow)]/10 rounded-lg
                      text-xs font-medium text-[var(--text-primary)] whitespace-nowrap
                      opacity-0 invisible group-hover:opacity-100 group-hover:visible
                      transition-all duration-200 z-50
                      shadow-xl
                    "
                  >
                    {label}
                  </div>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Settings at bottom */}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `group relative w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-200 ${
              isActive
                ? "bg-[var(--cyan-glow)]/10 text-[var(--cyan-glow)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-[var(--cyan-glow)] rounded-r glow-cyan" />
              )}
              <Settings className="w-[22px] h-[22px]" />
              <div
                className="
                  absolute left-full ml-4 px-3 py-2
                  bg-[var(--bg-card)] border border-[var(--cyan-glow)]/10 rounded-lg
                  text-xs font-medium text-[var(--text-primary)] whitespace-nowrap
                  opacity-0 invisible group-hover:opacity-100 group-hover:visible
                  transition-all duration-200 z-50
                  shadow-xl
                "
              >
                Settings
              </div>
            </>
          )}
        </NavLink>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-[var(--cyan-glow)]/10 bg-[var(--bg-card)]">
          <button
            onClick={() => setIsMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--cyan-glow)] to-[var(--violet)] flex items-center justify-center animate-pulse-glow">
            <span className="text-white font-bold text-xs">AO</span>
          </div>
          <span className="font-semibold text-[var(--text-primary)]">Agent Ops</span>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
