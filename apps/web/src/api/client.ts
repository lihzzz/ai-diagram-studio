import type { DiagramRecord, GenerationJobResult } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  const hasBody = init?.body !== undefined && init?.body !== null;
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.message ?? `Request failed (${response.status})`;
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export const api = {
  listDiagrams: () => request<DiagramRecord[]>("/api/diagrams"),
  getDiagram: (id: string) => request<DiagramRecord>(`/api/diagrams/${id}`),
  createDiagram: (body: { title: string; type: "flowchart" | "module_architecture" }) =>
    request<DiagramRecord>("/api/diagrams", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  saveDiagram: (id: string, body: Partial<DiagramRecord> & { version?: number }) =>
    request<DiagramRecord>(`/api/diagrams/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    }),
  listRevisions: (id: string) => request<Array<{ id: string; version: number; note: string | null; createdAt: string }>>(`/api/diagrams/${id}/revisions`),
  restoreRevision: (id: string, version: number) =>
    request<DiagramRecord>(`/api/diagrams/${id}/revisions/${version}/restore`, {
      method: "POST"
    }),
  listChangeSets: (id: string) =>
    request<Array<{ id: string; summary: string | null; beforeRevisionId: string; afterRevisionId: string; createdAt: string }>>(
      `/api/diagrams/${id}/change-sets`
    ),
  revertChangeSet: (id: string) =>
    request<{ ok: boolean; newVersion: number }>(`/api/change-sets/${id}/revert`, {
      method: "POST"
    }),
  createGenerationJob: (body: Record<string, unknown>) =>
    request<{ jobId: string }>("/api/generation-jobs", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  getGenerationJob: (jobId: string) => request<GenerationJobResult>(`/api/generation-jobs/${jobId}`),
  applyGenerationJob: (jobId: string, diagramId: string) =>
    request<{ ok: boolean; changeSetId: string; newVersion: number }>(`/api/generation-jobs/${jobId}/apply`, {
      method: "POST",
      body: JSON.stringify({ diagramId })
    }),
  createChatSession: (diagramId: string) =>
    request<{ sessionId: string }>("/api/chat/sessions", {
      method: "POST",
      body: JSON.stringify({ diagramId })
    }),
  createChatTurn: (sessionId: string, body: { content: string; selection?: string[] }) =>
    request<{ sessionId: string; userTurnId: string; jobId: string }>(`/api/chat/sessions/${sessionId}/turns`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  listTemplates: () =>
    request<Array<{ id: string; name: string; category: string; diagramType: string; isBuiltin: boolean }>>("/api/templates"),
  applyTemplate: (id: string, diagramId: string) =>
    request<{ ok: boolean; diagramId: string; newVersion: number }>(`/api/templates/${id}/apply`, {
      method: "POST",
      body: JSON.stringify({ diagramId })
    }),
  listIcons: (q?: string) =>
    request<Array<{ id: string; name: string; category: string; source: string }>>(`/api/icons${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  listModelProfiles: () =>
    request<
      Array<{
        id: string;
        provider: string;
        model: string;
        apiBase: string | null;
        qualityRank: number;
        isDefault: boolean;
        enabled: boolean;
        hasApiKey: boolean;
        apiKeyPreview: string | null;
      }>
    >("/api/model-profiles"),
  createModelProfile: (body: {
    provider: string;
    model: string;
    apiBase?: string;
    apiKey?: string;
    qualityRank: number;
    enabled?: boolean;
    isDefault?: boolean;
  }) =>
    request<{
      id: string;
      provider: string;
      model: string;
      apiBase: string | null;
      qualityRank: number;
      hasApiKey: boolean;
      apiKeyPreview: string | null;
      enabled: boolean;
      isDefault: boolean;
    }>("/api/model-profiles", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  checkModelProfile: (id: string) =>
    request<{
      profileId: string;
      available: boolean;
      reason: string;
      httpStatus: number | null;
      latencyMs: number;
    }>(`/api/model-profiles/${id}/check`, {
      method: "POST"
    }),
  setDefaultModelProfile: (modelProfileId: string) =>
    request<{ ok: boolean; defaultModelProfileId: string }>("/api/settings/default-model-profile", {
      method: "POST",
      body: JSON.stringify({ modelProfileId })
    })
};