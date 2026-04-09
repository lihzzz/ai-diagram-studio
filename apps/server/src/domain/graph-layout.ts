import * as dagre from "dagre";

import type { DiagramType } from "../types/domain.js";

type GraphNode = {
  id: string;
  title: string;
  kind?: "start_end" | "process" | "decision" | "data";
};

type GraphEdge = {
  from: string;
  to: string;
  label?: string;
};

type GraphPayload = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

interface LayoutOptions {
  diagramType: DiagramType;
}

/**
 * 使用 Dagre 算法计算图的布局
 * 支持层次布局和力导向特性，自动减少边交叉
 */
export function layoutGraphWithDagre(
  graph: GraphPayload,
  options: LayoutOptions
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  void options;

  // 配置布局参数
  g.setGraph({
    rankdir: "TB",
    nodesep: 80,
    ranksep: 120,
    edgesep: 40, // 边之间的间距
    marginx: 80,
    marginy: 80,
    // 对齐方式，让同一层级的节点居中对齐
    align: "UL"
  });

  g.setDefaultEdgeLabel(() => ({}));

  // 添加节点到图中
  for (const node of graph.nodes) {
    const width = node.kind === "decision" ? 260 : 240;
    const height = node.kind === "decision" ? 140 : node.kind === "start_end" ? 92 : 100;
    g.setNode(node.id, { width, height, label: node.title });
  }

  // 添加边到图中
  for (const edge of graph.edges) {
    if (g.hasNode(edge.from) && g.hasNode(edge.to)) {
      g.setEdge(edge.from, edge.to, { label: edge.label });
    }
  }

  // 运行 Dagre 布局算法
  dagre.layout(g);

  // 提取计算后的位置（Dagre 返回的是中心点，需要转换为左上角）
  const positions = new Map<string, { x: number; y: number }>();
  for (const node of graph.nodes) {
    const nodeData = g.node(node.id);
    if (nodeData) {
      positions.set(node.id, {
        x: Math.round(nodeData.x - nodeData.width / 2),
        y: Math.round(nodeData.y - nodeData.height / 2)
      });
    }
  }

  return positions;
}

/**
 * 降级方案：保留原有简单布局算法
 * 当 Dagre 失败或需要简单布局时使用
 */
export function layoutGraphFallback(graph: GraphPayload): Map<string, { x: number; y: number }> {
  const BASE_X = 580;
  const BASE_Y = 120;
  const LEVEL_GAP = 210;
  const LANE_GAP = 340;

  const centeredOffsets = (count: number): number[] => {
    if (count <= 1) {
      return [0];
    }
    if (count === 2) {
      return [-1, 1];
    }
    const mid = (count - 1) / 2;
    return Array.from({ length: count }, (_, index) => index - mid);
  };

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const nodeOrder = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const indegree = new Map<string, number>();
  const outEdges = new Map<string, GraphEdge[]>();
  const level = new Map<string, number>();
  const lane = new Map<string, number>();

  for (const node of graph.nodes) {
    indegree.set(node.id, 0);
    outEdges.set(node.id, []);
  }

  for (const edge of graph.edges) {
    if (!nodesById.has(edge.from) || !nodesById.has(edge.to)) {
      continue;
    }
    outEdges.get(edge.from)?.push(edge);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const roots = graph.nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  if (roots.length === 0 && graph.nodes.length > 0) {
    roots.push(graph.nodes[0].id);
  }

  const queue: string[] = [];
  for (const root of roots) {
    if (!level.has(root)) {
      level.set(root, 0);
      queue.push(root);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const currentLevel = level.get(current) ?? 0;
    const outgoing = Array.from(new Set((outEdges.get(current) ?? []).map((item) => item.to))).sort(
      (a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0)
    );
    for (const next of outgoing) {
      if (!level.has(next)) {
        level.set(next, currentLevel + 1);
        queue.push(next);
      }
    }
  }

  let fallbackLevel = Math.max(0, ...Array.from(level.values()));
  for (const node of graph.nodes) {
    if (!level.has(node.id)) {
      fallbackLevel += 1;
      level.set(node.id, fallbackLevel);
    }
  }

  const rootOffsets = centeredOffsets(roots.length);
  roots.forEach((id, index) => {
    lane.set(id, rootOffsets[index] ?? 0);
  });

  const byLevelAndOrder = [...graph.nodes].sort((a, b) => {
    const levelDelta = (level.get(a.id) ?? 0) - (level.get(b.id) ?? 0);
    if (levelDelta !== 0) {
      return levelDelta;
    }
    return (nodeOrder.get(a.id) ?? 0) - (nodeOrder.get(b.id) ?? 0);
  });

  for (const node of byLevelAndOrder) {
    const nodeLevel = level.get(node.id) ?? 0;
    const nodeLane = lane.get(node.id) ?? 0;
    if (!lane.has(node.id)) {
      lane.set(node.id, nodeLane);
    }

    const forwardEdges = (outEdges.get(node.id) ?? []).filter(
      (edge) => (level.get(edge.to) ?? 0) > nodeLevel
    );
    if (forwardEdges.length === 0) {
      continue;
    }

    const uniqueTargets = Array.from(new Set(forwardEdges.map((edge) => edge.to)));
    const offsets = uniqueTargets.length > 1 ? centeredOffsets(uniqueTargets.length) : [0];
    uniqueTargets.forEach((targetId, index) => {
      if (!lane.has(targetId)) {
        lane.set(targetId, nodeLane + (offsets[index] ?? 0));
      }
    });
  }

  const layers = new Map<number, string[]>();
  for (const node of graph.nodes) {
    const layer = level.get(node.id) ?? 0;
    const current = layers.get(layer) ?? [];
    current.push(node.id);
    layers.set(layer, current);
  }

  for (const ids of layers.values()) {
    const occupied: number[] = [];
    const ordered = [...ids].sort((a, b) => {
      const laneDelta = (lane.get(a) ?? 0) - (lane.get(b) ?? 0);
      if (laneDelta !== 0) {
        return laneDelta;
      }
      return (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0);
    });
    ordered.forEach((id) => {
      let nextLane = lane.get(id) ?? 0;
      while (occupied.some((item) => Math.abs(item - nextLane) < 0.001)) {
        nextLane += 1;
      }
      lane.set(id, nextLane);
      occupied.push(nextLane);
    });
  }

  const laneValues = graph.nodes.map((node) => lane.get(node.id) ?? 0);
  const laneMin = Math.min(...laneValues, 0);
  const laneMax = Math.max(...laneValues, 0);
  const laneCenter = (laneMin + laneMax) / 2;

  const positions = new Map<string, { x: number; y: number }>();
  for (const node of graph.nodes) {
    positions.set(node.id, {
      x: BASE_X + ((lane.get(node.id) ?? 0) - laneCenter) * LANE_GAP,
      y: BASE_Y + (level.get(node.id) ?? 0) * LEVEL_GAP
    });
  }
  return positions;
}
