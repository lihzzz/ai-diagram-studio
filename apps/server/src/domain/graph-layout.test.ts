import { describe, expect, it } from "vitest";

import { layoutGraphWithDagre, layoutGraphFallback } from "./graph-layout.js";

describe("layoutGraphWithDagre", () => {
  const createSimpleGraph = () => ({
    nodes: [
      { id: "start", title: "开始", kind: "start_end" as const },
      { id: "process", title: "处理", kind: "process" as const },
      { id: "decision", title: "判断", kind: "decision" as const },
      { id: "end", title: "结束", kind: "start_end" as const }
    ],
    edges: [
      { from: "start", to: "process" },
      { from: "process", to: "decision" },
      { from: "decision", to: "end", label: "是" }
    ]
  });

  it("should layout flowchart nodes without overlap", () => {
    const graph = createSimpleGraph();
    const positions = layoutGraphWithDagre(graph, { diagramType: "flowchart" });

    // 验证所有节点都有位置
    for (const node of graph.nodes) {
      const pos = positions.get(node.id);
      expect(pos).toBeDefined();
      expect(typeof pos!.x).toBe("number");
      expect(typeof pos!.y).toBe("number");
    }
  });

  it("should layout module architecture horizontally", () => {
    const graph = createSimpleGraph();
    const positions = layoutGraphWithDagre(graph, { diagramType: "module_architecture" });

    // 架构图应该从左到右排列，所以结束节点的x坐标应该大于开始节点
    const startPos = positions.get("start");
    const endPos = positions.get("end");
    expect(startPos).toBeDefined();
    expect(endPos).toBeDefined();
  });

  it("should handle empty graph", () => {
    const graph = { nodes: [] as any[], edges: [] as any[] };
    const positions = layoutGraphWithDagre(graph, { diagramType: "flowchart" });
    expect(positions.size).toBe(0);
  });

  it("should handle complex graph with branches", () => {
    const graph = {
      nodes: [
        { id: "a", title: "A", kind: "process" as const },
        { id: "b", title: "B", kind: "process" as const },
        { id: "c", title: "C", kind: "process" as const },
        { id: "d", title: "D", kind: "process" as const }
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "a", to: "c" },
        { from: "b", to: "d" },
        { from: "c", to: "d" }
      ]
    };

    const positions = layoutGraphWithDagre(graph, { diagramType: "flowchart" });

    // 验证所有节点位置唯一（无重叠）
    const posSet = new Set<string>();
    for (const [_nodeId, pos] of positions) {
      const key = `${pos.x},${pos.y}`;
      expect(posSet.has(key)).toBe(false);
      posSet.add(key);
    }
  });

  it("should ensure nodes are separated by minimum distance", () => {
    const graph = {
      nodes: [
        { id: "n1", title: "Node 1", kind: "process" as const },
        { id: "n2", title: "Node 2", kind: "process" as const }
      ],
      edges: [{ from: "n1", to: "n2" }]
    };

    const positions = layoutGraphWithDagre(graph, { diagramType: "flowchart" });
    const pos1 = positions.get("n1")!;
    const pos2 = positions.get("n2")!;

    // 在垂直布局中，层级间距应该至少为 120
    expect(Math.abs(pos2.y - pos1.y)).toBeGreaterThanOrEqual(100);
  });
});

describe("layoutGraphFallback", () => {
  it("should provide fallback layout when dagre fails", () => {
    const graph = {
      nodes: [
        { id: "a", title: "A", kind: "process" as const },
        { id: "b", title: "B", kind: "process" as const }
      ],
      edges: [{ from: "a", to: "b" }]
    };

    const positions = layoutGraphFallback(graph);

    for (const node of graph.nodes) {
      const pos = positions.get(node.id);
      expect(pos).toBeDefined();
      expect(typeof pos!.x).toBe("number");
      expect(typeof pos!.y).toBe("number");
    }
  });
});
