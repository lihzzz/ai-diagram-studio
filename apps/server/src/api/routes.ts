import path from "node:path";

import type { FastifyInstance } from "fastify";
import {
  applyGenerationJobSchema,
  createChatSessionSchema,
  createChatTurnSchema,
  createDiagramSchema,
  createGenerationJobSchema,
  createModelProfileSchema,
  patchModelProfileSchema,
  setDefaultModelSchema,
  updateDiagramSchema
} from "../types/schemas.js";
import type { DiagramElement } from "../types/domain.js";

import { prisma } from "../db.js";
import { config } from "../config.js";
import { createId } from "../utils/id.js";
import { asJsonString, safeJsonParse } from "../utils/json.js";
import { HttpError } from "../utils/http-error.js";
import { initRuntime, queueGenerationJob } from "../worker/runtime.js";

const ICON_MIMES = new Set(["image/png", "image/svg+xml", "image/webp", "image/jpeg", "image/jpg"]);
const LEGACY_BUILTIN_MODEL_IDS = ["profile_openai_quality", "profile_anthropic_backup"];

function mapModeToJobType(mode: "text" | "chat"): string {
  if (mode === "text") {
    return "text_generate";
  }
  return "chat_edit";
}

function toIso(value: Date): string {
  return value.toISOString();
}

function parseElements(elementsJson: string): DiagramElement[] {
  return safeJsonParse<DiagramElement[]>(elementsJson, []);
}

function parseAppState(appStateJson: string | null): Record<string, unknown> | null {
  return safeJsonParse<Record<string, unknown> | null>(appStateJson, null);
}

function diagramToDto(record: {
  id: string;
  title: string;
  type: string;
  currentVersion: number;
  elementsJson: string;
  appStateJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Record<string, unknown> {
  return {
    id: record.id,
    title: record.title,
    type: record.type,
    currentVersion: record.currentVersion,
    elements: parseElements(record.elementsJson),
    appState: parseAppState(record.appStateJson),
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt)
  };
}

function maskApiKey(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}

function modelProfileToDto(record: {
  id: string;
  provider: string;
  model: string;
  apiBase: string | null;
  apiKey: string | null;
  qualityRank: number;
  isDefault: boolean;
  enabled: boolean;
}) {
  return {
    id: record.id,
    provider: record.provider,
    model: record.model,
    apiBase: record.apiBase,
    qualityRank: record.qualityRank,
    isDefault: record.isDefault,
    enabled: record.enabled,
    hasApiKey: Boolean(record.apiKey && record.apiKey.trim().length > 0),
    apiKeyPreview: maskApiKey(record.apiKey)
  };
}

function requiresApiKey(provider: string): boolean {
  const normalized = provider.toLowerCase();
  return !normalized.includes("local") && !normalized.includes("mock");
}

function normalizeApiBase(provider: string, apiBase: string | null): string {
  const trimmed = (apiBase ?? "").trim();
  if (trimmed) {
    return trimmed.replace(/\/+$/, "");
  }
  void provider;
  return "https://api.openai.com/v1";
}

function modelsEndpoint(provider: string, apiBase: string | null): string {
  const base = normalizeApiBase(provider, apiBase);
  void provider;
  if (base.endsWith("/v1")) {
    return `${base}/models`;
  }
  return `${base}/v1/models`;
}

function chatCompletionsEndpoint(provider: string, apiBase: string | null): string {
  const base = normalizeApiBase(provider, apiBase);
  if (base.endsWith("/v1")) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

async function checkModelProfileConnection(profile: {
  provider: string;
  model: string;
  apiBase: string | null;
  apiKey: string | null;
  enabled: boolean;
}): Promise<{
  available: boolean;
  reason: string;
  httpStatus?: number;
  latencyMs: number;
}> {
  const start = Date.now();
  if (!profile.enabled) {
    return { available: false, reason: "disabled", latencyMs: 0 };
  }

  if (requiresApiKey(profile.provider) && (!profile.apiKey || !profile.apiKey.trim())) {
    return { available: false, reason: "missing api key", latencyMs: 0 };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const url = modelsEndpoint(profile.provider, profile.apiBase);
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${profile.apiKey ?? ""}`
    };

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal
    });
    const latencyMs = Date.now() - start;

    if (!response.ok) {
      if (response.status === 404) {
        const probeResponse = await fetch(chatCompletionsEndpoint(profile.provider, profile.apiBase), {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: profile.model,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
            temperature: 0
          }),
          signal: controller.signal
        });
        const probeLatencyMs = Date.now() - start;
        if (probeResponse.ok) {
          return {
            available: true,
            reason: "ok_chat_probe",
            httpStatus: probeResponse.status,
            latencyMs: probeLatencyMs
          };
        }
        return {
          available: false,
          reason: probeResponse.status === 404 ? "endpoint_not_found_check_api_base" : `http_${probeResponse.status}`,
          httpStatus: probeResponse.status,
          latencyMs: probeLatencyMs
        };
      }

      return {
        available: false,
        reason: `http_${response.status}`,
        httpStatus: response.status,
        latencyMs
      };
    }

    const payload = (await response.json().catch(() => null)) as
      | { data?: Array<{ id?: string; name?: string }> }
      | null;
    const models = Array.isArray(payload?.data) ? payload.data : [];
    const hasModel = models.some((item) => item.id === profile.model || item.name === profile.model);

    return {
      available: true,
      reason: hasModel ? "ok_model_found" : "ok_endpoint_reachable",
      httpStatus: response.status,
      latencyMs
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const reason = error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error";
    return {
      available: false,
      reason,
      latencyMs
    };
  } finally {
    clearTimeout(timeout);
  }
}

function enforce(condition: unknown, statusCode: number, message: string): asserts condition {
  if (!condition) {
    throw new HttpError(statusCode, message);
  }
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await initRuntime();
  await prisma.modelProfile.deleteMany({
    where: { id: { in: LEGACY_BUILTIN_MODEL_IDS } }
  });
  await prisma.appSetting.updateMany({
    where: { defaultModelProfileId: { in: LEGACY_BUILTIN_MODEL_IDS } },
    data: { defaultModelProfileId: null }
  });

  app.get("/health", async () => ({ ok: true, ts: new Date().toISOString() }));

  app.post("/api/diagrams", async (request) => {
    const payload = createDiagramSchema.parse(request.body);
    const diagramId = createId("diagram");
    const nowElements = payload.elements ?? [];
    const diagram = await prisma.diagram.create({
      data: {
        id: diagramId,
        title: payload.title,
        type: payload.type,
        elementsJson: asJsonString(nowElements),
        appStateJson: asJsonString(payload.appState ?? null),
        currentVersion: 1
      }
    });

    return diagramToDto(diagram);
  });

  app.get("/api/diagrams", async () => {
    const diagrams = await prisma.diagram.findMany({
      where: { isDeleted: false },
      orderBy: { updatedAt: "desc" }
    });
    return diagrams.map((item) => diagramToDto(item));
  });

  app.get<{ Params: { id: string } }>("/api/diagrams/:id", async (request) => {
    const diagram = await prisma.diagram.findUnique({ where: { id: request.params.id } });
    enforce(diagram && !diagram.isDeleted, 404, "diagram not found");
    return diagramToDto(diagram);
  });

  app.patch<{ Params: { id: string } }>("/api/diagrams/:id", async (request) => {
    const payload = updateDiagramSchema.parse(request.body);
    const diagram = await prisma.diagram.findUnique({ where: { id: request.params.id } });
    enforce(diagram && !diagram.isDeleted, 404, "diagram not found");
    const updated = await prisma.diagram.update({
      where: { id: diagram.id },
      data: {
        title: payload.title ?? diagram.title,
        elementsJson:
          payload.elements !== undefined ? asJsonString(payload.elements) : diagram.elementsJson,
        appStateJson:
          payload.appState !== undefined ? asJsonString(payload.appState) : diagram.appStateJson
      }
    });
    return diagramToDto(updated);
  });

  app.delete<{ Params: { id: string } }>("/api/diagrams/:id", async (request) => {
    const diagram = await prisma.diagram.findUnique({ where: { id: request.params.id } });
    enforce(diagram, 404, "diagram not found");
    await prisma.diagram.update({
      where: { id: diagram.id },
      data: { isDeleted: true }
    });
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>("/api/diagrams/:id/revisions", async (request) => {
    void request;
    return [];
  });

  app.post<{ Params: { id: string; version: string } }>(
    "/api/diagrams/:id/revisions/:version/restore",
    async (request) => {
      const version = Number(request.params.version);
      enforce(Number.isInteger(version) && version > 0, 400, "invalid version");
      void request;
      void version;
      throw new HttpError(410, "version control is disabled");
    }
  );

  app.get<{ Params: { id: string } }>("/api/diagrams/:id/change-sets", async (request) => {
    void request;
    return [];
  });

  app.get<{ Params: { id: string } }>("/api/change-sets/:id/diff", async (request) => {
    void request;
    throw new HttpError(410, "version control is disabled");
  });

  app.post<{ Params: { id: string } }>("/api/change-sets/:id/revert", async (request) => {
    void request;
    throw new HttpError(410, "version control is disabled");
  });

  app.post("/api/generation-jobs", async (request) => {
    const payload = createGenerationJobSchema.parse(request.body);
    if (payload.modelProfileId) {
      enforce(!LEGACY_BUILTIN_MODEL_IDS.includes(payload.modelProfileId), 400, "legacy builtin profile is disabled");
    }

    if (payload.mode === "text") {
      enforce(payload.inputText, 400, "inputText is required in text mode");
    }
    if (payload.mode === "chat") {
      enforce(payload.diagramId, 400, "diagramId is required in chat mode");
      enforce(payload.instruction || payload.inputText, 400, "instruction is required in chat mode");
    }

    const modelProfile = payload.modelProfileId
      ? await prisma.modelProfile.findUnique({ where: { id: payload.modelProfileId } })
      : await prisma.modelProfile.findFirst({
          where: {
            isDefault: true,
            enabled: true,
            id: { notIn: LEGACY_BUILTIN_MODEL_IDS }
          }
        });
    enforce(modelProfile, 400, "no custom model profile configured");

    const jobId = createId("job");
    await prisma.generationJob.create({
      data: {
        id: jobId,
        diagramId: payload.diagramId ?? null,
        jobType: mapModeToJobType(payload.mode as "text" | "chat"),
        status: "pending",
        inputText: payload.instruction ?? payload.inputText ?? null,
        inputAssetId: null,
        inputType: payload.mode,
        irJson: asJsonString({
          diagramType: payload.diagramType,
          options: payload.options ?? {},
          instruction: payload.instruction ?? null,
          selection: Array.isArray(payload.options?.selection) ? payload.options.selection : [],
          modelProfileId: modelProfile.id
        }),
        provider: modelProfile.provider,
        model: modelProfile.model
      }
    });

    queueGenerationJob(jobId);
    return { jobId };
  });

  app.get<{ Params: { jobId: string } }>("/api/generation-jobs/:jobId", async (request) => {
    const job = await prisma.generationJob.findUnique({ where: { id: request.params.jobId } });
    enforce(job, 404, "job not found");

    return {
      jobId: job.id,
      status: job.status,
      progress: job.status === "pending" ? 0 : job.status === "running" ? 50 : 100,
      result: safeJsonParse<DiagramElement[] | null>(job.resultElementsJson, null),
      reasoningSummary: safeJsonParse<Record<string, unknown> | null>(job.reasoningSummaryJson, null),
      error: job.errorMessage
    };
  });

  app.post<{ Params: { jobId: string } }>("/api/generation-jobs/:jobId/apply", async (request) => {
    const payload = applyGenerationJobSchema.parse(request.body);
    const job = await prisma.generationJob.findUnique({ where: { id: request.params.jobId } });
    enforce(job, 404, "job not found");
    enforce(job.status === "succeeded", 422, "job is not ready");

    const diagram = await prisma.diagram.findUnique({ where: { id: payload.diagramId } });
    enforce(diagram && !diagram.isDeleted, 404, "diagram not found");

    const nextElements = safeJsonParse<DiagramElement[]>(job.resultElementsJson, []);
    enforce(nextElements.length > 0, 422, "job result is empty");
    await prisma.diagram.update({
      where: { id: diagram.id },
      data: { elementsJson: asJsonString(nextElements) }
    });

    return {
      ok: true,
      changeSetId: "",
      newVersion: diagram.currentVersion
    };
  });

  app.post("/api/chat/sessions", async (request) => {
    const payload = createChatSessionSchema.parse(request.body);
    const diagram = await prisma.diagram.findUnique({ where: { id: payload.diagramId } });
    enforce(diagram, 404, "diagram not found");
    const session = await prisma.chatSession.create({
      data: {
        id: createId("chat"),
        diagramId: payload.diagramId
      }
    });
    return { sessionId: session.id };
  });

  app.get<{ Params: { id: string } }>("/api/chat/sessions/:id/turns", async (request) => {
    const turns = await prisma.chatTurn.findMany({
      where: { sessionId: request.params.id },
      orderBy: { createdAt: "asc" }
    });
    return turns.map((item) => ({
      id: item.id,
      role: item.role,
      content: item.content,
      changeSetId: item.changeSetId,
      createdAt: toIso(item.createdAt)
    }));
  });

  app.post<{ Params: { id: string } }>("/api/chat/sessions/:id/turns", async (request) => {
    const payload = createChatTurnSchema.parse(request.body);
    if (payload.modelProfileId) {
      enforce(!LEGACY_BUILTIN_MODEL_IDS.includes(payload.modelProfileId), 400, "legacy builtin profile is disabled");
    }
    const session = await prisma.chatSession.findUnique({ where: { id: request.params.id } });
    enforce(session, 404, "session not found");

    const diagram = await prisma.diagram.findUnique({ where: { id: session.diagramId } });
    enforce(diagram, 404, "diagram not found");

    const userTurn = await prisma.chatTurn.create({
      data: {
        id: createId("turn"),
        sessionId: session.id,
        role: "user",
        content: payload.content
      }
    });

    const modelProfile = payload.modelProfileId
      ? await prisma.modelProfile.findUnique({ where: { id: payload.modelProfileId } })
      : await prisma.modelProfile.findFirst({
          where: {
            isDefault: true,
            enabled: true,
            id: { notIn: LEGACY_BUILTIN_MODEL_IDS }
          }
        });
    enforce(modelProfile, 400, "no custom model profile configured");

    const jobId = createId("job");
    await prisma.generationJob.create({
      data: {
        id: jobId,
        diagramId: session.diagramId,
        jobType: "chat_edit",
        status: "pending",
        inputText: payload.content,
        inputAssetId: null,
        inputType: "chat",
        irJson: asJsonString({
          diagramType: diagram.type,
          instruction: payload.content,
          selection: payload.selection ?? [],
          sessionId: session.id,
          modelProfileId: modelProfile.id
        }),
        provider: modelProfile.provider,
        model: modelProfile.model
      }
    });
    queueGenerationJob(jobId);

    return {
      sessionId: session.id,
      userTurnId: userTurn.id,
      jobId
    };
  });

  app.get("/api/templates", async (request) => {
    const query = request.query as { category?: string; diagramType?: string };
    const templates = await prisma.template.findMany({
      where: {
        category: query.category,
        diagramType: query.diagramType
      },
      orderBy: { createdAt: "desc" }
    });
    return templates.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      diagramType: item.diagramType,
      isBuiltin: item.isBuiltin
    }));
  });

  app.get<{ Params: { id: string } }>("/api/templates/:id", async (request) => {
    const template = await prisma.template.findUnique({ where: { id: request.params.id } });
    enforce(template, 404, "template not found");
    return {
      id: template.id,
      name: template.name,
      category: template.category,
      diagramType: template.diagramType,
      template: safeJsonParse<Record<string, unknown>>(template.templateJson, {})
    };
  });

  app.post<{ Params: { id: string } }>("/api/templates/:id/apply", async (request) => {
    const body = request.body as { diagramId?: string };
    enforce(body?.diagramId, 400, "diagramId is required");

    const template = await prisma.template.findUnique({ where: { id: request.params.id } });
    enforce(template, 404, "template not found");

    const diagram = await prisma.diagram.findUnique({ where: { id: body.diagramId } });
    enforce(diagram, 404, "diagram not found");

    const templateJson = safeJsonParse<{ elements?: DiagramElement[] }>(template.templateJson, {});
    const elements = templateJson.elements ?? [];
    await prisma.diagram.update({
      where: { id: diagram.id },
      data: {
        elementsJson: asJsonString(elements)
      }
    });

    return { ok: true, diagramId: diagram.id, newVersion: diagram.currentVersion };
  });

  app.get("/api/icons", async (request) => {
    const query = request.query as { category?: string; q?: string };
    const icons = await prisma.icon.findMany({
      where: {
        category: query.category,
        name: query.q ? { contains: query.q } : undefined
      },
      orderBy: { name: "asc" }
    });
    return icons;
  });

  app.post("/api/icons/upload", async (request) => {
    const file = await request.file();
    enforce(file, 400, "missing file");
    enforce(ICON_MIMES.has(file.mimetype.toLowerCase()), 415, "unsupported icon type");

    // 直接保存图标文件到 iconStorageDir
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(config.iconStorageDir, { recursive: true });
    const buffer = await file.toBuffer();
    const safeName = file.filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const filePath = path.join(config.iconStorageDir, `${Date.now()}-${safeName}`);
    await writeFile(filePath, buffer);

    const icon = await prisma.icon.create({
      data: {
        id: createId("icon"),
        name: file.filename,
        category: "custom",
        source: "custom",
        tags: "custom,upload"
      }
    });
    return icon;
  });

  app.get("/api/model-profiles", async () => {
    const profiles = await prisma.modelProfile.findMany({
      where: { id: { notIn: LEGACY_BUILTIN_MODEL_IDS } },
      orderBy: [{ qualityRank: "asc" }, { provider: "asc" }]
    });
    return profiles.map((item) => modelProfileToDto(item));
  });

  app.post("/api/model-profiles", async (request) => {
    const payload = createModelProfileSchema.parse(request.body);
    if (payload.isDefault) {
      await prisma.modelProfile.updateMany({ data: { isDefault: false } });
    }
    const profile = await prisma.modelProfile.create({
      data: {
        id: createId("profile"),
        provider: payload.provider,
        model: payload.model,
        apiBase: payload.apiBase ?? null,
        apiKey: payload.apiKey?.trim() || null,
        qualityRank: payload.qualityRank,
        isDefault: payload.isDefault ?? false,
        enabled: payload.enabled ?? true
      }
    });
    return modelProfileToDto(profile);
  });

  app.patch<{ Params: { id: string } }>("/api/model-profiles/:id", async (request) => {
    enforce(!LEGACY_BUILTIN_MODEL_IDS.includes(request.params.id), 400, "cannot edit legacy builtin profile");
    const payload = patchModelProfileSchema.parse(request.body);
    if (payload.isDefault) {
      await prisma.modelProfile.updateMany({ data: { isDefault: false } });
    }

    const updated = await prisma.modelProfile.update({
      where: { id: request.params.id },
      data: {
        model: payload.model,
        apiBase: payload.apiBase,
        apiKey: payload.apiKey,
        qualityRank: payload.qualityRank,
        isDefault: payload.isDefault,
        enabled: payload.enabled
      }
    });
    return modelProfileToDto(updated);
  });

  app.post<{ Params: { id: string } }>("/api/model-profiles/:id/check", async (request) => {
    try {
      const profile = await prisma.modelProfile.findUnique({ where: { id: request.params.id } });
      enforce(profile, 404, "model profile not found");
      const check = await checkModelProfileConnection(profile);
      return {
        profileId: profile.id,
        available: check.available,
        reason: check.reason,
        httpStatus: check.httpStatus ?? null,
        latencyMs: check.latencyMs
      };
    } catch (error) {
      request.log.error(error);
      const reason = error instanceof Error ? `exception:${error.name}` : "exception:unknown";
      return {
        profileId: request.params.id,
        available: false,
        reason,
        httpStatus: null,
        latencyMs: 0
      };
    }
  });

  app.post("/api/settings/default-model-profile", async (request) => {
    const payload = setDefaultModelSchema.parse(request.body);
    enforce(!LEGACY_BUILTIN_MODEL_IDS.includes(payload.modelProfileId), 400, "legacy builtin profile is disabled");
    const profile = await prisma.modelProfile.findUnique({ where: { id: payload.modelProfileId } });
    enforce(profile, 404, "model profile not found");

    await prisma.$transaction(async (tx) => {
      await tx.modelProfile.updateMany({ data: { isDefault: false } });
      await tx.modelProfile.update({
        where: { id: profile.id },
        data: { isDefault: true }
      });
      await tx.appSetting.upsert({
        where: { id: 1 },
        update: {
          defaultModelProfileId: profile.id,
          temperature: config.aiTemperature,
          maxTokens: config.aiMaxTokens
        },
        create: {
          id: 1,
          defaultModelProfileId: profile.id,
          temperature: config.aiTemperature,
          maxTokens: config.aiMaxTokens,
          theme: "system"
        }
      });
    });
    return { ok: true, defaultModelProfileId: profile.id };
  });
}