import fs from "node:fs/promises";
import path from "node:path";

import { DEFAULT_RENDER_CONFIG } from "@ai-diagram-studio/shared";

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
};

type GroupFlatItem = {
  id: string;
  title: string;
  color?: string;
  parentId?: string;
};

type GraphParseStats = {
  inputEdgeCount: number;
  resolvedEdgeCount: number;
  droppedEdgeCount: number;
  autoLinked: boolean;
};

type GraphParseResult = {
  graph: GraphPayload;
  stats: GraphParseStats;
};

type GraphValidationIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
};

const SUPPORTED_GROUP_COLOR_KEYS = Object.keys(DEFAULT_RENDER_CONFIG.groupColors);
const SUPPORTED_STEP_KINDS = [...DEFAULT_RENDER_CONFIG.stepKinds];
const SUPPORTED_EDGE_STYLES = Object.keys(DEFAULT_RENDER_CONFIG.edgeStyles);

async function ensureDirs(): Promise<void> {
  await fs.mkdir(config.uploadStorageDir, { recursive: true });
  await fs.mkdir(config.exportOutputDir, { recursive: true });
}

function cleanControlChars(value: string): string {
  return value.replace(/[\x00-\x1f]/g, " ").trim();
}

function truncateLogText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  const remain = text.length - maxChars;
  return `${text.slice(0, maxChars)}\n... <truncated ${remain} chars>`;
}

function logModelPrompt(params: {
  jobId: string;
  phase: "generate" | "repair";
  provider: string;
  model: string;
  diagramType: DiagramType;
  messages: Message[];
}): void {
  if (!config.aiLogPrompts) {
    return;
  }
  const header = [
    `[ai.request.prompt]`,
    `jobId=${params.jobId}`,
    `phase=${params.phase}`,
    `provider=${params.provider}`,
    `model=${params.model}`,
    `diagramType=${params.diagramType}`
  ].join(" ");
  const serialized = JSON.stringify(params.messages, null, 2);
  const body = truncateLogText(serialized, Math.max(1000, config.aiPromptLogMaxChars));
  console.info(header);
  console.info(body);
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
    existingElements
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

function normalizeGroupColor(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const value = raw.trim();
  if (!value || value.length > 40) {
    return undefined;
  }

  if (SUPPORTED_GROUP_COLOR_KEYS.includes(value)) {
    return value;
  }

  const hex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  const rgb = /^rgba?\(\s*(?:\d{1,3}%?\s*,\s*){2}\d{1,3}%?(?:\s*,\s*(?:0|0?\.\d+|1(?:\.0+)?))?\s*\)$/i;
  const hsl = /^hsla?\(\s*\d{1,3}(?:\.\d+)?(?:deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|0?\.\d+|1(?:\.0+)?))?\s*\)$/i;
  const named = /^[a-zA-Z]{3,20}$/;

  if (hex.test(value) || rgb.test(value) || hsl.test(value) || named.test(value)) {
    return value;
  }
  return undefined;
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
    color: normalizeGroupColor(record.color),
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

function toGraphPayload(payload: Record<string, unknown>): GraphParseResult {
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

  const resolvedEdgeCount = edges.length;
  let autoLinked = false;
  if (edges.length === 0 && nodes.length > 1) {
    autoLinked = true;
    for (let index = 0; index < nodes.length - 1; index += 1) {
      edges.push({ from: nodes[index].id, to: nodes[index + 1].id, style: "solid" });
    }
  }

  const graph: GraphPayload = {
    groups,
    freeNodes,
    edges,
    reasoningSummary:
      payload.reasoningSummary && typeof payload.reasoningSummary === "object"
        ? (payload.reasoningSummary as Record<string, unknown>)
        : undefined
  };

  return {
    graph,
    stats: {
      inputEdgeCount: edgesRaw.length,
      resolvedEdgeCount,
      droppedEdgeCount: Math.max(0, edgesRaw.length - resolvedEdgeCount),
      autoLinked
    }
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

function extractExistingDiagramSnapshot(elements: DiagramElement[]): {
  groups: Array<{ id: string; title: string; color?: string; parentId?: string }>;
  nodes: Array<{ id: string; title: string; kind: string; style?: string; parentId?: string }>;
  edges: Array<{ from: string; to: string; label?: string; style?: string }>;
} {
  const groups: Array<{ id: string; title: string; color?: string; parentId?: string }> = [];
  const nodes: Array<{ id: string; title: string; kind: string; style?: string; parentId?: string }> = [];
  const edges: Array<{ from: string; to: string; label?: string; style?: string }> = [];

  for (const item of elements) {
    if (item.type === "group") {
      groups.push({
        id: item.id,
        title: item.text ?? "",
        color: typeof item.meta?.colorKey === "string" ? item.meta.colorKey : item.style,
        parentId: item.parentId
      });
      continue;
    }

    if (item.type === "arrow") {
      const from = typeof item.meta?.fromId === "string" ? item.meta.fromId : "";
      const to = typeof item.meta?.toId === "string" ? item.meta.toId : "";
      if (from && to) {
        edges.push({
          from,
          to,
          label: typeof item.meta?.label === "string" ? item.meta.label : undefined,
          style: typeof item.meta?.style === "string" ? item.meta.style : item.style
        });
      }
      continue;
    }

    nodes.push({
      id: item.id,
      title: item.text ?? "",
      kind: typeof item.meta?.kind === "string" ? item.meta.kind : item.style ?? "process",
      style: item.style,
      parentId: item.parentId
    });
  }

  return { groups, nodes, edges };
}

function buildModelOutputJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["groups", "freeNodes", "edges", "reasoningSummary"],
    properties: {
      groups: {
        type: "array",
        items: { $ref: "#/$defs/group" }
      },
      freeNodes: {
        type: "array",
        items: { $ref: "#/$defs/node" }
      },
      edges: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["from", "to"],
          properties: {
            from: { type: "string", minLength: 1 },
            to: { type: "string", minLength: 1 },
            label: { type: "string" },
            style: { type: "string", enum: SUPPORTED_EDGE_STYLES }
          }
        }
      },
      reasoningSummary: {
        type: "object",
        additionalProperties: true,
        required: ["layeringReason", "keyDependencies", "alternatives", "sources"],
        properties: {
          layeringReason: { type: "string", minLength: 1 },
          keyDependencies: { type: "array", items: { type: "string" } },
          alternatives: { type: "array", items: { type: "string" } },
          sources: { type: "array", items: { type: "string" } }
        }
      }
    },
    $defs: {
      node: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "kind"],
        properties: {
          id: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 1 },
          subtitle: { type: "string" },
          kind: { type: "string", enum: SUPPORTED_STEP_KINDS },
          style: { type: "string", enum: SUPPORTED_STEP_KINDS }
        }
      },
      group: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "nodes"],
        properties: {
          id: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 1 },
          color: {
            type: "string",
            minLength: 1,
            maxLength: 40,
            pattern: "^(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\\([^\\n\\r]+\\)|hsla?\\([^\\n\\r]+\\)|[a-zA-Z]{3,20}|blue|green|yellow|red|purple|gray)$"
          },
          nodes: { type: "array", items: { $ref: "#/$defs/node" } },
          children: { type: "array", items: { $ref: "#/$defs/group" } }
        }
      }
    }
  };
}

function validateGraphPayload(graph: GraphPayload, params: { diagramType: DiagramType; stats: GraphParseStats }): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  const nodes = collectNodes(graph.groups, graph.freeNodes);

  if (nodes.length === 0) {
    issues.push({
      level: "error",
      code: "empty_nodes",
      message: "No valid nodes were generated."
    });
  }

  const nodeIdCount = new Map<string, number>();
  for (const node of nodes) {
    nodeIdCount.set(node.id, (nodeIdCount.get(node.id) ?? 0) + 1);
  }
  const duplicatedIds = Array.from(nodeIdCount.entries())
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
  if (duplicatedIds.length > 0) {
    issues.push({
      level: "error",
      code: "duplicate_node_ids",
      message: `Duplicated node ids: ${duplicatedIds.join(", ")}`
    });
  }

  if (nodes.length > 1 && graph.edges.length === 0) {
    issues.push({
      level: "error",
      code: "no_edges",
      message: "There are multiple nodes but no valid edges."
    });
  }

  if (params.stats.droppedEdgeCount > 0) {
    issues.push({
      level: params.stats.inputEdgeCount > 0 && params.stats.resolvedEdgeCount === 0 ? "error" : "warning",
      code: "unresolved_edges",
      message: `${params.stats.droppedEdgeCount} edge(s) were dropped because from/to could not be resolved to node ids.`
    });
  }

  if (params.stats.autoLinked) {
    issues.push({
      level: "warning",
      code: "auto_linked",
      message: "Model returned no valid edges; fallback sequential edges were auto-generated."
    });
  }

  if (params.diagramType === "flowchart") {
    if (nodes.length < 3) {
      issues.push({
        level: "warning",
        code: "too_few_nodes",
        message: "Flowchart usually needs at least 3 nodes for practical value."
      });
    }

    if (!nodes.some((node) => node.kind === "start_end")) {
      issues.push({
        level: "warning",
        code: "missing_start_end",
        message: "Flowchart should include at least one start/end node."
      });
    }

    const outDegree = new Map<string, number>();
    for (const edge of graph.edges) {
      outDegree.set(edge.from, (outDegree.get(edge.from) ?? 0) + 1);
    }

    const weakDecisionNodes = nodes
      .filter((node) => node.kind === "decision")
      .filter((node) => (outDegree.get(node.id) ?? 0) < 2)
      .map((node) => node.id);
    if (weakDecisionNodes.length > 0) {
      issues.push({
        level: "warning",
        code: "decision_branching",
        message: `Decision nodes should have at least two outgoing branches: ${weakDecisionNodes.join(", ")}`
      });
    }
  }

  return issues;
}

function formatValidationIssues(issues: GraphValidationIssue[]): string {
  if (issues.length === 0) {
    return "(none)";
  }
  return issues.map((item, index) => `${index + 1}. [${item.level}] ${item.code}: ${item.message}`).join("\n");
}

function systemPrompt(diagramType: DiagramType): string {
  return [
    "You are a senior diagram planner for a React Flow-based editor.",
    `Diagram type: ${diagramType}.`,
    "Group color should be model-selected and can be a CSS color string (hex/rgb/hsl/named color).",
    `Node kinds: ${SUPPORTED_STEP_KINDS.join("|")}.`,
    `Edge styles: ${SUPPORTED_EDGE_STYLES.join("|")}.`,
    "Output must be semantic graph JSON only (NOT React code, NOT markdown, NOT coordinates).",
    "Hard rules:",
    "1) Use stable, machine-friendly ids (lowercase, snake_case, no spaces).",
    "2) Every edge.from and edge.to must reference existing node ids.",
    "3) Reuse existing ids when editing an existing diagram unless replacement is necessary.",
    "4) For flowchart: include start/end semantics and keep decision branches explicit.",
    "5) Keep structure concise but practical; avoid single-node outputs.",
    "Return ONLY a JSON object with this shape:",
    "{",
    '  "groups": [{"id":"string","title":"string","color":"css_color_string","nodes":[{"id":"string","title":"string","subtitle":"optional","kind":"one_of_node_kinds","style":"one_of_node_kinds"}],"children":[...]}],',
    '  "freeNodes": [{"id":"string","title":"string","subtitle":"optional","kind":"one_of_node_kinds","style":"one_of_node_kinds"}],',
    '  "edges": [{"from":"existing_node_id","to":"existing_node_id","label":"optional","style":"solid|dashed"}],',
    '  "reasoningSummary": {"layeringReason":"string","keyDependencies":["..."],"alternatives":["..."],"sources":["..."]}',
    "}",
    "Use groups when content naturally has phase/layer/module ownership.",
    "Do not include markdown code fences."
  ]
    .filter(Boolean)
    .join("\n");
}

function userPromptForText(params: {
  inputText: string;
  diagramType: DiagramType;
  previousReasoning?: Record<string, unknown>;
  existingElements?: DiagramElement[];
}): string {
  const parts = [
    "Generate a practical, implementation-ready graph from this requirement:",
    params.inputText,
    "Need enough steps/modules to be useful. Avoid single-node output.",
    `Target diagram type: ${params.diagramType}.`
  ];

  if (params.previousReasoning) {
    parts.push("Previous reasoning summary:");
    parts.push(JSON.stringify(params.previousReasoning));
  }

  if (params.existingElements && params.existingElements.length > 0) {
    parts.push("Current diagram structured context (for incremental optimization):");
    parts.push(JSON.stringify(extractExistingDiagramSnapshot(params.existingElements)));
    parts.push("Editing rules: preserve stable ids/structure and only change necessary parts.");
  }

  return parts.join("\n");
}

function repairPromptForInvalidGraph(params: {
  inputText: string;
  diagramType: DiagramType;
  invalidOutput: Record<string, unknown>;
  issues: GraphValidationIssue[];
  previousReasoning?: Record<string, unknown>;
  existingElements?: DiagramElement[];
}): string {
  const parts = [
    "The previous JSON output is invalid for the graph editor constraints.",
    `Target diagram type: ${params.diagramType}.`,
    "Please FIX the JSON and return a complete corrected JSON object only.",
    "Validation issues:",
    formatValidationIssues(params.issues),
    "Previous invalid JSON:",
    JSON.stringify(params.invalidOutput),
    "Original requirement:",
    params.inputText
  ];

  if (params.previousReasoning) {
    parts.push("Previous reasoning summary:");
    parts.push(JSON.stringify(params.previousReasoning));
  }

  if (params.existingElements && params.existingElements.length > 0) {
    parts.push("Current diagram structured context:");
    parts.push(JSON.stringify(extractExistingDiagramSnapshot(params.existingElements)));
    parts.push("Keep existing IDs and structure stable when possible.");
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

    const outputSchema = buildModelOutputJsonSchema();

    const messages: Message[] = [
      { role: "system", content: systemPrompt(meta.diagramType) },
      {
        role: "user",
        content: userPromptForText({
          inputText: job.inputText ?? "",
          diagramType: meta.diagramType,
          previousReasoning: meta.previousReasoning,
          existingElements: meta.existingElements
        })
      }
    ];
    logModelPrompt({
      jobId: job.id,
      phase: "generate",
      provider: profile.provider,
      model: profile.model,
      diagramType: meta.diagramType,
      messages
    });

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
      timeoutMs: config.aiTimeoutMs,
      jsonSchema: {
        name: "diagram_graph_payload",
        schema: outputSchema,
        strict: true
      },
      debugTag: `${job.id}:generate`
    });

    let graphParse = toGraphPayload(modelJson);
    let graph = graphParse.graph;
    let validationIssues = validateGraphPayload(graph, {
      diagramType: meta.diagramType,
      stats: graphParse.stats
    });
    let repairApplied = false;

    const hardIssues = validationIssues.filter((item) => item.level === "error");
    if (hardIssues.length > 0) {
      const repairMessages: Message[] = [
        { role: "system", content: systemPrompt(meta.diagramType) },
        {
          role: "user",
          content: repairPromptForInvalidGraph({
            inputText: job.inputText ?? "",
            diagramType: meta.diagramType,
            invalidOutput: modelJson,
            issues: hardIssues,
            previousReasoning: meta.previousReasoning,
            existingElements: meta.existingElements
          })
        }
      ];
      logModelPrompt({
        jobId: job.id,
        phase: "repair",
        provider: profile.provider,
        model: profile.model,
        diagramType: meta.diagramType,
        messages: repairMessages
      });

      const repairedJson = await requestJsonFromModel({
        profile: {
          provider: profile.provider,
          model: profile.model,
          apiBase: profile.apiBase,
          apiKey: profile.apiKey
        },
        messages: repairMessages,
        temperature: Math.min(config.aiTemperature, 0.1),
        maxTokens: config.aiMaxTokens,
        timeoutMs: config.aiTimeoutMs,
        jsonSchema: {
          name: "diagram_graph_payload",
          schema: outputSchema,
          strict: true
        },
        debugTag: `${job.id}:repair`
      });

      graphParse = toGraphPayload(repairedJson);
      graph = graphParse.graph;
      validationIssues = validateGraphPayload(graph, {
        diagramType: meta.diagramType,
        stats: graphParse.stats
      });
      repairApplied = true;

      const repairHardIssues = validationIssues.filter((item) => item.level === "error");
      if (repairHardIssues.length > 0) {
        throw new Error(`model_output_invalid:${formatValidationIssues(repairHardIssues)}`);
      }
    }

    const elements = await graphToElements(graph, meta.diagramType);
    const warnings = validationIssues.filter((item) => item.level === "warning");
    const reasoning = {
      ...fallbackReasoningSummary({
        inputType: "text",
        diagramType: meta.diagramType,
        sourceRefs: ["text_input"],
        modelReasoning: graph.reasoningSummary
      }),
      fallback: false,
      modelRepairApplied: repairApplied,
      validationWarnings: warnings.map((item) => item.message)
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
