import { useConfigQuery, useMcpDiagnosticsQuery, useReportsQuery, useTargetsQuery, useTasksQuery } from "../hooks/queries";

interface DashboardPageProps {
  onOpenTarget: (target: string) => void;
  onOpenTasks: () => void;
}

export function DashboardPage({ onOpenTarget, onOpenTasks }: DashboardPageProps) {
  const configQuery = useConfigQuery();
  const mcpQuery = useMcpDiagnosticsQuery();
  const targetsQuery = useTargetsQuery();
  const reportsQuery = useReportsQuery();
  const tasksQuery = useTasksQuery();

  return (
    <section className="card hero-card">
      <div className="pill">Phase 1</div>
      <h2>VulnClaw Web control surface</h2>
      <p>
        The browser console now reads live config, target-state summaries, recent tasks, and reports
        from the Python backend.
      </p>

      <div className="stats-grid">
        <article className="stat">
          <span className="stat-label">Provider</span>
          <strong>{configQuery.data?.provider ?? "loading"}</strong>
        </article>
        <article className="stat">
          <span className="stat-label">Model</span>
          <strong>{configQuery.data?.model ?? "loading"}</strong>
        </article>
        <article className="stat">
          <span className="stat-label">Targets</span>
          <strong>{targetsQuery.data?.length ?? 0}</strong>
        </article>
        <article className="stat">
          <span className="stat-label">Tasks</span>
          <strong>{tasksQuery.data?.length ?? 0}</strong>
        </article>
        <article className="stat">
          <span className="stat-label">MCP Tools</span>
          <strong>{mcpQuery.data?.tool_count ?? 0}</strong>
        </article>
        <article className="stat">
          <span className="stat-label">Runnable MCP</span>
          <strong>{mcpQuery.data?.local_services ?? 0}</strong>
        </article>
        <article className="stat">
          <span className="stat-label">Placeholder MCP</span>
          <strong>{mcpQuery.data?.placeholder_services ?? 0}</strong>
        </article>
      </div>

      <div className="button-row">
        <button className="primary-btn" onClick={onOpenTasks} type="button">
          Open Task Console
        </button>
      </div>

      <div className="split-grid inner-grid">
        <article className="card inset-card">
          <header className="card-header">
            <div>
              <h3>Recent Targets</h3>
              <p>Target-state summaries from the shared results pool.</p>
            </div>
          </header>
          <div className="list list-scroll">
            {targetsQuery.data?.slice(0, 6).map((target) => (
              <button
                key={target.target}
                type="button"
                className="list-item list-button"
                onClick={() => onOpenTarget(target.target)}
              >
                <strong>{target.target}</strong>
                <span>
                  {target.verified_count} verified / {target.pending_count} pending
                </span>
                <span className="muted-inline">{target.resume_strategy || "no strategy"}</span>
              </button>
            ))}
            {!targetsQuery.data?.length && <div className="empty-state">No target state found yet.</div>}
          </div>
        </article>

        <article className="card inset-card">
          <header className="card-header">
            <div>
              <h3>Recent Tasks</h3>
              <p>Tasks created through the Web backend task manager.</p>
            </div>
          </header>
          <div className="list list-scroll">
            {tasksQuery.data?.slice(0, 6).map((task) => (
              <button
                key={task.task_id}
                type="button"
                className="list-item list-button"
                onClick={() => {
                  onOpenTarget(task.target);
                  onOpenTasks();
                }}
              >
                <strong>{task.command} · {task.target}</strong>
                <span>{task.status}</span>
                <span className="muted-inline">{task.latest_phase ?? task.created_at}</span>
              </button>
            ))}
            {!tasksQuery.data?.length && <div className="empty-state">No tasks created yet.</div>}
          </div>
        </article>

        <article className="card inset-card">
          <header className="card-header">
            <div>
              <h3>MCP Diagnostics</h3>
              <p>Real execution modes, health signals, and recent MCP tool call outcomes.</p>
            </div>
            <span className="status-badge">
              {mcpQuery.data?.running_services ?? 0} running / {mcpQuery.data?.total_services ?? 0} total
            </span>
          </header>
          <div className="list list-scroll">
            {mcpQuery.data?.services.slice(0, 8).map((service) => (
              <div key={service.name} className="list-item">
                <strong>{service.name}</strong>
                <span>
                  health={service.health_status} · mode={service.execution_mode} · {service.can_execute ? "executable" : "schema-only"} · tools={service.tool_count}
                </span>
                <span className="muted-inline">
                  attach={service.attach_attempted ? (service.attach_succeeded ? "ok" : "failed") : "not-needed"}
                </span>
                <span className="muted-inline">
                  calls={service.call_count} success={service.success_count} failure={service.failure_count}
                </span>
                <span className="muted-inline">{service.description || service.transport_type}</span>
                {service.error && (
                  <span className="danger-inline">
                    {service.last_error_type ?? "error"}: {service.error}
                  </span>
                )}
              </div>
            ))}
            {!mcpQuery.data?.services.length && <div className="empty-state">No MCP service diagnostics available.</div>}
          </div>
        </article>

        <article className="card inset-card">
          <header className="card-header">
            <div>
              <h3>Recent Reports</h3>
              <p>Latest generated markdown or html reports.</p>
            </div>
          </header>
          <div className="list list-scroll">
            {reportsQuery.data?.slice(0, 6).map((report) => (
              <div key={report.path} className="list-item">
                <strong>{report.name}</strong>
                <span>{report.kind}</span>
                <span className="muted-inline">{report.path}</span>
              </div>
            ))}
            {!reportsQuery.data?.length && <div className="empty-state">No reports available yet.</div>}
          </div>
        </article>
      </div>
    </section>
  );
}
