import { useCallback } from "react";
import { Position } from "@xyflow/react";

import type { ReactFlowEdge, ReactFlowNode } from "../utils/reactflow-adapter";

type LayoutDirection = "RIGHT" | "DOWN";

type AutoLayoutOptions = {
  direction?: LayoutDirection;
  nodeSpacing?: number;
  layerSpacing?: number;
};

type ElkNode = {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: ElkNode[];
  layoutOptions?: Record<string, string>;
};

type ElkEdge = {
  id: string;
  sources: string[];
  targets: string[];
};

type ElkGraph = ElkNode & {
  edges?: ElkEdge[];
  layoutOptions?: Record<string, string>;
};

type ElkLayoutEngine = {
  layout: (graph: ElkGraph) => Promise<ElkNode>;
};

type ElkConstructor = new () => ElkLayoutEngine;

type LayoutPosition = {
  x: number;
  y: number;
  width?: number;
  height?: number;
  parentId?: string;
};

type AbsPoint = { x: number; y: number };

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 96;
const DEFAULT_GROUP_WIDTH = 420;
const DEFAULT_GROUP_HEIGHT = 280;

function toSize(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return fallback;
}

function nodeSize(node: ReactFlowNode): { width: number; height: number } {
  const fallbackWidth = node.type === "group" ? DEFAULT_GROUP_WIDTH : DEFAULT_NODE_WIDTH;
  const fallbackHeight = node.type === "group" ? DEFAULT_GROUP_HEIGHT : DEFAULT_NODE_HEIGHT;
  return {
    width: toSize(node.style?.width, fallbackWidth),
    height: toSize(node.style?.height, fallbackHeight)
  };
}

function roundPosition(value: number): number {
  return Math.round(value);
}

async function loadElk(): Promise<ElkLayoutEngine> {
  const mod = await import("elkjs/lib/elk.bundled.js");
  const ElkClass = mod.default as ElkConstructor;
  return new ElkClass();
}

function applyCollisionPass(nodes: ReactFlowNode[], gap = 28): ReactFlowNode[] {
  if (nodes.length <= 1) return nodes;

  const byParent = new Map<string, ReactFlowNode[]>();
  for (const node of nodes) {
    const key = node.parentId ?? "__root__";
    const list = byParent.get(key) ?? [];
    list.push(node);
    byParent.set(key, list);
  }

  const shifts = new Map<string, { dx: number; dy: number }>();
  for (const siblings of byParent.values()) {
    const sorted = [...siblings].sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x));
    let moved = true;
    let round = 0;
    while (moved && round < 8) {
      moved = false;
      round += 1;
      for (let i = 0; i < sorted.length; i += 1) {
        for (let j = i + 1; j < sorted.length; j += 1) {
          const a = sorted[i];
          const b = sorted[j];
          const sa = shifts.get(a.id) ?? { dx: 0, dy: 0 };
          const sb = shifts.get(b.id) ?? { dx: 0, dy: 0 };

          const ax = a.position.x + sa.dx;
          const ay = a.position.y + sa.dy;
          const aw = toSize(a.style?.width, a.type === "group" ? DEFAULT_GROUP_WIDTH : DEFAULT_NODE_WIDTH);
          const ah = toSize(a.style?.height, a.type === "group" ? DEFAULT_GROUP_HEIGHT : DEFAULT_NODE_HEIGHT);
          const bx = b.position.x + sb.dx;
          const by = b.position.y + sb.dy;
          const bw = toSize(b.style?.width, b.type === "group" ? DEFAULT_GROUP_WIDTH : DEFAULT_NODE_WIDTH);
          const bh = toSize(b.style?.height, b.type === "group" ? DEFAULT_GROUP_HEIGHT : DEFAULT_NODE_HEIGHT);

          const overlapX = Math.min(ax + aw + gap, bx + bw + gap) - Math.max(ax, bx);
          const overlapY = Math.min(ay + ah + gap, by + bh + gap) - Math.max(ay, by);
          if (overlapX <= 0 || overlapY <= 0) continue;

          const pushX = overlapX / 2;
          const pushY = overlapY / 2;
          if (overlapX < overlapY) {
            const dir = ax <= bx ? 1 : -1;
            shifts.set(a.id, { dx: sa.dx - dir * pushX, dy: sa.dy });
            shifts.set(b.id, { dx: sb.dx + dir * pushX, dy: sb.dy });
          } else {
            const dir = ay <= by ? 1 : -1;
            shifts.set(a.id, { dx: sa.dx, dy: sa.dy - dir * pushY });
            shifts.set(b.id, { dx: sb.dx, dy: sb.dy + dir * pushY });
          }
          moved = true;
        }
      }
    }
  }

  return nodes.map((node) => {
    const shift = shifts.get(node.id);
    if (!shift) return node;
    return {
      ...node,
      position: {
        x: roundPosition(node.position.x + shift.dx),
        y: roundPosition(node.position.y + shift.dy)
      }
    };
  });
}

function buildAbsolutePositionMap(nodes: ReactFlowNode[]): Map<string, AbsPoint> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const cache = new Map<string, AbsPoint>();

  const resolve = (id: string, stack = new Set<string>()): AbsPoint => {
    const cached = cache.get(id);
    if (cached) return cached;
    const node = nodeById.get(id);
    if (!node) return { x: 0, y: 0 };
    if (!node.parentId || !nodeById.has(node.parentId) || stack.has(id)) {
      const root = { x: node.position.x, y: node.position.y };
      cache.set(id, root);
      return root;
    }

    stack.add(id);
    const parentAbs = resolve(node.parentId, stack);
    stack.delete(id);
    const abs = {
      x: parentAbs.x + node.position.x,
      y: parentAbs.y + node.position.y
    };
    cache.set(id, abs);
    return abs;
  };

  for (const node of nodes) {
    resolve(node.id);
  }

  return cache;
}

function decideHandles(source: AbsPoint, target: AbsPoint): { sourceHandle: string; targetHandle: string } {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: "right", targetHandle: "left" }
      : { sourceHandle: "left", targetHandle: "right" };
  }
  return dy >= 0
    ? { sourceHandle: "bottom", targetHandle: "top" }
    : { sourceHandle: "top", targetHandle: "bottom" };
}

function applyEdgeHandles(nodes: ReactFlowNode[], edges: ReactFlowEdge[]): ReactFlowEdge[] {
  const absMap = buildAbsolutePositionMap(nodes);
  return edges.map((edge) => {
    const source = absMap.get(edge.source);
    const target = absMap.get(edge.target);
    if (!source || !target) return edge;
    const handle = decideHandles(source, target);
    return {
      ...edge,
      sourceHandle: handle.sourceHandle,
      targetHandle: handle.targetHandle
    };
  });
}

export function useAutoLayout() {
  const autoLayout = useCallback(
    async (nodes: ReactFlowNode[], edges: ReactFlowEdge[], options?: AutoLayoutOptions): Promise<{ nodes: ReactFlowNode[]; edges: ReactFlowEdge[] } | null> => {
      if (nodes.length === 0) {
        return { nodes, edges };
      }

      const direction = options?.direction ?? "RIGHT";
      const nodeSpacing = options?.nodeSpacing ?? 88;
      const layerSpacing = options?.layerSpacing ?? 132;

      const nodeById = new Map(nodes.map((node) => [node.id, node]));
      const childrenByParent = new Map<string, string[]>();
      const rootIds: string[] = [];

      for (const node of nodes) {
        const parentId = node.parentId;
        if (parentId && nodeById.has(parentId)) {
          const list = childrenByParent.get(parentId) ?? [];
          list.push(node.id);
          childrenByParent.set(parentId, list);
        } else {
          rootIds.push(node.id);
        }
      }

      const seen = new Set<string>();
      const buildElkNode = (nodeId: string): ElkNode | null => {
        if (seen.has(nodeId)) return null;
        const node = nodeById.get(nodeId);
        if (!node) return null;
        seen.add(nodeId);

        const childIds = childrenByParent.get(nodeId) ?? [];
        const hasChildren = childIds.length > 0;
        const size = nodeSize(node);

        const elkNode: ElkNode = {
          id: node.id
        };

        if (!hasChildren) {
          elkNode.width = size.width;
          elkNode.height = size.height;
        } else {
          elkNode.layoutOptions = {
            "elk.algorithm": "layered",
            "elk.direction": direction,
            "elk.edgeRouting": "ORTHOGONAL",
            "elk.padding": "[top=42,left=26,bottom=26,right=26]",
            "elk.spacing.nodeNode": String(Math.max(64, nodeSpacing - 8)),
            "elk.layered.spacing.nodeNodeBetweenLayers": String(Math.max(98, layerSpacing - 16)),
            "elk.spacing.edgeNode": "24",
            "elk.spacing.edgeEdge": "16"
          };
          elkNode.children = childIds.map((childId) => buildElkNode(childId)).filter(Boolean) as ElkNode[];
        }

        return elkNode;
      };

      const rootChildren = rootIds.map((nodeId) => buildElkNode(nodeId)).filter(Boolean) as ElkNode[];
      const elkEdges: ElkEdge[] = edges
        .filter((edge) => edge.source !== edge.target && nodeById.has(edge.source) && nodeById.has(edge.target))
        .map((edge) => ({
          id: edge.id,
          sources: [edge.source],
          targets: [edge.target]
        }));

      try {
        const elk = await loadElk();
        const layout = await elk.layout({
          id: "root",
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": direction,
            "elk.edgeRouting": "ORTHOGONAL",
            "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
            "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
            "elk.layered.spacing.nodeNodeBetweenLayers": String(layerSpacing),
            "elk.spacing.nodeNode": String(nodeSpacing),
            "elk.spacing.edgeNode": "28",
            "elk.spacing.edgeEdge": "20",
            "elk.layered.spacing.edgeNodeBetweenLayers": "40",
            "elk.padding": "[top=52,left=52,bottom=52,right=52]"
          },
          children: rootChildren,
          edges: elkEdges
        });

        const containerIds = new Set<string>();
        for (const [parentId, childIds] of childrenByParent.entries()) {
          if (childIds.length > 0) {
            containerIds.add(parentId);
          }
        }

        const positions = new Map<string, LayoutPosition>();
        const walk = (node: ElkNode, parentX: number, parentY: number, parentId?: string): void => {
          const absX = parentX + (node.x ?? 0);
          const absY = parentY + (node.y ?? 0);

          if (node.id !== "root") {
            positions.set(node.id, {
              x: absX,
              y: absY,
              width: node.width,
              height: node.height,
              parentId
            });
          }

          const nextParent = node.id !== "root" && containerIds.has(node.id) ? node.id : parentId;
          for (const child of node.children ?? []) {
            walk(child, absX, absY, nextParent);
          }
        };

        walk(layout, 0, 0, undefined);

        const nextNodes = nodes.map((node) => {
          const pos = positions.get(node.id);
          if (!pos) return node;

          const parentPos = pos.parentId ? positions.get(pos.parentId) : undefined;
          const nextX = parentPos ? pos.x - parentPos.x : pos.x;
          const nextY = parentPos ? pos.y - parentPos.y : pos.y;
          const width = toSize(pos.width, toSize(node.style?.width, node.type === "group" ? DEFAULT_GROUP_WIDTH : DEFAULT_NODE_WIDTH));
          const height = toSize(pos.height, toSize(node.style?.height, node.type === "group" ? DEFAULT_GROUP_HEIGHT : DEFAULT_NODE_HEIGHT));
          const isGroup = node.type === "group";

          return {
            ...node,
            position: { x: roundPosition(nextX), y: roundPosition(nextY) },
            parentId: pos.parentId ?? node.parentId,
            sourcePosition: isGroup ? node.sourcePosition : direction === "RIGHT" ? Position.Right : Position.Bottom,
            targetPosition: isGroup ? node.targetPosition : direction === "RIGHT" ? Position.Left : Position.Top,
            style: {
              ...(node.style ?? {}),
              width: roundPosition(width),
              height: roundPosition(height)
            }
          };
        });

        const collisionSafeNodes = applyCollisionPass(nextNodes);
        const routedEdges = applyEdgeHandles(collisionSafeNodes, edges);
        return { nodes: collisionSafeNodes, edges: routedEdges };
      } catch {
        return null;
      }
    },
    []
  );

  return { autoLayout };
}
