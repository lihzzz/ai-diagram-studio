import type { Node, Edge } from "@xyflow/react";
import type { DiagramElement } from "../types";

export type ReactFlowNode = Node<{
  label?: string;
  title?: string;
  subtitle?: string;
  kind?: string;
  style?: string;
  colorKey?: string;
}>;

export type ReactFlowEdge = Edge<{
  label?: string;
  style?: "solid" | "dashed";
}>;

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function isLikelyRelative(x: number, y: number, parentWidth: number, parentHeight: number): boolean {
  return x >= -24 && y >= -24 && x <= parentWidth + 24 && y <= parentHeight + 24;
}

export function toReactFlowElements(elements: DiagramElement[]): {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
} {
  const nodeRows: Array<{
    id: string;
    type: "group" | "step";
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    subtitle?: string;
    style?: string;
    parentId?: string;
    meta?: Record<string, unknown>;
  }> = [];
  const edges: ReactFlowEdge[] = [];

  for (const el of elements) {
    const meta = el.meta as Record<string, unknown> | undefined;
    const fromId = meta?.fromId as string | undefined;
    const toId = meta?.toId as string | undefined;

    if (el.type === "arrow" && fromId && toId) {
      const label = (meta?.label as string) ?? el.text?.split(":")[1] ?? undefined;
      const style = (el.style as "solid" | "dashed") ?? (meta?.style as "solid" | "dashed") ?? "solid";
      edges.push({
        id: el.id,
        source: fromId,
        target: toId,
        sourceHandle: typeof meta?.sourceHandle === "string" ? meta.sourceHandle : null,
        targetHandle: typeof meta?.targetHandle === "string" ? meta.targetHandle : null,
        type: "labeled",
        data: { label, style }
      });
    } else if (el.type === "group") {
      nodeRows.push({
        id: el.id,
        type: "group",
        x: el.x ?? 0,
        y: el.y ?? 0,
        width: el.width ?? 400,
        height: el.height ?? 300,
        text: el.text ?? "",
        style: el.style,
        parentId: el.parentId,
        meta
      });
    } else {
      nodeRows.push({
        id: el.id,
        type: "step",
        x: el.x ?? 0,
        y: el.y ?? 0,
        width: el.width ?? 200,
        height: el.height ?? 80,
        text: el.text ?? "",
        subtitle: el.subtitle,
        style: el.style,
        parentId: el.parentId,
        meta
      });
    }
  }

  const rawById = new Map(
    nodeRows.map((row) => [
      row.id,
      {
        x: row.x,
        y: row.y,
        width: row.width,
        height: row.height,
        parentId: row.parentId
      }
    ])
  );

  const absoluteCache = new Map<string, { x: number; y: number }>();
  const resolveAbsolute = (id: string, stack = new Set<string>()): { x: number; y: number } => {
    const cached = absoluteCache.get(id);
    if (cached) return cached;
    const current = rawById.get(id);
    if (!current) return { x: 0, y: 0 };
    if (!current.parentId || !rawById.has(current.parentId) || stack.has(id)) {
      const rootPos = { x: current.x, y: current.y };
      absoluteCache.set(id, rootPos);
      return rootPos;
    }

    stack.add(id);
    const parent = rawById.get(current.parentId)!;
    const parentAbs = resolveAbsolute(current.parentId, stack);
    stack.delete(id);

    const parentWidth = toFiniteNumber(parent.width, 400);
    const parentHeight = toFiniteNumber(parent.height, 280);
    const relative = isLikelyRelative(current.x, current.y, parentWidth, parentHeight);
    const abs = relative
      ? { x: parentAbs.x + current.x, y: parentAbs.y + current.y }
      : { x: current.x, y: current.y };

    absoluteCache.set(id, abs);
    return abs;
  };

  const nodes: ReactFlowNode[] = nodeRows.map((row) => {
    const absolute = resolveAbsolute(row.id);
    const parentId = row.parentId && rawById.has(row.parentId) ? row.parentId : undefined;
    const parentAbs = parentId ? resolveAbsolute(parentId) : null;
    const position = parentAbs
      ? { x: absolute.x - parentAbs.x, y: absolute.y - parentAbs.y }
      : { x: absolute.x, y: absolute.y };

    if (row.type === "group") {
      return {
        id: row.id,
        type: "group",
        position,
        data: {
          title: row.text,
          colorKey: (row.meta?.colorKey as string) ?? row.style ?? "blue"
        },
        style: {
          width: row.width,
          height: row.height
        },
        parentId
      };
    }

    const kind = (row.meta?.kind as string) ?? row.style ?? "process";
    return {
      id: row.id,
      type: "step",
      position,
      data: {
        label: row.text,
        subtitle: row.subtitle,
        kind,
        style: row.style
      },
      style: {
        width: row.width,
        height: row.height
      },
      parentId
    };
  });

  return { nodes, edges };
}

export function fromReactFlowElements(nodes: ReactFlowNode[], edges: ReactFlowEdge[]): DiagramElement[] {
  const elements: DiagramElement[] = [];

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const absoluteCache = new Map<string, { x: number; y: number }>();
  const resolveAbsolute = (id: string, stack = new Set<string>()): { x: number; y: number } => {
    const cached = absoluteCache.get(id);
    if (cached) return cached;
    const node = nodeById.get(id);
    if (!node) return { x: 0, y: 0 };

    const current = {
      x: node.position.x,
      y: node.position.y
    };

    if (!node.parentId || !nodeById.has(node.parentId) || stack.has(id)) {
      absoluteCache.set(id, current);
      return current;
    }

    stack.add(id);
    const parentAbs = resolveAbsolute(node.parentId, stack);
    stack.delete(id);
    const absolute = {
      x: parentAbs.x + current.x,
      y: parentAbs.y + current.y
    };
    absoluteCache.set(id, absolute);
    return absolute;
  };

  for (const node of nodes) {
    const { data } = node;
    const type = node.type === "group" ? "group" : "step";
    const absolute = resolveAbsolute(node.id);
    elements.push({
      id: node.id,
      type,
      x: absolute.x,
      y: absolute.y,
      width: node.style?.width ? Number(node.style.width) : 200,
      height: node.style?.height ? Number(node.style.height) : 80,
      text: data?.title ?? data?.label ?? "",
      subtitle: data?.subtitle,
      style: data?.kind ?? data?.style ?? "process",
      parentId: node.parentId,
      meta: {
        kind: data?.kind ?? "process",
        colorKey: data?.colorKey
      }
    });
  }

  for (const edge of edges) {
    elements.push({
      id: edge.id,
      type: "arrow",
      x: 0,
      y: 0,
      text: edge.data?.label ? `${edge.source}->${edge.target}:${edge.data.label}` : `${edge.source}->${edge.target}`,
      style: edge.data?.style ?? "solid",
      meta: {
        fromId: edge.source,
        toId: edge.target,
        label: edge.data?.label ?? null,
        style: edge.data?.style ?? "solid",
        sourceHandle: edge.sourceHandle ?? null,
        targetHandle: edge.targetHandle ?? null
      }
    });
  }

  return elements;
}
