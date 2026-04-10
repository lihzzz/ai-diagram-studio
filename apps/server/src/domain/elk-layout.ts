import ELK from "elkjs";

const elk = new (ELK as any)();

export type GraphNodeKind = "start_end" | "process" | "decision" | "data";

export type GraphNode = {
  id: string;
  title: string;
  subtitle?: string;
  style?: string;
  kind?: GraphNodeKind;
};

export type GraphGroup = {
  id: string;
  title: string;
  color?: string;
  nodes: GraphNode[];
  children?: GraphGroup[];
};

export type GraphEdge = {
  from: string;
  to: string;
  label?: string;
  style?: string;
};

export type GraphPayload = {
  groups: GraphGroup[];
  freeNodes: GraphNode[];
  edges: GraphEdge[];
  reasoningSummary?: Record<string, unknown>;
};

export type LayoutItem = {
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
};

export type LayoutResult = {
  nodes: Map<string, LayoutItem>;
  groups: Map<string, LayoutItem>;
};

type ElkNode = {
  id: string;
  width?: number;
  height?: number;
  labels?: Array<{ text: string }>;
  children?: ElkNode[];
};

type ElkEdge = {
  id: string;
  sources: string[];
  targets: string[];
  labels?: Array<{ text: string }>;
};

function nodeSize(kind: GraphNodeKind | undefined): { width: number; height: number } {
  if (kind === "decision") {
    return { width: 240, height: 140 };
  }
  if (kind === "start_end") {
    return { width: 220, height: 92 };
  }
  return { width: 240, height: 100 };
}

function collectGroupIds(groups: GraphGroup[], target: Set<string>): void {
  for (const group of groups) {
    target.add(group.id);
    collectGroupIds(group.children ?? [], target);
  }
}

function collectNodeIds(groups: GraphGroup[], freeNodes: GraphNode[], target: Set<string>): void {
  for (const node of freeNodes) {
    target.add(node.id);
  }
  for (const group of groups) {
    for (const node of group.nodes) {
      target.add(node.id);
    }
    collectNodeIds(group.children ?? [], [], target);
  }
}

function toElkGroup(group: GraphGroup): ElkNode {
  const nodeChildren: ElkNode[] = group.nodes.map((node) => {
    const size = nodeSize(node.kind);
    return {
      id: node.id,
      width: size.width,
      height: size.height,
      labels: [{ text: node.title }]
    };
  });

  const nestedChildren = (group.children ?? []).map((child) => toElkGroup(child));

  return {
    id: group.id,
    labels: [{ text: group.title }],
    children: [...nestedChildren, ...nodeChildren]
  };
}

function walkLayout(
  node: {
    id: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    children?: Array<{
      id: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      children?: unknown[];
    }>;
  },
  parentX: number,
  parentY: number,
  parentId: string | undefined,
  groupIdSet: Set<string>,
  nodeIdSet: Set<string>,
  result: LayoutResult
): void {
  const absX = parentX + (node.x ?? 0);
  const absY = parentY + (node.y ?? 0);

  if (groupIdSet.has(node.id)) {
    result.groups.set(node.id, {
      x: absX,
      y: absY,
      width: node.width ?? 260,
      height: node.height ?? 220,
      parentId
    });
  }

  if (nodeIdSet.has(node.id)) {
    result.nodes.set(node.id, {
      x: absX,
      y: absY,
      width: node.width ?? 220,
      height: node.height ?? 100,
      parentId
    });
  }

  for (const child of node.children ?? []) {
    const nextParent = groupIdSet.has(node.id) ? node.id : parentId;
    walkLayout(child as Parameters<typeof walkLayout>[0], absX, absY, nextParent, groupIdSet, nodeIdSet, result);
  }
}

export async function layoutGraphWithELK(graph: GraphPayload): Promise<LayoutResult> {
  const groupIdSet = new Set<string>();
  const nodeIdSet = new Set<string>();
  collectGroupIds(graph.groups, groupIdSet);
  collectNodeIds(graph.groups, graph.freeNodes, nodeIdSet);

  const rootChildren: ElkNode[] = [
    ...graph.groups.map((group) => toElkGroup(group)),
    ...graph.freeNodes.map((node) => {
      const size = nodeSize(node.kind);
      return {
        id: node.id,
        width: size.width,
        height: size.height,
        labels: [{ text: node.title }]
      };
    })
  ];

  const edges: ElkEdge[] = graph.edges.map((edge, index) => ({
    id: `e_${index + 1}`,
    sources: [edge.from],
    targets: [edge.to],
    labels: edge.label ? [{ text: edge.label }] : undefined
  }));

  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "120",
      "elk.spacing.nodeNode": "80",
      "elk.padding": "[top=48,left=48,bottom=48,right=48]"
    },
    children: rootChildren,
    edges
  };

  const layout = await elk.layout(elkGraph as never);
  const result: LayoutResult = {
    nodes: new Map<string, LayoutItem>(),
    groups: new Map<string, LayoutItem>()
  };

  walkLayout(layout as never, 0, 0, undefined, groupIdSet, nodeIdSet, result);
  return result;
}

export function layoutGraphFallback(graph: GraphPayload): LayoutResult {
  const result: LayoutResult = {
    nodes: new Map<string, LayoutItem>(),
    groups: new Map<string, LayoutItem>()
  };

  function walkGroups(groups: GraphGroup[], depth: number, offsetX: number, offsetY: number): void {
    let localY = offsetY;
    for (const group of groups) {
      result.groups.set(group.id, {
        x: offsetX,
        y: localY,
        width: 420,
        height: Math.max(220, (group.nodes.length + (group.children?.length ?? 0)) * 130),
        parentId: undefined
      });

      group.nodes.forEach((node, index) => {
        result.nodes.set(node.id, {
          x: offsetX + 30 + index * 250,
          y: localY + 60,
          width: 220,
          height: 100,
          parentId: group.id
        });
      });

      if (group.children?.length) {
        walkGroups(group.children, depth + 1, offsetX + 30, localY + 150);
      }

      localY += 320 + depth * 30;
    }
  }

  walkGroups(graph.groups, 0, 80, 80);

  graph.freeNodes.forEach((node, index) => {
    result.nodes.set(node.id, {
      x: 120 + (index % 4) * 280,
      y: 120 + Math.floor(index / 4) * 200,
      width: 220,
      height: 100,
      parentId: undefined
    });
  });

  return result;
}
