import { convertToExcalidrawElements } from "@excalidraw/excalidraw";

import type { DiagramElement } from "../types";

type ExcalidrawSkeleton = NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>[number];
type ExcalidrawSceneElement = ReturnType<typeof convertToExcalidrawElements>[number];

type ExcalidrawLikeElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  isDeleted?: boolean;
  points?: Array<[number, number]>;
  text?: string;
  containerId?: string | null;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  meta?: Record<string, unknown>;
};

const DEFAULT_WIDTH = 220;
const DEFAULT_HEIGHT = 96;
const FLOW_SHAPES = new Set(["rectangle", "diamond", "ellipse"]);

function normalizeShape(type: string): "rectangle" | "diamond" | "ellipse" {
  if (FLOW_SHAPES.has(type)) {
    return type as "rectangle" | "diamond" | "ellipse";
  }
  return "rectangle";
}

function edgeMetaFromElement(edge: DiagramElement): { fromId: string | null; toId: string | null } {
  const fromId = typeof edge.meta?.fromId === "string" ? edge.meta.fromId : null;
  const toId = typeof edge.meta?.toId === "string" ? edge.meta.toId : null;
  if (fromId && toId) {
    return { fromId, toId };
  }

  const parsed = (edge.text ?? "").match(/^([^:]+?)->([^:]+?)(?::.*)?$/);
  if (!parsed) {
    return { fromId: null, toId: null };
  }
  return {
    fromId: parsed[1].trim(),
    toId: parsed[2].trim()
  };
}

function edgeLabelFromElement(edge: DiagramElement): string | undefined {
  if (typeof edge.meta?.label === "string" && edge.meta.label.trim()) {
    return edge.meta.label.trim();
  }
  const parsed = (edge.text ?? "").match(/^([^:]+?)->([^:]+?)(?::(.*))?$/);
  const raw = parsed?.[3]?.trim();
  return raw ? raw : undefined;
}

export function toExcalidrawElements(elements: DiagramElement[]): ExcalidrawSceneElement[] {
  const nodes = elements.filter((item) => item.type !== "arrow");
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  const skeletons: ExcalidrawSkeleton[] = [];

  for (const node of nodes) {
    const width = node.width ?? DEFAULT_WIDTH;
    const height = node.height ?? DEFAULT_HEIGHT;
    skeletons.push({
      id: node.id,
      type: normalizeShape(node.type),
      x: node.x,
      y: node.y,
      width,
      height,
      strokeColor: "#1f6f66",
      backgroundColor: "#ffffff",
      roughness: 1,
      strokeWidth: 2,
      label: node.text?.trim()
        ? {
            text: node.text,
            textAlign: "center",
            verticalAlign: "middle"
          }
        : undefined
    });
  }

  for (const edge of elements.filter((item) => item.type === "arrow")) {
    const { fromId, toId } = edgeMetaFromElement(edge);
    const from = fromId ? nodeMap.get(fromId) : null;
    const to = toId ? nodeMap.get(toId) : null;
    if (!from || !to) {
      continue;
    }

    const fromWidth = from.width ?? DEFAULT_WIDTH;
    const fromHeight = from.height ?? DEFAULT_HEIGHT;
    const toWidth = to.width ?? DEFAULT_WIDTH;
    const toHeight = to.height ?? DEFAULT_HEIGHT;

    // 计算从 from 中心到 to 中心的方向
    const fromCenterX = from.x + fromWidth / 2;
    const fromCenterY = from.y + fromHeight / 2;
    const toCenterX = to.x + toWidth / 2;
    const toCenterY = to.y + toHeight / 2;
    const dx = toCenterX - fromCenterX;
    const dy = toCenterY - fromCenterY;

    // 根据方向计算边界点（左出右进，或上下连接）
    let x1: number, y1: number, x2: number, y2: number;
    if (Math.abs(dx) > Math.abs(dy)) {
      // 水平方向为主：从右边界出，左边界进
      x1 = dx > 0 ? from.x + fromWidth : from.x;
      y1 = fromCenterY;
      x2 = dx > 0 ? to.x : to.x + toWidth;
      y2 = toCenterY;
    } else {
      // 垂直方向为主：从下边界出，上边界进
      x1 = fromCenterX;
      y1 = dy > 0 ? from.y + fromHeight : from.y;
      x2 = toCenterX;
      y2 = dy > 0 ? to.y : to.y + toHeight;
    }

    const label = edgeLabelFromElement(edge);
    skeletons.push({
      id: edge.id,
      type: "arrow",
      x: x1,
      y: y1,
      start: { id: from.id },
      end: { id: to.id },
      points: [
        [0, 0],
        [x2 - x1, y2 - y1]
      ],
      label: label ? { text: label } : undefined,
      strokeColor: "#1f6f66",
      roundness: null,
      endArrowhead: "arrow"
    });
  }

  return convertToExcalidrawElements(skeletons, { regenerateIds: false });
}

export function fromExcalidrawElements(rawElements: readonly unknown[]): DiagramElement[] {
  const elements = (rawElements as ExcalidrawLikeElement[]).filter((item) => !item.isDeleted);
  const textByContainerId = new Map<string, string>();

  for (const item of elements) {
    if (item.type !== "text") {
      continue;
    }
    if (!item.containerId) {
      continue;
    }
    textByContainerId.set(item.containerId, item.text ?? "");
  }

  const nodes: DiagramElement[] = [];
  for (const item of elements) {
    if (item.type === "arrow" || item.type === "text") {
      continue;
    }
    nodes.push({
      id: item.id,
      type: normalizeShape(item.type),
      x: item.x,
      y: item.y,
      width: item.width ?? DEFAULT_WIDTH,
      height: item.height ?? DEFAULT_HEIGHT,
      text: textByContainerId.get(item.id) ?? undefined
    });
  }

  const edges: DiagramElement[] = [];
  for (const item of elements) {
    if (item.type !== "arrow") {
      continue;
    }
    const points = item.points ?? [];
    const last = points[points.length - 1] ?? [80, 0];
    const fromId = item.startBinding?.elementId ?? "";
    const toId = item.endBinding?.elementId ?? "";
    const label = textByContainerId.get(item.id);
    edges.push({
      id: item.id,
      type: "arrow",
      x: item.x,
      y: item.y,
      text: fromId && toId ? `${fromId}->${toId}${label ? `:${label}` : ""}` : item.text ?? `${item.id}->${item.id}`,
      meta: {
        fromId: fromId || null,
        toId: toId || null,
        label: label ?? null,
        dx: last[0],
        dy: last[1]
      }
    });
  }

  return [...nodes, ...edges];
}
