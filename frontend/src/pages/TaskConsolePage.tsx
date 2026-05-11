import { useEffect, useMemo, useState } from "react";
import { createTask, openTaskStream, stopTask } from "../api/web";
import { useTasksQuery } from "../hooks/queries";
import type { TaskCommand, TaskEvent, TaskRecord } from "../types/api";

interface TaskConsolePageProps {
  activeTask: TaskRecord | null;
  events: TaskEvent[];
  onTaskCreated: (task: TaskRecord) => void;
  onEvent: (event: TaskEvent) => void;
  onFocusTarget: (target: string) => void;
}

export function TaskConsolePage({
  activeTask,
  events,
  onTaskCreated,
  onEvent,
  onFocusTarget,
}: TaskConsolePageProps) {
  const tasksQuery = useTasksQuery();
  const [command, setCommand] = useState<TaskCommand>("persistent");
  const [target, setTarget] = useState("https://example.com");
  const [resume, setResume] = useState(true);
  const [maxRounds, setMaxRounds] = useState<number | "">("");
  const [roundsPerCycle, setRoundsPerCycle] = useState<number | "">("");
  const [maxCycles, setMaxCycles] = useState<number | "">("");
  const [cve, setCve] = useState("");
  const [cmd, setCmd] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTask) return;
    const source = openTaskStream(activeTask.task_id, onEvent);
    return () => source.close();
  }, [activeTask?.task_id, onEvent]);

  const latestEvents = useMemo(() => events.slice(-24).reverse(), [events]);

  function renderEventText(item: TaskEvent): string {
    const payload = item.payload;
    const cycle = typeof payload.cycle === "number" ? `cycle=${payload.cycle} ` : "";
    const round = typeof payload.round === "number" ? `round=${payload.round} ` : "";
    const phase = typeof payload.phase === "string" ? `phase=${payload.phase} ` : "";
    const text = typeof payload.text === "string" ? payload.text : "";
    const message = typeof payload.message === "string" ? payload.message : "";
    const summary = text || message || JSON.stringify(payload);
    return `${cycle}${round}${phase}${summary}`.trim();
  }

  function eventTone(eventName: string): "ok" | "warn" | "danger" | "info" {
    if (eventName.includes("completed")) return "ok";
    if (eventName.includes("failed")) return "danger";
    if (eventName.includes("stopped")) return "warn";
    if (eventName.includes("state") || eventName.includes("started")) return "info";
    return "info";
  }

  async function handleRun() {
    try {
      setSubmitting(true);
      setError(null);
      const task = await createTask(command, target, resume, {
        max_rounds: maxRounds === "" ? undefined : maxRounds,
        rounds_per_cycle: roundsPerCycle === "" ? undefined : roundsPerCycle,
        max_cycles: maxCycles === "" ? undefined : maxCycles,
        cve: cve.trim() || undefined,
        cmd: cmd.trim() || undefined,
      });
      onTaskCreated(task);
      onFocusTarget(task.target);
      await tasksQuery.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStop() {
    if (!activeTask) return;
    try {
      await stopTask(activeTask.task_id);
      await tasksQuery.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop task");
    }
  }

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h3>Task Console</h3>
          <p>Create tasks from the same backend commands used by the CLI and stream events over SSE.</p>
        </div>
        <span className="status-badge">{activeTask?.status ?? "idle"}</span>
      </header>

      <div className="form-grid">
        <label className="field">
          <span>Command</span>
          <select value={command} onChange={(event) => setCommand(event.target.value as TaskCommand)}>
            <option value="run">run</option>
            <option value="recon">recon</option>
            <option value="scan">scan</option>
            <option value="exploit">exploit</option>
            <option value="persistent">persistent</option>
          </select>
        </label>

        <label className="field field-wide">
          <span>Target</span>
          <input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="https://target.example" />
        </label>

        <label className="check-row">
          <input checked={resume} onChange={(event) => setResume(event.target.checked)} type="checkbox" />
          <span>Resume target history</span>
        </label>
        <label className="field">
          <span>Max Rounds</span>
          <input
            type="number"
            value={maxRounds}
            onChange={(event) => setMaxRounds(event.target.value ? Number(event.target.value) : "")}
            placeholder="use backend default"
          />
        </label>
        <label className="field">
          <span>Rounds / Cycle</span>
          <input
            type="number"
            value={roundsPerCycle}
            onChange={(event) => setRoundsPerCycle(event.target.value ? Number(event.target.value) : "")}
            placeholder="persistent only"
          />
        </label>
        <label className="field">
          <span>Max Cycles</span>
          <input
            type="number"
            value={maxCycles}
            onChange={(event) => setMaxCycles(event.target.value ? Number(event.target.value) : "")}
            placeholder="persistent only"
          />
        </label>
        <label className="field">
          <span>CVE Hint</span>
          <input value={cve} onChange={(event) => setCve(event.target.value)} placeholder="exploit only" />
        </label>
        <label className="field field-wide">
          <span>Command Hint</span>
          <input value={cmd} onChange={(event) => setCmd(event.target.value)} placeholder="verification command, e.g. id" />
        </label>
      </div>

      <div className="button-row">
        <button className="primary-btn" disabled={submitting || !target.trim()} onClick={handleRun} type="button">
          {submitting ? "Starting..." : "Start task"}
        </button>
        <button className="secondary-btn" disabled={!activeTask || activeTask.status !== "running"} onClick={handleStop} type="button">
          Stop task
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="split-grid inner-grid">
        <article className="card inset-card">
          <h4>Task History</h4>
          <div className="list list-scroll">
            {tasksQuery.data?.slice(0, 8).map((task) => (
              <button
                key={task.task_id}
                type="button"
                className={`list-item list-button ${activeTask?.task_id === task.task_id ? "selected-item" : ""}`}
                onClick={() => {
                  onTaskCreated(task);
                  onFocusTarget(task.target);
                }}
              >
                <strong>{task.command} · {task.target}</strong>
                <span>{task.status}</span>
                <span className="muted-inline">{task.latest_phase ?? task.created_at}</span>
              </button>
            ))}
            {!tasksQuery.data?.length && <div className="empty-state">No task records yet.</div>}
          </div>
        </article>

        <article className="card inset-card">
          <h4>Live Event Stream</h4>
          <div className="terminal terminal-scroll">
            {activeTask ? (
              <>
                <div className="terminal-line">[task] {activeTask.task_id}</div>
                <div className="terminal-line">[command] {activeTask.command}</div>
                <div className="terminal-line">[target] {activeTask.target}</div>
                <div className="terminal-line dim">[phase] {activeTask.latest_phase ?? "unknown"}</div>
              </>
            ) : (
              <div className="terminal-line dim">No active task yet.</div>
            )}

            {latestEvents.map((item) => (
              <div key={`${item.timestamp}-${item.event}`} className="terminal-line terminal-row">
                <span className={`terminal-event tone-${eventTone(item.event)}`}>[{item.event}]</span>
                <span className="terminal-time">
                  {new Date(item.timestamp).toLocaleTimeString()}
                </span>
                <span>{renderEventText(item)}</span>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
