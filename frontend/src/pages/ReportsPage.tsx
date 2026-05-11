import { useEffect, useState } from "react";
import { generateTargetReport } from "../api/web";
import { useReportContentQuery, useReportsQuery } from "../hooks/queries";

interface ReportsPageProps {
  selectedTarget: string | null;
}

export function ReportsPage({ selectedTarget }: ReportsPageProps) {
  const reportsQuery = useReportsQuery();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const contentQuery = useReportContentQuery(selectedPath);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!selectedPath && reportsQuery.data?.[0]?.path) {
      setSelectedPath(reportsQuery.data[0].path);
    }
  }, [selectedPath, reportsQuery.data]);

  async function handleGenerate() {
    if (!selectedTarget) return;
    try {
      setGenerating(true);
      setError(null);
      const result = await generateTargetReport(selectedTarget);
      setStatus(result.path);
      await reportsQuery.refetch();
      setSelectedPath(result.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h3>Reports</h3>
          <p>Generate target reports and preview recent report files directly in the browser.</p>
        </div>
        <span className="status-badge">{reportsQuery.data?.length ?? 0} files</span>
      </header>

      <div className="button-row">
        <button
          className="primary-btn"
          disabled={!selectedTarget || generating}
          onClick={handleGenerate}
          type="button"
        >
          {generating ? "Generating..." : "Generate target report"}
        </button>
      </div>

      {selectedTarget && <p className="inline-note">Selected target: <code>{selectedTarget}</code></p>}
      {status && <div className="success-box">Report generated: {status}</div>}
      {error && <div className="error-box">{error}</div>}

      <div className="split-grid inner-grid">
        <article className="card inset-card">
          <h4>Report Files</h4>
          <div className="list list-scroll">
            {reportsQuery.data?.slice(0, 16).map((report) => (
              <button
                key={report.path}
                type="button"
                className={`list-item list-button ${selectedPath === report.path ? "selected-item" : ""}`}
                onClick={() => setSelectedPath(report.path)}
              >
                <strong>{report.name}</strong>
                <span>{report.kind}</span>
                <span className="muted-inline">{report.path}</span>
              </button>
            ))}
            {!reportsQuery.data?.length && <div className="empty-state">No reports found yet.</div>}
          </div>
        </article>

        <article className="card inset-card">
          <h4>Report Preview</h4>
          <div className="report-preview">
            {contentQuery.data ? (
              contentQuery.data.kind === "html" ? (
                <iframe
                  className="report-frame"
                  srcDoc={contentQuery.data.content}
                  title="HTML Report Preview"
                />
              ) : (
                <pre>{contentQuery.data.content}</pre>
              )
            ) : contentQuery.isLoading ? (
              <div className="empty-state">Loading report preview...</div>
            ) : (
              <div className="empty-state">Select a report to preview it.</div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
