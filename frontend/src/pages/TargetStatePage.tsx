import { useEffect, useMemo, useState } from "react";
import { clearTargetState, generateTargetReport, rollbackTarget } from "../api/web";
import { useTargetDiffQuery, useTargetPreviewQuery, useTargetQuery, useTargetSnapshotsQuery, useTargetsQuery } from "../hooks/queries";

interface TargetStatePageProps {
  selectedTarget: string | null;
  onSelectTarget: (target: string | null) => void;
}

export function TargetStatePage({ selectedTarget, onSelectTarget }: TargetStatePageProps) {
  const targetsQuery = useTargetsQuery();
  const [localTarget, setLocalTarget] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (selectedTarget) {
      setLocalTarget(selectedTarget);
      return;
    }
    const first = targetsQuery.data?.[0]?.target;
    if (first) {
      setLocalTarget(first);
      onSelectTarget(first);
    }
  }, [selectedTarget, targetsQuery.data, onSelectTarget]);

  const targetValue = selectedTarget ?? localTarget ?? null;
  const targetQuery = useTargetQuery(targetValue);
  const snapshotsQuery = useTargetSnapshotsQuery(targetValue);
  const previewQuery = useTargetPreviewQuery(targetValue);
  const baselineSnapshotId = snapshotsQuery.data?.[snapshotsQuery.data.length - 1]?.snapshot_id ?? null;
  const diffQuery = useTargetDiffQuery(targetValue, baselineSnapshotId);

  const governance = useMemo(() => {
    const raw = targetQuery.data?.raw ?? {};
    const resumeMeta = (raw.resume_meta as Record<string, unknown> | undefined) ?? {};
    return {
      reason: (resumeMeta.resume_strategy_reason as string | undefined) ?? "",
      priorityTargets: ((resumeMeta.priority_targets as string[] | undefined) ?? []).slice(0, 5),
      reconAssets: ((resumeMeta.priority_recon_assets as string[] | undefined) ?? []).slice(0, 6),
      blockedTargets: ((resumeMeta.blocked_targets as string[] | undefined) ?? []).slice(0, 6),
      failedTargets: ((resumeMeta.failed_targets as string[] | undefined) ?? []).slice(0, 6),
      failedSteps: ((resumeMeta.recent_failed_steps as string[] | undefined) ?? []).slice(0, 4),
    };
  }, [targetQuery.data]);

  async function handleRollback(snapshotId: string) {
    if (!targetValue) return;
    try {
      setBusyKey(`rollback:${snapshotId}`);
      setError(null);
      setMessage(null);
      await rollbackTarget(targetValue, snapshotId);
      setMessage(`Rolled back to ${snapshotId}`);
      await Promise.all([targetQuery.refetch(), snapshotsQuery.refetch(), targetsQuery.refetch()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rollback failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleGenerateReport() {
    if (!targetValue) return;
    try {
      setBusyKey("report");
      setError(null);
      const result = await generateTargetReport(targetValue);
      setMessage(`Report generated: ${result.path}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report generation failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleClear() {
    if (!targetValue) return;
    try {
      setBusyKey("clear");
      setError(null);
      await clearTargetState(targetValue);
      setMessage(`Cleared target state: ${targetValue}`);
      onSelectTarget(null);
      setLocalTarget("");
      await Promise.all([targetsQuery.refetch(), snapshotsQuery.refetch()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clear failed");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h3>Target State</h3>
          <p>Inspect the shared target-state pool, governance signals, snapshots, and direct target actions.</p>
        </div>
        <span className="status-badge">{targetQuery.data?.resume_strategy ?? "idle"}</span>
      </header>

      <label className="field">
        <span>Target</span>
        <select
          value={targetValue ?? ""}
          onChange={(event) => {
            setLocalTarget(event.target.value);
            onSelectTarget(event.target.value || null);
          }}
        >
          <option value="">Select a target</option>
          {targetsQuery.data?.map((target) => (
            <option key={target.target} value={target.target}>
              {target.target}
            </option>
          ))}
        </select>
      </label>

      {message && <div className="success-box">{message}</div>}
      {error && <div className="error-box">{error}</div>}

      {targetQuery.data ? (
        <>
          <div className="button-row">
            <button className="primary-btn" disabled={busyKey === "report"} onClick={handleGenerateReport} type="button">
              {busyKey === "report" ? "Generating..." : "Generate target report"}
            </button>
            <button className="secondary-btn" disabled={busyKey === "clear"} onClick={handleClear} type="button">
              {busyKey === "clear" ? "Clearing..." : "Clear target state"}
            </button>
          </div>

          <div className="kv-grid">
            <div className="kv-item">
              <span className="stat-label">Phase</span>
              <strong>{targetQuery.data.phase ?? "unknown"}</strong>
            </div>
            <div className="kv-item">
              <span className="stat-label">Schema</span>
              <strong>v{targetQuery.data.schema_version}</strong>
            </div>
            <div className="kv-item">
              <span className="stat-label">Verified</span>
              <strong>{targetQuery.data.verified_count}</strong>
            </div>
            <div className="kv-item">
              <span className="stat-label">Pending</span>
              <strong>{targetQuery.data.pending_count}</strong>
            </div>
            <div className="kv-item">
              <span className="stat-label">Candidates</span>
              <strong>{targetQuery.data.candidate_count}</strong>
            </div>
            <div className="kv-item">
              <span className="stat-label">Pending Verification</span>
              <strong>{targetQuery.data.pending_verification_count}</strong>
            </div>
            <div className="kv-item">
              <span className="stat-label">Need Review</span>
              <strong>{targetQuery.data.manual_review_count}</strong>
            </div>
            <div className="kv-item">
              <span className="stat-label">Strategy</span>
              <strong>{targetQuery.data.resume_strategy || "none"}</strong>
            </div>
          </div>

          {governance.reason && (
            <div className="inline-panel">
              <span className="stat-label">Resume Reason</span>
              <strong>{governance.reason}</strong>
            </div>
          )}

          {previewQuery.data && (
            <div className="split-grid inner-grid">
              <article className="card inset-card">
                <h4>Resume Preview</h4>
                <div className="list dense-list">
                  <div className="list-item">
                    <strong>Strategy</strong>
                    <span>{previewQuery.data.resume_strategy || "none"}</span>
                    <span className="muted-inline">{previewQuery.data.resume_reason || "no reason provided"}</span>
                  </div>
                  <div className="list-item">
                    <strong>Next Actions</strong>
                    {previewQuery.data.next_actions.length ? (
                      previewQuery.data.next_actions.map((item) => <span key={item}>{item}</span>)
                    ) : (
                      <span className="muted-inline">none</span>
                    )}
                  </div>
                  <div className="list-item">
                    <strong>Low-value Rounds</strong>
                    <span>{previewQuery.data.low_value_rounds}</span>
                  </div>
                </div>
              </article>

              <article className="card inset-card">
                <h4>Snapshot Diff</h4>
                {diffQuery.data ? (
                  <div className="list dense-list">
                    <div className="list-item">
                      <strong>Added Findings</strong>
                      {diffQuery.data.added_findings.length ? (
                        diffQuery.data.added_findings.map((item) => <span key={item}>{item}</span>)
                      ) : (
                        <span className="muted-inline">none</span>
                      )}
                    </div>
                    <div className="list-item">
                      <strong>Updated Findings</strong>
                      {diffQuery.data.updated_findings.length ? (
                        diffQuery.data.updated_findings.map((item) => <span key={item}>{item}</span>)
                      ) : (
                        <span className="muted-inline">none</span>
                      )}
                    </div>
                    <div className="list-item">
                      <strong>Added Recon Assets</strong>
                      {diffQuery.data.added_recon_assets.length ? (
                        diffQuery.data.added_recon_assets.map((item) => <span key={item}>{item}</span>)
                      ) : (
                        <span className="muted-inline">none</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">
                    {diffQuery.isLoading ? "Loading diff..." : "Need at least one snapshot to compute a diff."}
                  </div>
                )}
              </article>
            </div>
          )}

          <div className="split-grid inner-grid">
            <article className="card inset-card">
              <h4>Priority Targets</h4>
              <div className="list">
                {governance.priorityTargets.length ? (
                  governance.priorityTargets.map((item) => (
                    <div key={item} className="list-item">
                      <strong>{item}</strong>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">No priority targets available.</div>
                )}
              </div>
            </article>

            <article className="card inset-card">
              <h4>Governance Signals</h4>
              <div className="list dense-list">
                <div className="list-item">
                  <strong>Priority Recon Assets</strong>
                  {governance.reconAssets.length ? (
                    governance.reconAssets.map((item) => <span key={item}>{item}</span>)
                  ) : (
                    <span className="muted-inline">none</span>
                  )}
                </div>
                <div className="list-item">
                  <strong>Blocked Targets</strong>
                  {governance.blockedTargets.length ? (
                    governance.blockedTargets.map((item) => <span key={item}>{item}</span>)
                  ) : (
                    <span className="muted-inline">none</span>
                  )}
                </div>
                <div className="list-item">
                  <strong>Failed Targets</strong>
                  {governance.failedTargets.length ? (
                    governance.failedTargets.map((item) => <span key={item}>{item}</span>)
                  ) : (
                    <span className="muted-inline">none</span>
                  )}
                </div>
                <div className="list-item">
                  <strong>Recent Failed Steps</strong>
                  {governance.failedSteps.length ? (
                    governance.failedSteps.map((item) => <span key={item}>{item}</span>)
                  ) : (
                    <span className="muted-inline">none</span>
                  )}
                </div>
              </div>
            </article>

            <article className="card inset-card">
              <h4>Snapshots</h4>
              <div className="list">
                {snapshotsQuery.data?.slice(0, 6).map((snapshot) => (
                  <div key={snapshot.snapshot_id} className="list-item">
                    <strong>{snapshot.snapshot_id}</strong>
                    <span>{snapshot.last_command}</span>
                    <span className="muted-inline">{snapshot.resume_strategy}</span>
                    <div className="button-row compact-row">
                      <button
                        className="secondary-btn"
                        disabled={busyKey === `rollback:${snapshot.snapshot_id}`}
                        onClick={() => handleRollback(snapshot.snapshot_id)}
                        type="button"
                      >
                        {busyKey === `rollback:${snapshot.snapshot_id}` ? "Rolling back..." : "Rollback"}
                      </button>
                    </div>
                  </div>
                ))}
                {!snapshotsQuery.data?.length && <div className="empty-state">No snapshots found.</div>}
              </div>
            </article>
          </div>

          <article className="card inset-card inner-grid">
            <h4>Raw Target State</h4>
            <div className="report-preview">
              <pre>{JSON.stringify(targetQuery.data.raw, null, 2)}</pre>
            </div>
          </article>
        </>
      ) : (
        <div className="empty-state">{targetQuery.isLoading ? "Loading target..." : "No target selected yet."}</div>
      )}
    </section>
  );
}
