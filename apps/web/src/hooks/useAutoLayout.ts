import { useState, useCallback } from "react";
import type { Node, Edge } from "@xyflow/react";
import { layoutWithELK, getDefaultLayoutOptions } from "../utils/elk-layout";

type NodeData = {
  label: string;
  width: number;
  height: number;
  meta: Record<string, unknown>;
};

type EdgeData = Record<string, unknown>;

type DiagramType = "flowchart" | "module_architecture";

/**
 * 自动布局 Hook
 */
export function useAutoLayout() {
  const [layouting, setLayouting] = useState(false);

  const autoLayout = useCallback(
    async (
      nodes: Node<NodeData>[],
      edges: Edge<EdgeData>[],
      diagramType: DiagramType
    ): Promise<{ nodes: Node<NodeData>[]; edges: Edge<EdgeData>[] }> => {
      if (nodes.length === 0) {
        return { nodes, edges };
      }

      setLayouting(true);
      try {
        const options = getDefaultLayoutOptions(diagramType);
        const result = await layoutWithELK(nodes, edges, options);
        return result;
      } finally {
        setLayouting(false);
      }
    },
    []
  );

  return { autoLayout, layouting };
}