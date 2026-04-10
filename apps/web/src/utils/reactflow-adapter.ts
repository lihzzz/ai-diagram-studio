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

export function toReactFlowElements(elements: DiagramElement[]): {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
} {
  const nodes: ReactFlowNode[] = [];
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
        type: "labeled",
        data: { label, style }
      });
    } else if (el.type === "group") {
      nodes.push({
        id: el.id,
        type: "group",
        position: { x: el.x ?? 0, y: el.y ?? 0 },
        data: {
          title: el.text ?? "",
          colorKey: (meta?.colorKey as string) ?? el.style ?? "blue"
        },
        style: {
          width: el.width ?? 400,
          height: el.height ?? 300
        },
        parentId: el.parentId
      });
    } else {
      const kind = (meta?.kind as string) ?? el.style ?? "process";
      nodes.push({
        id: el.id,
        type: "step",
        position: { x: el.x ?? 0, y: el.y ?? 0 },
        data: {
          label: el.text ?? "",
          subtitle: el.subtitle,
          kind,
          style: el.style
        },
        style: {
          width: el.width ?? 200,
          height: el.height ?? 80
        },
        parentId: el.parentId
      });
    }
  }

  return { nodes, edges };
}

export function fromReactFlowElements(nodes: ReactFlowNode[], edges: ReactFlowEdge[]): DiagramElement[] {
  const elements: DiagramElement[] = [];

  for (const node of nodes) {
    const { data } = node;
    const type = node.type === "group" ? "group" : "step";
    elements.push({
      id: node.id,
      type,
      x: node.position.x,
      y: node.position.y,
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
        style: edge.data?.style ?? "solid"
      }
    });
  }

  return elements;
}
