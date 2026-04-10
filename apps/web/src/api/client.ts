import type { RenderConfig } from "@ai-diagram-studio/shared";

import type { DiagramElement, DiagramRecord, GenerationJobResult, GenerationJobSummary } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function sanitizeControlChars(input: string): string {
  return input.replace(/[\x00-\x1f]/g, " ");
}

async function parseJsonSafe<T>(response: Response): Promise<T> {
  const raw = await response.text();
  const cleaned = sanitizeControlChars(raw).trim();
  if (!cleaned) {
    return {} as T;
  }
  return JSON.parse(cleaned) as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  const hasBody = init?.body !== undefined && init?.body !== null;
  const isFormDataBody = typeof FormData !== "undefined" && init?.body instanceof FormData;
  if (hasBody && !isFormDataBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const payload = await parseJsonSafe<{ message?: string }>(response).catch(() => null);
    const message = payload?.message ?? `Request failed (${response.status})`;
    throw new Error(message);
  }
  return parseJsonSafe<T>(response);
}

export type StyleTemplateDto = {
  id: string;
  name: string;
  isBuiltin: boolean;
  stylePrompt: string | null;
  renderConfig: RenderConfig;
  hasPreview: boolean;
  createdAt: string;
};

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
  createGenerationJob: (body: {
    mode: "text";
    diagramType: "flowchart" | "module_architecture";
    inputText: string;
    diagramId?: string;
    previousReasoning?: Record<string, unknown>;
    existingElements?: DiagramElement[];
    templateId?: string;
    modelProfileId?: string;
  }) =>
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
  listDiagramJobs: (diagramId: string, page = 1, pageSize = 20) =>
    request<GenerationJobSummary[]>(`/api/diagrams/${diagramId}/generation-jobs?page=${page}&pageSize=${pageSize}`),
  listStyleTemplates: () => request<StyleTemplateDto[]>("/api/style-templates"),
  createStyleTemplate: async (file: File, name?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (name?.trim()) {
      formData.append("name", name.trim());
    }
    return request<StyleTemplateDto>("/api/style-templates", {
      method: "POST",
      body: formData
    });
  },
  analyzeStyleTemplate: (id: string) =>
    request<StyleTemplateDto>(`/api/style-templates/${id}/analyze`, {
      method: "POST"
    }),
  deleteStyleTemplate: (id: string) =>
    request<{ ok: boolean }>(`/api/style-templates/${id}`, {
      method: "DELETE"
    }),
  styleTemplatePreviewUrl: (id: string) => `${API_BASE}/api/style-templates/${id}/preview`,
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
