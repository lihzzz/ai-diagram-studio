import type { Node, Edge } from "@xyflow/react";

import type { DiagramElement } from "../types";

type NodeData = {
  label: string;
  width: number;
  height: number;
  meta: Record<string, unknown>;
};

type EdgeData = Record<string, unknown>;

/**
 * DiagramElement -> React Flow Node 转换
 */
export function toReactFlowNodes(elements: DiagramElement[]): Node<NodeData>[] {
  return elements
    .filter((el) => el.type !== "arrow")
    .map((el) => ({
      id: el.id,
      type: mapNodeType(el.type),
      position: { x: el.x, y: el.y },
      data: {
        label: el.text ?? "",
        width: el.width ?? 220,
        height: el.height ?? 96,
        meta: (el.meta as Record<string, unknown>) ?? {}
      }
    }));
}

/**
 * DiagramElement -> React Flow Edge 转换
 */
export function toReactFlowEdges(elements: DiagramElement[]): Edge<EdgeData>[] {
  const edges: Edge<EdgeData>[] = [];

  for (const el of elements) {
    if (el.type !== "arrow") {
      continue;
    }

    const fromId = typeof el.meta?.fromId === "string" ? el.meta.fromId : null;
    const toId = typeof el.meta?.toId === "string" ? el.meta.toId : null;
    const label = typeof el.meta?.label === "string" ? el.meta.label : null;

    if (!fromId || !toId) {
      continue;
    }

    edges.push({
      id: el.id,
      source: fromId,
      target: toId,
      label: label ?? undefined,
      type: "smoothstep",
      style: { stroke: "#1f6f66", strokeWidth: 2 },
      labelStyle: { fill: "#1a2b2a", fontWeight: 500 },
      labelBgStyle: { fill: "#ffffff", fillOpacity: 0.9 },
      labelBgPadding: [8, 4] as [number, number],
      labelBgBorderRadius: 4
    });
  }

  return edges;
}

/**
 * React Flow Node/Edge -> DiagramElement 转换（反向，用于保存）
 */
export function fromReactFlowElements(nodes: Node[], edges: Edge[]): DiagramElement[] {
  const elements: DiagramElement[] = [];

  // 转换节点
  for (const node of nodes) {
    const nodeType = reverseMapNodeType(node.type ?? "process");
    const data = node.data as NodeData | undefined;

    elements.push({
      id: node.id,
      type: nodeType,
      x: node.position.x,
      y: node.position.y,
      width: data?.width ?? 220,
      height: data?.height ?? 96,
      text: data?.label ?? undefined,
      meta: data?.meta ?? undefined
    });
  }

  // 转换边
  for (const edge of edges) {
    const label = typeof edge.label === "string" ? edge.label : null;

    elements.push({
      id: edge.id,
      type: "arrow",
      x: 0,
      y: 0,
      text: `${edge.source}->${edge.target}${label ? `:${label}` : ""}`,
      meta: {
        fromId: edge.source,
        toId: edge.target,
        label: label ?? null,
        dx: 100,
        dy: 0
      }
    });
  }

  return elements;
}

/**
 * 节点类型映射：DiagramElement type -> React Flow nodeType
 */
const NODE_TYPE_MAP: Record<string, string> = {
  rectangle: "process",
  diamond: "decision",
  ellipse: "startEnd"
};

function mapNodeType(type: string): string {
  return NODE_TYPE_MAP[type] ?? "process";
}

/**
 * 反向映射：React Flow nodeType -> DiagramElement type
 */
const REVERSE_NODE_TYPE_MAP: Record<string, string> = {
  process: "rectangle",
  decision: "diamond",
  startEnd: "ellipse"
};

function reverseMapNodeType(nodeType: string): string {
  return REVERSE_NODE_TYPE_MAP[nodeType] ?? "rectangle";
}