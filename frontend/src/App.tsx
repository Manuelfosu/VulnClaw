import { useMemo, useState } from "react";
import { DashboardPage } from "./pages/DashboardPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SnapshotsPage } from "./pages/SnapshotsPage";
import { TaskConsolePage } from "./pages/TaskConsolePage";
import { TargetStatePage } from "./pages/TargetStatePage";
import type { TaskEvent, TaskRecord } from "./types/api";

type AppView = "dashboard" | "tasks" | "target" | "snapshots" | "reports" | "settings";

export function App() {
  const [activeView, setActiveView] = useState<AppView>("dashboard");
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<TaskRecord | null>(null);
  const [taskEvents, setTaskEvents] = useState<TaskEvent[]>([]);

  const nav = useMemo(
    () => [
      { key: "dashboard" as const, label: "Dashboard" },
      { key: "tasks" as const, label: "Task Console" },
      { key: "target" as const, label: "Target State" },
      { key: "snapshots" as const, label: "Snapshots" },
      { key: "reports" as const, label: "Reports" },
      { key: "settings" as const, label: "Settings" },
    ],
    [],
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-kicker">VulnClaw Web</div>
          <h1>Ops Console</h1>
          <p>Phase 1 data-wired UI</p>
        </div>
        <nav className="nav-list">
          {nav.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`nav-item ${activeView === item.key ? "active" : ""}`}
              onClick={() => setActiveView(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        {activeView === "dashboard" && (
          <DashboardPage
            onOpenTarget={(target) => {
              setSelectedTarget(target);
              setActiveView("target");
            }}
            onOpenTasks={() => setActiveView("tasks")}
          />
        )}

        {activeView === "tasks" && (
          <TaskConsolePage
            activeTask={activeTask}
            events={taskEvents}
            onTaskCreated={(task) => {
              setActiveTask(task);
              setSelectedTarget(task.target);
              setActiveView("tasks");
            }}
            onEvent={(event) => {
              setTaskEvents((prev) => [...prev.slice(-79), event]);
            }}
            onFocusTarget={(target) => {
              setSelectedTarget(target);
              setActiveView("target");
            }}
          />
        )}

        {activeView === "target" && (
          <TargetStatePage
            selectedTarget={selectedTarget}
            onSelectTarget={setSelectedTarget}
          />
        )}

        {activeView === "snapshots" && (
          <SnapshotsPage
            selectedTarget={selectedTarget}
            onSelectTarget={setSelectedTarget}
          />
        )}

        {activeView === "reports" && (
          <ReportsPage selectedTarget={selectedTarget} />
        )}

        {activeView === "settings" && (
          <SettingsPage />
        )}
      </main>
    </div>
  );
}
