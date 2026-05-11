import { useEffect, useState } from "react";
import { updateConfig } from "../api/web";
import { useConfigQuery } from "../hooks/queries";

export function SettingsPage() {
  const configQuery = useConfigQuery();
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [maxRounds, setMaxRounds] = useState(15);
  const [persistentRounds, setPersistentRounds] = useState(100);
  const [persistentCycles, setPersistentCycles] = useState(10);
  const [showThinking, setShowThinking] = useState(false);
  const [pythonExecuteEnabled, setPythonExecuteEnabled] = useState(true);
  const [pythonExecuteMode, setPythonExecuteMode] = useState("trusted-local");
  const [pythonExecuteMaxLines, setPythonExecuteMaxLines] = useState(50);
  const [pythonExecuteAuditEnabled, setPythonExecuteAuditEnabled] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!configQuery.data) return;
    setProvider(configQuery.data.provider);
    setModel(configQuery.data.model);
    setBaseUrl(configQuery.data.base_url);
    setOutputDir(configQuery.data.output_dir);
    setMaxRounds(configQuery.data.max_rounds);
    setPersistentRounds(configQuery.data.persistent_rounds_per_cycle);
    setPersistentCycles(configQuery.data.persistent_max_cycles);
    setShowThinking(configQuery.data.show_thinking);
    setPythonExecuteEnabled(configQuery.data.python_execute_enabled);
    setPythonExecuteMode(configQuery.data.python_execute_mode);
    setPythonExecuteMaxLines(configQuery.data.python_execute_max_lines);
    setPythonExecuteAuditEnabled(configQuery.data.python_execute_audit_enabled);
  }, [configQuery.data]);

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setStatus(null);
      await updateConfig({
        provider,
        model,
        base_url: baseUrl,
        output_dir: outputDir,
        max_rounds: maxRounds,
        persistent_rounds_per_cycle: persistentRounds,
        persistent_max_cycles: persistentCycles,
        show_thinking: showThinking,
        python_execute_enabled: pythonExecuteEnabled,
        python_execute_mode: pythonExecuteMode,
        python_execute_max_lines: pythonExecuteMaxLines,
        python_execute_audit_enabled: pythonExecuteAuditEnabled,
      });
      await configQuery.refetch();
      setStatus("Configuration updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update config");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h3>Settings</h3>
          <p>Update a safe subset of provider and session configuration from the browser.</p>
        </div>
        <span className="status-badge">{configQuery.data?.api_key_configured ? "api key set" : "no api key"}</span>
      </header>

      <div className="form-grid">
        <label className="field">
          <span>Provider</span>
          <input value={provider} onChange={(event) => setProvider(event.target.value)} />
        </label>
        <label className="field">
          <span>Model</span>
          <input value={model} onChange={(event) => setModel(event.target.value)} />
        </label>
        <label className="field field-wide">
          <span>Base URL</span>
          <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
        </label>
        <label className="field field-wide">
          <span>Output Directory</span>
          <input value={outputDir} onChange={(event) => setOutputDir(event.target.value)} />
        </label>
        <label className="field">
          <span>Max Rounds</span>
          <input type="number" value={maxRounds} onChange={(event) => setMaxRounds(Number(event.target.value))} />
        </label>
        <label className="field">
          <span>Persistent Rounds / Cycle</span>
          <input type="number" value={persistentRounds} onChange={(event) => setPersistentRounds(Number(event.target.value))} />
        </label>
        <label className="field">
          <span>Persistent Max Cycles</span>
          <input type="number" value={persistentCycles} onChange={(event) => setPersistentCycles(Number(event.target.value))} />
        </label>
        <label className="check-row">
          <input checked={showThinking} onChange={(event) => setShowThinking(event.target.checked)} type="checkbox" />
          <span>Show thinking output</span>
        </label>
        <label className="check-row">
          <input
            checked={pythonExecuteEnabled}
            onChange={(event) => setPythonExecuteEnabled(event.target.checked)}
            type="checkbox"
          />
          <span>Enable python_execute</span>
        </label>
        <label className="field">
          <span>python_execute Mode</span>
          <select value={pythonExecuteMode} onChange={(event) => setPythonExecuteMode(event.target.value)}>
            <option value="safe">safe</option>
            <option value="lab">lab</option>
            <option value="trusted-local">trusted-local</option>
          </select>
        </label>
        <label className="field">
          <span>python_execute Max Lines</span>
          <input
            type="number"
            value={pythonExecuteMaxLines}
            onChange={(event) => setPythonExecuteMaxLines(Number(event.target.value))}
          />
        </label>
        <label className="check-row field-wide">
          <input
            checked={pythonExecuteAuditEnabled}
            onChange={(event) => setPythonExecuteAuditEnabled(event.target.checked)}
            type="checkbox"
          />
          <span>Write python_execute audit logs</span>
        </label>
      </div>

      <div className="inline-panel">
        <strong>Safety guidance</strong>
        <p className="inline-note">
          <code>safe</code> blocks file I/O, network access, and local system calls. <code>lab</code> allows
          controlled target-oriented code but still blocks local process execution. <code>trusted-local</code> keeps
          the legacy local capability and should only be used in authorized environments.
        </p>
      </div>

      <div className="button-row">
        <button className="primary-btn" disabled={saving} onClick={handleSave} type="button">
          {saving ? "Saving..." : "Save settings"}
        </button>
      </div>

      {status && <div className="success-box">{status}</div>}
      {error && <div className="error-box">{error}</div>}
    </section>
  );
}
