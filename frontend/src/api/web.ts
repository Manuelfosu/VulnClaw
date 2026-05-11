import type {
  ConfigView,
  ConfigUpdateRequest,
  MCPDiagnosticsView,
  ReportListItem,
  ReportContentView,
  TargetPreviewView,
  TargetSnapshotView,
  TargetStateDiffView,
  TargetView,
  TaskCommand,
  TaskEvent,
  TaskOptions,
  TaskRecord,
} from "../types/api";

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getConfig(): Promise<ConfigView> {
  return requestJson<ConfigView>("/api/config");
}

export function getMcpDiagnostics(): Promise<MCPDiagnosticsView> {
  return requestJson<MCPDiagnosticsView>("/api/mcp");
}

export function updateConfig(payload: ConfigUpdateRequest): Promise<ConfigView> {
  return requestJson<ConfigView>("/api/config", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getTasks(): Promise<TaskRecord[]> {
  return requestJson<TaskRecord[]>("/api/tasks");
}

export function getTargets(): Promise<TargetView[]> {
  return requestJson<TargetView[]>("/api/targets");
}

export function getTarget(target: string): Promise<TargetView> {
  return requestJson<TargetView>(`/api/targets/${encodeURIComponent(target)}`);
}

export function getTargetSnapshots(target: string): Promise<TargetSnapshotView[]> {
  return requestJson<TargetSnapshotView[]>(`/api/targets/${encodeURIComponent(target)}/snapshots`);
}

export function getTargetPreview(target: string): Promise<TargetPreviewView> {
  return requestJson<TargetPreviewView>(`/api/target-preview/${encodeURIComponent(target)}`);
}

export function getTargetDiff(target: string, fromSnapshotId: string, toSnapshotId?: string): Promise<TargetStateDiffView> {
  const params = new URLSearchParams({ from_snapshot_id: fromSnapshotId });
  if (toSnapshotId) {
    params.set("to_snapshot_id", toSnapshotId);
  }
  return requestJson<TargetStateDiffView>(`/api/target-diff/${encodeURIComponent(target)}?${params.toString()}`);
}

export function getReports(): Promise<ReportListItem[]> {
  return requestJson<ReportListItem[]>("/api/reports");
}

export function getReportContent(path: string): Promise<ReportContentView> {
  return requestJson<ReportContentView>(`/api/reports/content?path=${encodeURIComponent(path)}`);
}

export function rollbackTarget(target: string, snapshotId: string): Promise<{ status: string; target: string; snapshot_id: string }> {
  return requestJson(`/api/targets/${encodeURIComponent(target)}/rollback`, {
    method: "POST",
    body: JSON.stringify({ snapshot_id: snapshotId }),
  });
}

export function clearTargetState(target: string): Promise<{ status: string; target: string }> {
  return requestJson(`/api/targets/${encodeURIComponent(target)}`, {
    method: "DELETE",
  });
}

export function generateTargetReport(target: string): Promise<{ status: string; path: string }> {
  return requestJson("/api/reports/target", {
    method: "POST",
    body: JSON.stringify({ target }),
  });
}

export function createTask(command: TaskCommand, target: string, resume: boolean, options: TaskOptions = {}): Promise<TaskRecord> {
  return requestJson<TaskRecord>("/api/tasks/run", {
    method: "POST",
    body: JSON.stringify({
      command,
      target,
      resume,
      options,
    }),
  });
}

export function stopTask(taskId: string): Promise<{ status: string; task_id: string }> {
  return requestJson(`/api/tasks/${taskId}/stop`, {
    method: "POST",
  });
}

export function openTaskStream(taskId: string, onEvent: (event: TaskEvent) => void): EventSource {
  const source = new EventSource(`/api/tasks/${taskId}/stream`);
  const handler = (message: MessageEvent<string>) => {
    try {
      const parsed = JSON.parse(message.data) as TaskEvent;
      onEvent(parsed);
    } catch {
      // Ignore malformed events.
    }
  };

  source.addEventListener("task_created", handler as EventListener);
  source.addEventListener("task_started", handler as EventListener);
  source.addEventListener("task_state_changed", handler as EventListener);
  source.addEventListener("round_output", handler as EventListener);
  source.addEventListener("cycle_completed", handler as EventListener);
  source.addEventListener("task_completed", handler as EventListener);
  source.addEventListener("task_failed", handler as EventListener);
  source.addEventListener("task_stopped", handler as EventListener);
  source.onmessage = handler;
  return source;
}
