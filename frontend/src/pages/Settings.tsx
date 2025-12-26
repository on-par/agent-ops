import { useState } from "react";
import {
  Settings as SettingsIcon,
  User,
  Bell,
  Shield,
  Palette,
  Key,
  Globe,
  ChevronRight,
  Moon,
  Sun,
  Check,
  Bot,
  Zap,
  Database,
  Github,
} from "lucide-react";
import { ProviderSettings } from "../components/settings/ProviderSettings";
import { GitHubConnectionManager } from "../components/settings/GitHubConnectionManager";
import { ConnectedRepositoryList } from "../components/settings/ConnectedRepositoryList";

// Settings sections
const settingsSections = [
  {
    id: "profile",
    title: "Profile",
    description: "Manage your account information",
    icon: User,
    color: "var(--cyan-glow)",
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "Configure alert preferences",
    icon: Bell,
    color: "var(--amber)",
  },
  {
    id: "security",
    title: "Security",
    description: "Password and authentication",
    icon: Shield,
    color: "var(--rose)",
  },
  {
    id: "appearance",
    title: "Appearance",
    description: "Theme and display settings",
    icon: Palette,
    color: "var(--violet)",
  },
  {
    id: "api",
    title: "API Keys",
    description: "Manage API access tokens",
    icon: Key,
    color: "var(--emerald)",
  },
  {
    id: "integrations",
    title: "Integrations",
    description: "Connect external services",
    icon: Globe,
    color: "var(--blue)",
  },
  {
    id: "llm-providers",
    title: "LLM Providers",
    description: "Configure AI model connections",
    icon: Bot,
    color: "var(--violet)",
  },
  {
    id: "github",
    title: "GitHub Integration",
    description: "Connect repositories and sync issues",
    icon: Github,
    color: "var(--violet)",
  },
];

function SettingToggle({
  label,
  description,
  enabled,
  onChange,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-4">
      <div>
        <div className="font-medium text-[var(--text-primary)]">{label}</div>
        <div className="text-sm text-[var(--text-muted)]">{description}</div>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative w-12 h-7 rounded-full transition-colors ${
          enabled ? "bg-[var(--cyan-glow)]" : "bg-[var(--bg-elevated)]"
        }`}
      >
        <div
          className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function SettingSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--bg-card)] rounded-2xl border border-white/[0.04] overflow-hidden">
      <div className="px-6 py-4 border-b border-white/[0.04]">
        <h3 className="font-semibold text-[var(--text-primary)]">{title}</h3>
      </div>
      <div className="px-6 divide-y divide-white/[0.04]">{children}</div>
    </div>
  );
}

export function Settings() {
  const [activeSection, setActiveSection] = useState("profile");
  const [settings, setSettings] = useState({
    emailNotifications: true,
    pushNotifications: false,
    weeklyDigest: true,
    agentAlerts: true,
    twoFactorAuth: false,
    sessionTimeout: true,
    darkMode: true,
    compactView: false,
  });

  const updateSetting = (key: string, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] relative">
      {/* Grid background */}
      <div className="grid-bg" />

      <div className="relative z-10 p-6 lg:p-8 max-w-[1200px] mx-auto">
        {/* Header */}
        <header className="mb-8 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[var(--cyan-glow)]/10 border border-[var(--cyan-glow)]/20 flex items-center justify-center">
              <SettingsIcon className="w-6 h-6 text-[var(--cyan-glow)]" />
            </div>
            <div>
              <h1 className="text-[28px] font-semibold text-[var(--text-primary)] tracking-tight">
                Settings
              </h1>
              <p className="text-sm text-[var(--text-muted)]">
                Configure your Agent Ops preferences
              </p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Sidebar Navigation */}
          <nav className="space-y-1">
            {settingsSections.map((section, i) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;

              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all animate-slide-up ${
                    isActive
                      ? "bg-[var(--bg-card)] border border-[var(--cyan-glow)]/20"
                      : "hover:bg-[var(--bg-card)]/50"
                  }`}
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{
                      backgroundColor: isActive
                        ? `color-mix(in srgb, ${section.color} 15%, transparent)`
                        : "var(--bg-elevated)",
                      color: isActive ? section.color : "var(--text-muted)",
                    }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 text-left">
                    <div
                      className={`font-medium text-sm ${
                        isActive
                          ? "text-[var(--text-primary)]"
                          : "text-[var(--text-secondary)]"
                      }`}
                    >
                      {section.title}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {section.description}
                    </div>
                  </div>
                  {isActive && (
                    <ChevronRight
                      className="w-4 h-4 text-[var(--cyan-glow)]"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Content Area */}
          <div className="space-y-6 animate-fade-in">
            {activeSection === "profile" && (
              <>
                <SettingSection title="Account Information">
                  <div className="py-4">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-rose-500 flex items-center justify-center text-white text-2xl font-bold">
                        PR
                      </div>
                      <div>
                        <div className="font-semibold text-[var(--text-primary)]">
                          Phil Robinson
                        </div>
                        <div className="text-sm text-[var(--text-muted)]">
                          phil@agentops.io
                        </div>
                        <button className="mt-2 text-xs text-[var(--cyan-glow)] hover:underline">
                          Change avatar
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="py-4">
                    <label className="block text-sm text-[var(--text-muted)] mb-2">
                      Display Name
                    </label>
                    <input
                      type="text"
                      defaultValue="Phil Robinson"
                      className="w-full px-4 py-2.5 bg-[var(--bg-elevated)] border border-white/[0.06] rounded-xl
                               text-sm text-[var(--text-primary)]
                               focus:outline-none focus:border-[var(--cyan-glow)]/30 focus:ring-1 focus:ring-[var(--cyan-glow)]/20
                               transition-all"
                    />
                  </div>
                  <div className="py-4">
                    <label className="block text-sm text-[var(--text-muted)] mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      defaultValue="phil@agentops.io"
                      className="w-full px-4 py-2.5 bg-[var(--bg-elevated)] border border-white/[0.06] rounded-xl
                               text-sm text-[var(--text-primary)]
                               focus:outline-none focus:border-[var(--cyan-glow)]/30 focus:ring-1 focus:ring-[var(--cyan-glow)]/20
                               transition-all"
                    />
                  </div>
                </SettingSection>

                <SettingSection title="Usage Statistics">
                  <div className="py-4 grid grid-cols-3 gap-4">
                    <div className="bg-[var(--bg-elevated)] rounded-xl p-4">
                      <Bot className="w-5 h-5 text-[var(--cyan-glow)] mb-2" />
                      <div className="font-mono text-2xl font-semibold text-[var(--text-primary)]">
                        6
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">
                        Active Agents
                      </div>
                    </div>
                    <div className="bg-[var(--bg-elevated)] rounded-xl p-4">
                      <Zap className="w-5 h-5 text-[var(--emerald)] mb-2" />
                      <div className="font-mono text-2xl font-semibold text-[var(--text-primary)]">
                        17.8k
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">
                        Tasks Completed
                      </div>
                    </div>
                    <div className="bg-[var(--bg-elevated)] rounded-xl p-4">
                      <Database className="w-5 h-5 text-[var(--violet)] mb-2" />
                      <div className="font-mono text-2xl font-semibold text-[var(--text-primary)]">
                        2.4 GB
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">
                        Storage Used
                      </div>
                    </div>
                  </div>
                </SettingSection>
              </>
            )}

            {activeSection === "notifications" && (
              <SettingSection title="Notification Preferences">
                <SettingToggle
                  label="Email Notifications"
                  description="Receive updates via email"
                  enabled={settings.emailNotifications}
                  onChange={(v) => updateSetting("emailNotifications", v)}
                />
                <SettingToggle
                  label="Push Notifications"
                  description="Browser push notifications"
                  enabled={settings.pushNotifications}
                  onChange={(v) => updateSetting("pushNotifications", v)}
                />
                <SettingToggle
                  label="Weekly Digest"
                  description="Summary of agent activity"
                  enabled={settings.weeklyDigest}
                  onChange={(v) => updateSetting("weeklyDigest", v)}
                />
                <SettingToggle
                  label="Agent Alerts"
                  description="Real-time agent status changes"
                  enabled={settings.agentAlerts}
                  onChange={(v) => updateSetting("agentAlerts", v)}
                />
              </SettingSection>
            )}

            {activeSection === "security" && (
              <SettingSection title="Security Settings">
                <SettingToggle
                  label="Two-Factor Authentication"
                  description="Add an extra layer of security"
                  enabled={settings.twoFactorAuth}
                  onChange={(v) => updateSetting("twoFactorAuth", v)}
                />
                <SettingToggle
                  label="Session Timeout"
                  description="Auto-logout after 30 minutes of inactivity"
                  enabled={settings.sessionTimeout}
                  onChange={(v) => updateSetting("sessionTimeout", v)}
                />
                <div className="py-4">
                  <button className="px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all text-sm font-medium">
                    Change Password
                  </button>
                </div>
              </SettingSection>
            )}

            {activeSection === "appearance" && (
              <SettingSection title="Theme & Display">
                <div className="py-4">
                  <div className="font-medium text-[var(--text-primary)] mb-3">
                    Theme
                  </div>
                  <div className="flex gap-3">
                    <button
                      className={`flex-1 p-4 rounded-xl border transition-all ${
                        settings.darkMode
                          ? "border-[var(--cyan-glow)] bg-[var(--cyan-glow)]/5"
                          : "border-white/[0.06] hover:border-white/[0.12]"
                      }`}
                      onClick={() => updateSetting("darkMode", true)}
                    >
                      <Moon className="w-6 h-6 mx-auto mb-2 text-[var(--text-primary)]" />
                      <div className="text-sm text-[var(--text-primary)]">Dark</div>
                      {settings.darkMode && (
                        <Check className="w-4 h-4 mx-auto mt-2 text-[var(--cyan-glow)]" />
                      )}
                    </button>
                    <button
                      className={`flex-1 p-4 rounded-xl border transition-all ${
                        !settings.darkMode
                          ? "border-[var(--cyan-glow)] bg-[var(--cyan-glow)]/5"
                          : "border-white/[0.06] hover:border-white/[0.12]"
                      }`}
                      onClick={() => updateSetting("darkMode", false)}
                    >
                      <Sun className="w-6 h-6 mx-auto mb-2 text-[var(--text-primary)]" />
                      <div className="text-sm text-[var(--text-primary)]">Light</div>
                      {!settings.darkMode && (
                        <Check className="w-4 h-4 mx-auto mt-2 text-[var(--cyan-glow)]" />
                      )}
                    </button>
                  </div>
                </div>
                <SettingToggle
                  label="Compact View"
                  description="Reduce spacing in UI elements"
                  enabled={settings.compactView}
                  onChange={(v) => updateSetting("compactView", v)}
                />
              </SettingSection>
            )}

            {activeSection === "api" && (
              <SettingSection title="API Keys">
                <div className="py-4">
                  <div className="flex items-center justify-between p-4 bg-[var(--bg-elevated)] rounded-xl mb-3">
                    <div>
                      <div className="font-mono text-sm text-[var(--text-primary)]">
                        ao_live_*************k8x9
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">
                        Created 2 weeks ago
                      </div>
                    </div>
                    <button className="text-[var(--rose)] text-sm hover:underline">
                      Revoke
                    </button>
                  </div>
                  <button className="btn-primary-gradient flex items-center gap-2 px-4 py-2.5 text-[var(--bg-deep)] text-sm font-semibold rounded-xl">
                    <Key className="w-4 h-4" />
                    Generate New Key
                  </button>
                </div>
              </SettingSection>
            )}

            {activeSection === "integrations" && (
              <SettingSection title="Connected Services">
                <div className="py-4 space-y-3">
                  {[
                    { name: "GitHub", connected: true, icon: "🔗" },
                    { name: "Slack", connected: true, icon: "💬" },
                    { name: "Jira", connected: false, icon: "📋" },
                    { name: "Linear", connected: false, icon: "📐" },
                  ].map((service) => (
                    <div
                      key={service.name}
                      className="flex items-center justify-between p-4 bg-[var(--bg-elevated)] rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{service.icon}</span>
                        <div>
                          <div className="font-medium text-[var(--text-primary)]">
                            {service.name}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {service.connected ? "Connected" : "Not connected"}
                          </div>
                        </div>
                      </div>
                      <button
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          service.connected
                            ? "bg-[var(--bg-hover)] text-[var(--text-muted)]"
                            : "bg-[var(--cyan-glow)]/10 text-[var(--cyan-glow)]"
                        }`}
                      >
                        {service.connected ? "Disconnect" : "Connect"}
                      </button>
                    </div>
                  ))}
                </div>
              </SettingSection>
            )}

            {activeSection === "llm-providers" && (
              <SettingSection title="LLM Provider Configuration">
                <div className="py-4">
                  <ProviderSettings />
                </div>
              </SettingSection>
            )}

            {activeSection === "github" && (
              <div className="space-y-6">
                <SettingSection title="GitHub Integration">
                  <div className="py-4">
                    <GitHubConnectionManager />
                  </div>
                </SettingSection>

                <SettingSection title="Repositories">
                  <div className="py-4">
                    <ConnectedRepositoryList />
                  </div>
                </SettingSection>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
