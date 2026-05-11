import { useTargetDiffQuery, useTargetSnapshotsQuery, useTargetsQuery } from "../hooks/queries";
import { rollbackTarget } from "../api/web";
import { useEffect, useState } from "react";

interface SnapshotsPageProps {
  selectedTarget: string | null;
  onSelectTarget: (target: string) => void;
}

export function SnapshotsPage({ selectedTarget, onSelectTarget }: SnapshotsPageProps) {
  const targetsQuery = useTargetsQuery();
  const snapshotsQuery = useTargetSnapshotsQuery(selectedTarget);
  const [fromSnapshotId, setFromSnapshotId] = useState<string | null>(null);
  const [toSnapshotId, setToSnapshotId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busySnapshot, setBusySnapshot] = useState<string | null>(null);
  const diffQuery = useTargetDiffQuery(selectedTarget, fromSnapshotId, toSnapshotId);

  useEffect(() => {
    if (!selectedTarget && targetsQuery.data?.[0]?.target) {
      onSelectTarget(targetsQuery.data[0].target);
    }
  }, [selectedTarget, targetsQuery.data, onSelectTarget]);

  useEffect(() => {
    const snapshots = snapshotsQuery.data ?? [];
    if (snapshots.length >= 2) {
      setToSnapshotId((current) => current ?? snapshots[0].snapshot_id);
      setFromSnapshotId((current) => current ?? snapshots[1].snapshot_id);
    } else if (snapshots.length === 1) {
      setToSnapshotId(snapshots[0].snapshot_id);
      setFromSnapshotId(snapshots[0].snapshot_id);
    } else {
      setFromSnapshotId(null);
      setToSnapshotId(null);
    }
  }, [snapshotsQuery.data]);

  async function handleRollback(snapshotId: string) {
    if (!selectedTarget) return;
    try {
      setBusySnapshot(snapshotId);
      setError(null);
      setMessage(null);
      await rollbackTarget(selectedTarget, snapshotId);
      setMessage(`Rolled back ${selectedTarget} to ${snapshotId}`);
      await snapshotsQuery.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rollback failed");
    } finally {
      setBusySnapshot(null);
    }
  }

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h3>Snapshots</h3>
          <p>Inspect snapshot history and rollback target state from the browser.</p>
        </div>
        <span className="status-badge">{snapshotsQuery.data?.length ?? 0} snapshots</span>
      </header>

      <label className="field">
        <span>Target</span>
        <select
          value={selectedTarget ?? ""}
          onChange={(event) => onSelectTarget(event.target.value)}
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

      <div className="split-grid inner-grid">
        <article className="card inset-card">
          <h4>Snapshot History</h4>
          <div className="list">
            {snapshotsQuery.data?.map((snapshot) => (
              <div key={snapshot.snapshot_id} className="list-item">
                <strong>{snapshot.snapshot_id}</strong>
                <span>{snapshot.last_command}</span>
                <span className="muted-inline">{snapshot.last_saved_at}</span>
                <span className="muted-inline">
                  verified={snapshot.verified_findings} pending={snapshot.pending_findings}
                </span>
                <div className="button-row compact-row">
                  <button
                    className="secondary-btn"
                    disabled={busySnapshot === snapshot.snapshot_id}
                    onClick={() => handleRollback(snapshot.snapshot_id)}
                    type="button"
                  >
                    {busySnapshot === snapshot.snapshot_id ? "Rolling back..." : "Rollback"}
                  </button>
                </div>
              </div>
            ))}
            {!snapshotsQuery.data?.length && (
              <div className="empty-state">
                {selectedTarget ? "No snapshots found for this target." : "Select a target to inspect snapshots."}
              </div>
            )}
          </div>
        </article>

        <article className="card inset-card">
          <h4>Snapshot Diff</h4>
          <div className="form-grid">
            <label className="field">
              <span>From Snapshot</span>
              <select value={fromSnapshotId ?? ""} onChange={(event) => setFromSnapshotId(event.target.value || null)}>
                <option value="">Select</option>
                {snapshotsQuery.data?.map((snapshot) => (
                  <option key={`from-${snapshot.snapshot_id}`} value={snapshot.snapshot_id}>
                    {snapshot.snapshot_id}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>To Snapshot</span>
              <select value={toSnapshotId ?? ""} onChange={(event) => setToSnapshotId(event.target.value || null)}>
                <option value="">Select</option>
                {snapshotsQuery.data?.map((snapshot) => (
                  <option key={`to-${snapshot.snapshot_id}`} value={snapshot.snapshot_id}>
                    {snapshot.snapshot_id}
                  </option>
                ))}
              </select>
            </label>
          </div>

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
                <strong>Added Steps</strong>
                {diffQuery.data.added_steps.length ? (
                  diffQuery.data.added_steps.map((item) => <span key={item}>{item}</span>)
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
              {diffQuery.isLoading ? "Loading diff..." : "Select two snapshots to compare."}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
