import ELK from "elkjs/lib/elk.bundled.js";
import type { Node, Edge } from "@xyflow/react";

const elk = new ELK();

type ElkLayoutOptions = {
  direction: "DOWN" | "RIGHT" | "LEFT" | "UP";
  nodeSpacing: number;
  layerSpacing: number;
};

type ElkNode = {
  id: string;
  width: number;
  height: number;
  labels?: Array<{ text: string }>;
};

type ElkEdge = {
  id: string;
  sources: string[];
  targets: string[];
  labels?: Array<{ text: string }>;
};

type ElkGraph = {
  id: string;
  layoutOptions: Record<string, string>;
  children: ElkNode[];
  edges: ElkEdge[];
};

type NodeData = {
  label: string;
  width: number;
  height: number;
  meta: Record<string, unknown>;
};

type EdgeData = Record<string, unknown>;

/**
 * 使用 ELK.js 执行自动布局
 */
export async function layoutWithELK(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  options: ElkLayoutOptions
): Promise<{ nodes: Node<NodeData>[]; edges: Edge<EdgeData>[] }> {
  // 构建 ELK graph
  const elkGraph: ElkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": options.direction,
      "elk.spacing.nodeNode": String(options.nodeSpacing),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(options.layerSpacing),
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.edgeRouting.style": "ORTHOGONAL",
      "elk.hierarchyHandling": "SEPARATE_CHILDREN"
    },
    children: nodes.map((n) => {
      return {
        id: n.id,
        width: n.data.width,
        height: n.data.height,
        labels: [{ text: n.data.label }]
      };
    }),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
      labels: e.label ? [{ text: String(e.label) }] : undefined
    }))
  };

  // 执行布局
  const result = await elk.layout(elkGraph);

  // 应用布局结果到节点
  const layoutedNodes = nodes.map((node) => {
    const elkNode = result.children?.find((c) => c.id === node.id);
    if (!elkNode || elkNode.x === undefined || elkNode.y === undefined) {
      return node;
    }
    // ELK 返回的是左上角坐标，直接使用
    return {
      ...node,
      position: {
        x: Math.round(elkNode.x),
        y: Math.round(elkNode.y)
      }
    };
  });

  return { nodes: layoutedNodes, edges };
}

/**
 * 根据图表类型获取默认布局配置
 */
export function getDefaultLayoutOptions(diagramType: "flowchart" | "module_architecture"): ElkLayoutOptions {
  return {
    direction: diagramType === "module_architecture" ? "RIGHT" : "DOWN",
    nodeSpacing: 80,
    layerSpacing: 120
  };
}