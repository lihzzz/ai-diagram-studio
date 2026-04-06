import fs from "node:fs/promises";
import path from "node:path";

import type { DiagramElement, DiagramType } from "../types/domain.js";

import { prisma } from "../db.js";
import { config } from "../config.js";
import { asJsonString, safeJsonParse } from "../utils/json.js";
import { createId } from "../utils/id.js";
import { applyChangeSet } from "../domain/diff.js";
import {
  generateChangeSetFromInstruction,
  generateElementsFromDocument,
  generateElementsFromImageHint,
  generateElementsFromText
} from "../domain/mock-generation.js";
import type { Message } from "./openai-compatible.js";
import { requestJsonFromModel } from "./openai-compatible.js";
import { layoutGraphWithDagre, layoutGraphFallback } from "../domain/graph-layout.js";

type JobMeta = {
  diagramType: DiagramType;
  instruction?: string;
  selection?: string[];
  modelProfileId?: string;
};

type GraphNodeKind = "start_end" | "process" | "decision" | "data";

type GraphNode = {
  id: string;
  title: string;
  kind?: GraphNodeKind;
};

type GraphEdge = {
  from: string;
  to: string;
  label?: string;
};

type GraphPayload = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  reasoningSummary?: Record<string, unknown>;
};

async function ensureDirs(): Promise<void> {
  await fs.mkdir(config.assetStorageDir, { recursive: true });
  await fs.mkdir(config.exportOutputDir, { recursive: true });
}

function parseJobMeta(raw: string | null): JobMeta {
  const parsed = safeJsonParse<Record<string, unknown>>(raw, {});
  const diagramType = parsed.diagramType === "module_architecture" ? "module_architecture" : "flowchart";
  return {
    diagramType,
    instruction: typeof parsed.instruction === "string" ? parsed.instruction : undefined,
    selection: Array.isArray(parsed.selection)
      ? parsed.selection.filter((item): item is string => typeof item === "string")
      : undefined,
    modelProfileId: typeof parsed.modelProfileId === "string" ? parsed.modelProfileId : undefined
  };
}

function normalizeId(raw: string, index: number): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || `n${index + 1}`;
}

function sanitizeId(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || null;
}

function addAlias(aliasMap: Map<string, string>, alias: string, id: string): void {
  const key = alias.trim().toLowerCase();
  if (!key) {
    return;
  }
  if (!aliasMap.has(key)) {
    aliasMap.set(key, id);
  }
}

function resolveNodeRef(raw: string, aliasMap: Map<string, string>, nodeIdSet: Set<string>): string | null {
  const key = raw.trim().toLowerCase();
  if (!key) {
    return null;
  }
  const direct = aliasMap.get(key);
  if (direct && nodeIdSet.has(direct)) {
    return direct;
  }
  const sanitized = sanitizeId(raw);
  if (sanitized && nodeIdSet.has(sanitized)) {
    return sanitized;
  }
  return null;
}

function normalizeNodeKind(raw: unknown): GraphNodeKind {
  if (typeof raw !== "string") {
    return "process";
  }
  const value = raw.trim().toLowerCase();
  if (value === "start_end" || value === "start-end" || value === "terminator" || value === "start" || value === "end") {
    return "start_end";
  }
  if (value === "decision" || value === "judge") {
    return "decision";
  }
  if (value === "data" || value === "io" || value === "input_output") {
    return "data";
  }
  return "process";
}

function toGraphPayload(payload: Record<string, unknown>): GraphPayload {
  const nodesRaw = Array.isArray(payload.nodes)
    ? payload.nodes
    : Array.isArray(payload.steps)
      ? payload.steps
      : Array.isArray(payload.modules)
        ? payload.modules
        : [];

  const nodes: GraphNode[] = nodesRaw
    .map((item, index) => {
      if (typeof item === "string") {
        const id = normalizeId(item, index);
        return { id, title: item };
      }
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title : typeof record.name === "string" ? record.name : null;
      if (!title) {
        return null;
      }
      const rawId = typeof record.id === "string" ? record.id : title;
      return {
        id: normalizeId(rawId, index),
        title,
        kind: normalizeNodeKind(record.kind ?? record.type)
      };
    })
    .filter((item): item is GraphNode => item !== null);

  if (nodes.length === 0) {
    throw new Error("model output has no nodes");
  }

  const nodeIdSet = new Set(nodes.map((item) => item.id));
  const aliasMap = new Map<string, string>();
  nodes.forEach((node) => {
    addAlias(aliasMap, node.id, node.id);
    addAlias(aliasMap, node.title, node.id);
    const fromId = sanitizeId(node.id);
    if (fromId) {
      addAlias(aliasMap, fromId, node.id);
    }
    const fromTitle = sanitizeId(node.title);
    if (fromTitle) {
      addAlias(aliasMap, fromTitle, node.id);
    }
  });

  const edgesRaw = Array.isArray(payload.edges) ? payload.edges : [];
  const edges = edgesRaw
    .map<GraphEdge | null>((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const fromRef = typeof record.from === "string" ? record.from : "";
      const toRef = typeof record.to === "string" ? record.to : "";
      const from = fromRef ? resolveNodeRef(fromRef, aliasMap, nodeIdSet) : null;
      const to = toRef ? resolveNodeRef(toRef, aliasMap, nodeIdSet) : null;
      if (!from || !to) {
        return null;
      }
      return {
        from,
        to,
        label: typeof record.label === "string" ? record.label : undefined
      };
    })
    .filter((item): item is GraphEdge => item !== null);

  if (edges.length === 0 && nodes.length > 1) {
    for (let index = 0; index < nodes.length - 1; index += 1) {
      edges.push({ from: nodes[index].id, to: nodes[index + 1].id });
    }
  }

  return {
    nodes,
    edges,
    reasoningSummary:
      payload.reasoningSummary && typeof payload.reasoningSummary === "object"
        ? (payload.reasoningSummary as Record<string, unknown>)
        : undefined
  };
}


function graphToElements(graph: GraphPayload, diagramType: DiagramType): DiagramElement[] {
  // 使用 Dagre 算法进行智能布局，失败时回退到原有算法
  let positions: Map<string, { x: number; y: number }>;
  try {
    positions = layoutGraphWithDagre(graph, { diagramType });
  } catch {
    positions = layoutGraphFallback(graph);
  }
  const nodeElements = graph.nodes.map((node) => {
    const pos = positions.get(node.id) ?? { x: 120, y: 100 };
    const kind = diagramType === "module_architecture" ? "process" : node.kind ?? "process";
    const shapeType = kind === "decision" ? "diamond" : kind === "start_end" ? "ellipse" : "rectangle";
    const width = kind === "decision" ? 260 : 240;
    const height = kind === "decision" ? 140 : kind === "start_end" ? 92 : 100;
    return {
      id: node.id,
      type: shapeType,
      x: pos.x,
      y: pos.y,
      width,
      height,
      text: diagramType === "module_architecture" ? `Module: ${node.title}` : node.title,
      meta: { kind }
    };
  });

  const edgeElements = graph.edges.map((edge, index) => ({
    id: createId(`edge${index + 1}`),
    type: "arrow",
    x: 0,
    y: 0,
    text: edge.label ? `${edge.from}->${edge.to}:${edge.label}` : `${edge.from}->${edge.to}`,
    meta: {
      fromId: edge.from,
      toId: edge.to,
      label: edge.label ?? null
    }
  }));

  return [...nodeElements, ...edgeElements];
}

function fallbackReasoningSummary(params: {
  inputType: string;
  diagramType: DiagramType;
  sourceRefs: string[];
  modelReasoning?: Record<string, unknown>;
}) {
  if (params.modelReasoning) {
    return {
      ...params.modelReasoning,
      sources: Array.isArray(params.modelReasoning.sources)
        ? params.modelReasoning.sources
        : params.sourceRefs
    };
  }
  return {
    layeringReason: params.diagramType === "module_architecture" ? "按职责与依赖分层" : "按业务顺序编排",
    keyDependencies: ["上游输入", "核心处理", "下游输出"],
    alternatives: ["可拆分子流程", "可增加异常分支"],
    sources: params.sourceRefs,
    inputType: params.inputType
  };
}

function summarizeElements(elements: DiagramElement[]): string {
  const nodes = elements
    .filter((item) => item.type !== "arrow")
    .map((item) => `${item.id}[${item.type}]:${item.text ?? ""}`)
    .join("\n");
  const edges = elements
    .filter((item) => item.type === "arrow")
    .map((item) => {
      const from = item.meta?.fromId ?? "?";
      const to = item.meta?.toId ?? "?";
      const label = typeof item.meta?.label === "string" && item.meta.label.trim() ? `:${item.meta.label.trim()}` : "";
      return `${from}->${to}${label}`;
    })
    .join("\n");
  return `Nodes:\n${nodes || "(none)"}\nEdges:\n${edges || "(none)"}`;
}

function systemPrompt(diagramType: DiagramType, mode: string): string {
  return [
    "You are a senior diagram planner.",
    `Task mode: ${mode}. Diagram type: ${diagramType}.`,
    "Return ONLY a JSON object with this schema:",
    "{",
    '  "nodes": [{"id":"string","title":"string","kind":"start_end|process|decision|data"}],',
    '  "edges": [{"from":"nodeId","to":"nodeId","label":"optional"}],',
    '  "reasoningSummary": {"layeringReason":"string","keyDependencies":["..."],"alternatives":["..."],"sources":["..."]}',
    "}",
    "Use at least 4 nodes for flowchart unless input is extremely short.",
    "For flowchart, include start_end nodes where appropriate.",
    "Do not include markdown code fences."
  ].join("\n");
}

function userPromptForText(inputText: string): string {
  return [
    "Generate a practical diagram from this requirement:",
    inputText,
    "Need enough steps/modules to be useful. Avoid single-node output."
  ].join("\n");
}

function userPromptForDocument(documentText: string): string {
  return [
    "Generate a diagram from this document content:",
    documentText,
    "Extract key stages/modules and dependencies."
  ].join("\n");
}

function userPromptForChat(instruction: string, current: DiagramElement[]): string {
  return [
    "Apply this incremental edit instruction and return full updated graph JSON.",
    `Instruction: ${instruction}`,
    "Current graph summary:",
    summarizeElements(current),
    "Keep unrelated parts stable and only change necessary parts."
  ].join("\n");
}

async function buildFallbackResult(params: {
  job: {
    id: string;
    jobType: string;
    inputType: string;
    inputText: string | null;
    inputAssetId: string | null;
    diagramId: string | null;
  };
  meta: JobMeta;
  reason: string;
}): Promise<{
  elements: DiagramElement[];
  reasoning: Record<string, unknown>;
} | null> {
  const { job, meta, reason } = params;
  let elements: DiagramElement[] | null = null;
  let sourceRefs: string[] = ["fallback_mock"];
  let fallbackSummary: string | undefined;

  if (job.jobType === "text_generate") {
    elements = generateElementsFromText(job.inputText ?? "", meta.diagramType);
    sourceRefs = ["text_input", "fallback_mock"];
  }

  if (job.jobType === "doc_generate") {
    const chunks = job.inputAssetId
      ? await prisma.docChunk.findMany({
          where: { assetId: job.inputAssetId },
          orderBy: { chunkIndex: "asc" },
          take: 16
        })
      : [];
    const chunkTexts = chunks.map((item) => item.content);
    elements = generateElementsFromDocument(chunkTexts.length > 0 ? chunkTexts : [job.inputText ?? ""], meta.diagramType);
    sourceRefs = [job.inputAssetId ?? "document_input", "doc_chunks", "fallback_mock"];
  }

  if (job.jobType === "image_generate") {
    const asset = job.inputAssetId ? await prisma.inputAsset.findUnique({ where: { id: job.inputAssetId } }) : null;
    elements = generateElementsFromImageHint(asset?.filename ?? "image-input", meta.diagramType);
    sourceRefs = [asset?.id ?? "image_input", "fallback_mock"];
  }

  if (job.jobType === "chat_edit") {
    if (!job.diagramId) {
      return null;
    }
    const diagram = await prisma.diagram.findUnique({ where: { id: job.diagramId } });
    if (!diagram) {
      return null;
    }
    const current = safeJsonParse<DiagramElement[]>(diagram.elementsJson, []);
    const patch = generateChangeSetFromInstruction(current, meta.instruction ?? job.inputText ?? "", meta.selection ?? []);
    elements = applyChangeSet(current, patch.ops);
    fallbackSummary = patch.summary;
    sourceRefs = [job.diagramId, "chat_instruction", "fallback_mock"];
  }

  if (!elements || elements.length === 0) {
    return null;
  }

  const reasoning = fallbackReasoningSummary({
    inputType: job.inputType,
    diagramType: meta.diagramType,
    sourceRefs,
    modelReasoning: {
      layeringReason: "模型调用失败，使用本地规则兜底生成",
      keyDependencies: ["输入内容", "规则拆分", "自动连线"],
      alternatives: ["稍后可重试在线模型", "可改为更短输入再生成"],
      sources: sourceRefs,
      fallback: true,
      fallbackReason: reason,
      fallbackSummary: fallbackSummary ?? null
    }
  });

  return { elements, reasoning };
}

function messageWithImage(prompt: string, dataUrl: string): Array<Record<string, unknown>> {
  return [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: dataUrl } }
  ];
}

async function resolveModelProfile(job: {
  provider: string | null;
  model: string | null;
}, meta: JobMeta) {
  if (meta.modelProfileId) {
    const profile = await prisma.modelProfile.findUnique({ where: { id: meta.modelProfileId } });
    if (profile) {
      return profile;
    }
  }

  if (job.provider && job.model) {
    const profile = await prisma.modelProfile.findFirst({
      where: {
        provider: job.provider,
        model: job.model,
        enabled: true
      }
    });
    if (profile) {
      return profile;
    }
  }

  const fallback = await prisma.modelProfile.findFirst({
    where: { isDefault: true, enabled: true },
    orderBy: { qualityRank: "asc" }
  });
  if (fallback) {
    return fallback;
  }

  throw new Error("no_available_model_profile");
}

async function loadImageAsDataUrl(assetPath: string, mimeType: string): Promise<string> {
  const file = await fs.readFile(assetPath);
  const base64 = file.toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

async function runGenerationJob(jobId: string): Promise<void> {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "pending") {
    return;
  }

  await prisma.generationJob.update({
    where: { id: job.id },
    data: {
      status: "running",
      provider: job.provider,
      model: job.model,
      errorMessage: null
    }
  });

  try {
    const meta = parseJobMeta(job.irJson);
    const profile = await resolveModelProfile(job, meta);
    if (!profile.apiKey?.trim()) {
      throw new Error("model_profile_api_key_missing");
    }

    let messages: Message[] = [{ role: "system", content: systemPrompt(meta.diagramType, job.inputType) }];
    let sourceRefs: string[] = [];

    if (job.jobType === "text_generate") {
      messages.push({ role: "user", content: userPromptForText(job.inputText ?? "") });
      sourceRefs = ["text_input"];
    }

    if (job.jobType === "doc_generate") {
      if (!job.inputAssetId) {
        throw new Error("doc_generate job missing inputAssetId");
      }
      const chunks = await prisma.docChunk.findMany({
        where: { assetId: job.inputAssetId },
        orderBy: { chunkIndex: "asc" },
        take: 16
      });
      const text = chunks.map((item) => item.content).join("\n\n");
      messages.push({ role: "user", content: userPromptForDocument(text || (job.inputText ?? "")) });
      sourceRefs = [job.inputAssetId, "doc_chunks"];
    }

    if (job.jobType === "image_generate") {
      if (!job.inputAssetId) {
        throw new Error("image_generate job missing inputAssetId");
      }
      const asset = await prisma.inputAsset.findUnique({ where: { id: job.inputAssetId } });
      if (!asset) {
        throw new Error("image asset not found");
      }
      const dataUrl = await loadImageAsDataUrl(asset.storagePath, asset.mimeType);
      messages.push({
        role: "user",
        content: messageWithImage(
          "Recognize this diagram image and convert it into editable nodes and directed edges.",
          dataUrl
        )
      });
      sourceRefs = [asset.id, "image_input"];
    }

    if (job.jobType === "chat_edit") {
      if (!job.diagramId) {
        throw new Error("chat_edit job missing diagramId");
      }
      const diagram = await prisma.diagram.findUnique({ where: { id: job.diagramId } });
      if (!diagram) {
        throw new Error("diagram not found");
      }
      const current = safeJsonParse<DiagramElement[]>(diagram.elementsJson, []);
      messages.push({
        role: "user",
        content: userPromptForChat(meta.instruction ?? job.inputText ?? "", current)
      });
      sourceRefs = [job.diagramId, "chat_instruction"];
    }

    const modelJson = await requestJsonFromModel({
      profile: {
        provider: profile.provider,
        model: profile.model,
        apiBase: profile.apiBase,
        apiKey: profile.apiKey
      },
      messages,
      temperature: config.aiTemperature,
      maxTokens: config.aiMaxTokens,
      timeoutMs: config.aiTimeoutMs
    });

    const graph = toGraphPayload(modelJson);
    const elements = graphToElements(graph, meta.diagramType);
    const reasoning = fallbackReasoningSummary({
      inputType: job.inputType,
      diagramType: meta.diagramType,
      sourceRefs,
      modelReasoning: graph.reasoningSummary
    });

    await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        status: "succeeded",
        provider: profile.provider,
        model: profile.model,
        resultElementsJson: asJsonString(elements),
        reasoningSummaryJson: asJsonString(reasoning)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown worker error";
    const meta = parseJobMeta(job.irJson);
    const fallback = await buildFallbackResult({
      job: {
        id: job.id,
        jobType: job.jobType,
        inputType: job.inputType,
        inputText: job.inputText,
        inputAssetId: job.inputAssetId,
        diagramId: job.diagramId
      },
      meta,
      reason: message
    });
    if (fallback) {
      await prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: "succeeded",
          resultElementsJson: asJsonString(fallback.elements),
          reasoningSummaryJson: asJsonString(fallback.reasoning),
          errorMessage: null
        }
      });
      return;
    }

    if (job.retryCount < 1) {
      await prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: "pending",
          retryCount: job.retryCount + 1,
          errorMessage: message
        }
      });
      queueGenerationJob(job.id, 800);
      return;
    }

    await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        errorMessage: message
      }
    });
  }
}

async function runExportJob(jobId: string): Promise<void> {
  const job = await prisma.exportJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "pending") {
    return;
  }

  await prisma.exportJob.update({
    where: { id: job.id },
    data: { status: "running", errorMessage: null }
  });

  try {
    await ensureDirs();
    const diagram = await prisma.diagram.findUnique({ where: { id: job.diagramId } });
    if (!diagram) {
      throw new Error("diagram not found");
    }

    const outputName = `${job.diagramId}-${Date.now()}.${job.format}`;
    const filePath = path.join(config.exportOutputDir, outputName);
    const payload = {
      format: job.format,
      title: diagram.title,
      generatedAt: new Date().toISOString(),
      elements: safeJsonParse<DiagramElement[]>(diagram.elementsJson, [])
    };

    if (job.format === "svg") {
      const svg = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1280\" height=\"720\"><text x=\"20\" y=\"40\">${diagram.title}</text></svg>`;
      await fs.writeFile(filePath, svg, "utf8");
    } else {
      await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    }

    await prisma.exportJob.update({
      where: { id: job.id },
      data: { status: "succeeded", filePath }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "export failed";
    await prisma.exportJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        errorMessage: message
      }
    });
  }
}

export async function initRuntime(): Promise<void> {
  await ensureDirs();
}

export function queueGenerationJob(jobId: string, delayMs = 100): void {
  setTimeout(() => {
    void runGenerationJob(jobId);
  }, delayMs);
}

export function queueExportJob(jobId: string, delayMs = 100): void {
  setTimeout(() => {
    void runExportJob(jobId);
  }, delayMs);
}
