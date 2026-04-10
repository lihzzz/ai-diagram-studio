import fs from "node:fs/promises";
import path from "node:path";

import { DEFAULT_RENDER_CONFIG, type RenderConfig } from "@ai-diagram-studio/shared";

import type { DiagramElement, DiagramType } from "../types/domain.js";

import { prisma } from "../db.js";
import { config } from "../config.js";
import { asJsonString, safeJsonParse } from "../utils/json.js";
import { createId } from "../utils/id.js";
import { generateElementsFromText, generateReasoningSummary } from "../domain/mock-generation.js";
import {
  layoutGraphFallback,
  layoutGraphWithELK,
  type GraphEdge,
  type GraphGroup,
  type GraphNode,
  type GraphNodeKind,
  type GraphPayload
} from "../domain/elk-layout.js";
import type { Message } from "./openai-compatible.js";
import { requestJsonFromModel } from "./openai-compatible.js";

type JobMeta = {
  diagramType: DiagramType;
  modelProfileId?: string;
  previousReasoning?: Record<string, unknown>;
  existingElements?: DiagramElement[];
  templateId?: string;
};

type TemplateInfo = {
  id: string;
  name: string;
  stylePrompt: string | null;
  renderConfig: RenderConfig;
};

type GroupFlatItem = {
  id: string;
  title: string;
  color?: string;
  parentId?: string;
};

async function ensureDirs(): Promise<void> {
  await fs.mkdir(config.uploadStorageDir, { recursive: true });
  await fs.mkdir(config.exportOutputDir, { recursive: true });
}

function cleanControlChars(value: string): string {
  return value.replace(/[\x00-\x1f]/g, " ").trim();
}

function parseJobMeta(raw: string | null): JobMeta {
  const parsed = safeJsonParse<Record<string, unknown>>(raw, {});
  const diagramType = parsed.diagramType === "module_architecture" ? "module_architecture" : "flowchart";
  const previousReasoning =
    parsed.previousReasoning && typeof parsed.previousReasoning === "object"
      ? (parsed.previousReasoning as Record<string, unknown>)
      : undefined;
  const existingElements = Array.isArray(parsed.existingElements)
    ? parsed.existingElements.filter((item): item is DiagramElement => {
        if (!item || typeof item !== "object") {
          return false;
        }
        const node = item as Partial<DiagramElement>;
        return (
          typeof node.id === "string" &&
          typeof node.type === "string" &&
          typeof node.x === "number" &&
          typeof node.y === "number"
        );
      })
    : undefined;

  return {
    diagramType,
    modelProfileId: typeof parsed.modelProfileId === "string" ? parsed.modelProfileId : undefined,
    previousReasoning,
    existingElements,
    templateId: typeof parsed.templateId === "string" ? parsed.templateId : undefined
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

function parseNodeRaw(raw: unknown, index: number): GraphNode | null {
  if (typeof raw === "string") {
    const id = normalizeId(raw, index);
    return { id, title: raw };
  }
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title : typeof record.name === "string" ? record.name : null;
  if (!title) {
    return null;
  }

  const rawId = typeof record.id === "string" ? record.id : title;
  return {
    id: normalizeId(rawId, index),
    title,
    subtitle: typeof record.subtitle === "string" ? record.subtitle : undefined,
    style: typeof record.style === "string" ? record.style : undefined,
    kind: normalizeNodeKind(record.kind ?? record.type)
  };
}

function parseGroupRaw(raw: unknown, index: number): GraphGroup | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title : typeof record.name === "string" ? record.name : null;
  if (!title) {
    return null;
  }
  const groupId = normalizeId(typeof record.id === "string" ? record.id : `group_${index + 1}`, index);

  const nodesRaw = Array.isArray(record.nodes) ? record.nodes : [];
  const childRaw = Array.isArray(record.children) ? record.children : [];

  const nodes = nodesRaw
    .map((node, nodeIndex) => parseNodeRaw(node, nodeIndex))
    .filter((item): item is GraphNode => item !== null);
  const children = childRaw
    .map((group, childIndex) => parseGroupRaw(group, childIndex))
    .filter((item): item is GraphGroup => item !== null);

  return {
    id: groupId,
    title,
    color: typeof record.color === "string" ? record.color : undefined,
    nodes,
    children: children.length > 0 ? children : undefined
  };
}

function collectNodes(groups: GraphGroup[], freeNodes: GraphNode[]): GraphNode[] {
  const all: GraphNode[] = [...freeNodes];
  const walk = (input: GraphGroup[]) => {
    for (const group of input) {
      all.push(...group.nodes);
      walk(group.children ?? []);
    }
  };
  walk(groups);
  return all;
}

function toGraphPayload(payload: Record<string, unknown>): GraphPayload {
  const groups = (Array.isArray(payload.groups) ? payload.groups : [])
    .map((group, index) => parseGroupRaw(group, index))
    .filter((item): item is GraphGroup => item !== null);

  const freeNodesRaw = Array.isArray(payload.freeNodes)
    ? payload.freeNodes
    : Array.isArray(payload.nodes)
      ? payload.nodes
      : Array.isArray(payload.steps)
        ? payload.steps
        : Array.isArray(payload.modules)
          ? payload.modules
          : [];

  const freeNodes = freeNodesRaw
    .map((node, index) => parseNodeRaw(node, index))
    .filter((item): item is GraphNode => item !== null);

  const nodes = collectNodes(groups, freeNodes);
  if (nodes.length === 0) {
    throw new Error("model output has no nodes");
  }

  const nodeIdSet = new Set(nodes.map((item) => item.id));
  const aliasMap = new Map<string, string>();
  for (const node of nodes) {
    addAlias(aliasMap, node.id, node.id);
    addAlias(aliasMap, node.title, node.id);
    const sanitizedId = sanitizeId(node.id);
    if (sanitizedId) {
      addAlias(aliasMap, sanitizedId, node.id);
    }
    const sanitizedTitle = sanitizeId(node.title);
    if (sanitizedTitle) {
      addAlias(aliasMap, sanitizedTitle, node.id);
    }
  }

  const resolveNodeRef = (raw: string): string | null => {
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
  };

  const edgesRaw = Array.isArray(payload.edges) ? payload.edges : [];
  const edges = edgesRaw
    .map<GraphEdge | null>((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const fromRef = typeof record.from === "string" ? record.from : "";
      const toRef = typeof record.to === "string" ? record.to : "";
      const from = fromRef ? resolveNodeRef(fromRef) : null;
      const to = toRef ? resolveNodeRef(toRef) : null;
      if (!from || !to) {
        return null;
      }
      return {
        from,
        to,
        label: typeof record.label === "string" ? record.label : undefined,
        style: typeof record.style === "string" ? record.style : undefined
      };
    })
    .filter((item): item is GraphEdge => item !== null);

  if (edges.length === 0 && nodes.length > 1) {
    for (let index = 0; index < nodes.length - 1; index += 1) {
      edges.push({ from: nodes[index].id, to: nodes[index + 1].id, style: "solid" });
    }
  }

  return {
    groups,
    freeNodes,
    edges,
    reasoningSummary:
      payload.reasoningSummary && typeof payload.reasoningSummary === "object"
        ? (payload.reasoningSummary as Record<string, unknown>)
        : undefined
  };
}

function flattenGroups(groups: GraphGroup[], parentId?: string): GroupFlatItem[] {
  const list: GroupFlatItem[] = [];
  for (const group of groups) {
    list.push({ id: group.id, title: group.title, color: group.color, parentId });
    list.push(...flattenGroups(group.children ?? [], group.id));
  }
  return list;
}

function collectNodeParentMap(groups: GraphGroup[]): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (input: GraphGroup[]) => {
    for (const group of input) {
      for (const node of group.nodes) {
        map.set(node.id, group.id);
      }
      walk(group.children ?? []);
    }
  };
  walk(groups);
  return map;
}

async function graphToElements(graph: GraphPayload, diagramType: DiagramType): Promise<DiagramElement[]> {
  let layout;
  try {
    layout = await layoutGraphWithELK(graph);
  } catch {
    layout = layoutGraphFallback(graph);
  }

  const elements: DiagramElement[] = [];
  const flattenedGroups = flattenGroups(graph.groups);
  for (const group of flattenedGroups) {
    const item = layout.groups.get(group.id);
    elements.push({
      id: group.id,
      type: "group",
      x: item?.x ?? 100,
      y: item?.y ?? 100,
      width: item?.width ?? 420,
      height: item?.height ?? 280,
      text: group.title,
      parentId: item?.parentId ?? group.parentId,
      style: group.color ?? "blue",
      meta: {
        colorKey: group.color ?? "blue"
      }
    });
  }

  const nodeParentMap = collectNodeParentMap(graph.groups);
  const nodes = collectNodes(graph.groups, graph.freeNodes);
  for (const node of nodes) {
    const pos = layout.nodes.get(node.id) ?? { x: 120, y: 100, parentId: nodeParentMap.get(node.id) };
    const kind = diagramType === "module_architecture" ? "process" : node.kind ?? "process";
    elements.push({
      id: node.id,
      type: "step",
      x: pos.x,
      y: pos.y,
      width: pos.width ?? 220,
      height: pos.height ?? 96,
      text: diagramType === "module_architecture" ? `Module: ${node.title}` : node.title,
      subtitle: node.subtitle,
      parentId: pos.parentId ?? nodeParentMap.get(node.id),
      style: node.style ?? kind,
      meta: {
        kind
      }
    });
  }

  for (const [index, edge] of graph.edges.entries()) {
    elements.push({
      id: createId(`edge${index + 1}`),
      type: "arrow",
      x: 0,
      y: 0,
      text: edge.label ? `${edge.from}->${edge.to}:${edge.label}` : `${edge.from}->${edge.to}`,
      style: edge.style ?? "solid",
      meta: {
        fromId: edge.from,
        toId: edge.to,
        label: edge.label ?? null,
        style: edge.style ?? "solid"
      }
    });
  }

  return elements;
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

function systemPrompt(diagramType: DiagramType, template: TemplateInfo): string {
  const colorKeys = Object.keys(template.renderConfig.groupColors);
  const stepKinds = template.renderConfig.stepKinds;
  const edgeStyles = Object.keys(template.renderConfig.edgeStyles);

  return [
    "You are a senior diagram planner.",
    `Diagram type: ${diagramType}.`,
    `Group color keys: ${colorKeys.join("|")}.`,
    `Node kinds: ${stepKinds.join("|")}.`,
    `Edge styles: ${edgeStyles.join("|")}.`,
    "Return ONLY a JSON object with this schema:",
    "{",
    '  "groups": [{"id":"string","title":"string","color":"string","nodes":[{"id":"string","title":"string","subtitle":"optional","kind":"string","style":"string"}],"children":[]}],',
    '  "freeNodes": [{"id":"string","title":"string","subtitle":"optional","kind":"string","style":"string"}],',
    '  "edges": [{"from":"nodeId","to":"nodeId","label":"optional","style":"solid|dashed"}],',
    '  "reasoningSummary": {"layeringReason":"string","keyDependencies":["..."],"alternatives":["..."],"sources":["..."]}',
    "}",
    "Use groups when the content naturally has module/phase ownership.",
    template.stylePrompt ? `Visual style guidance: ${template.stylePrompt}` : "",
    "Do not include markdown code fences."
  ]
    .filter(Boolean)
    .join("\n");
}

function userPromptForText(params: {
  inputText: string;
  previousReasoning?: Record<string, unknown>;
  existingElements?: DiagramElement[];
}): string {
  const parts = [
    "Generate a practical diagram from this requirement:",
    params.inputText,
    "Need enough steps/modules to be useful. Avoid single-node output."
  ];

  if (params.previousReasoning) {
    parts.push("Previous reasoning summary:");
    parts.push(JSON.stringify(params.previousReasoning));
  }

  if (params.existingElements && params.existingElements.length > 0) {
    parts.push("Current diagram (for incremental optimization):");
    parts.push(summarizeElements(params.existingElements));
    parts.push("Preserve stable structure and only change necessary parts.");
  }

  return parts.join("\n");
}

function fallbackReasoningSummary(params: {
  inputType: string;
  diagramType: DiagramType;
  sourceRefs: string[];
  modelReasoning?: Record<string, unknown>;
}): Record<string, unknown> {
  if (params.modelReasoning) {
    return {
      ...params.modelReasoning,
      sources: Array.isArray(params.modelReasoning.sources) ? params.modelReasoning.sources : params.sourceRefs
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

async function loadTemplateInfo(templateId?: string): Promise<TemplateInfo> {
  const byId = templateId ? await prisma.template.findUnique({ where: { id: templateId } }) : null;
  const defaultTemplate =
    byId ??
    (await prisma.template.findFirst({
      where: { category: "style" },
      orderBy: [{ isBuiltin: "desc" }, { createdAt: "desc" }]
    }));

  if (!defaultTemplate) {
    return {
      id: "default",
      name: "default",
      stylePrompt: null,
      renderConfig: DEFAULT_RENDER_CONFIG
    };
  }

  const parsed = safeJsonParse<unknown>(defaultTemplate.renderConfigJson, DEFAULT_RENDER_CONFIG);
  const renderConfig =
    parsed &&
    typeof parsed === "object" &&
    "groupColors" in parsed &&
    "stepKinds" in parsed &&
    "stepShapes" in parsed &&
    "edgeStyles" in parsed &&
    "canvas" in parsed
      ? (parsed as RenderConfig)
      : DEFAULT_RENDER_CONFIG;

  return {
    id: defaultTemplate.id,
    name: defaultTemplate.name,
    stylePrompt: defaultTemplate.stylePrompt,
    renderConfig
  };
}

async function buildFallbackResult(params: {
  inputText: string;
  diagramType: DiagramType;
  reason: string;
}): Promise<{ elements: DiagramElement[]; reasoning: Record<string, unknown> } | null> {
  const inputText = params.inputText.trim();
  if (!inputText) {
    return null;
  }

  const elements = generateElementsFromText(inputText, params.diagramType);
  if (elements.length === 0) {
    return null;
  }

  const cleanReason = cleanControlChars(params.reason);
  const reasoning = {
    ...generateReasoningSummary({
      diagramType: params.diagramType,
      sourceRefs: ["text_input", "fallback_mock"],
      fallbackReason: cleanReason
    }),
    fallback: true,
    fallbackReason: cleanReason
  };

  return { elements, reasoning };
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

    const template = await loadTemplateInfo(meta.templateId ?? job.templateId ?? undefined);

    const messages: Message[] = [
      { role: "system", content: systemPrompt(meta.diagramType, template) },
      {
        role: "user",
        content: userPromptForText({
          inputText: job.inputText ?? "",
          previousReasoning: meta.previousReasoning,
          existingElements: meta.existingElements
        })
      }
    ];

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
    const elements = await graphToElements(graph, meta.diagramType);
    const reasoning = {
      ...fallbackReasoningSummary({
        inputType: "text",
        diagramType: meta.diagramType,
        sourceRefs: ["text_input"],
        modelReasoning: graph.reasoningSummary
      }),
      fallback: false
    };

    await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        status: "succeeded",
        provider: profile.provider,
        model: profile.model,
        resultElementsJson: asJsonString(elements),
        reasoningSummaryJson: asJsonString(reasoning),
        errorMessage: null
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown worker error";
    const meta = parseJobMeta(job.irJson);

    const fallback = await buildFallbackResult({
      inputText: job.inputText ?? "",
      diagramType: meta.diagramType,
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
          errorMessage: cleanControlChars(message)
        }
      });
      queueGenerationJob(job.id, 800);
      return;
    }

    await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        errorMessage: cleanControlChars(message)
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
