import { useEffect, useMemo, useRef, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  type Node,
  type Edge
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { customNodeTypes } from "./CustomNodes";
import { toReactFlowNodes, toReactFlowEdges, fromReactFlowElements } from "../utils/reactflow-adapter";
import { useAutoLayout } from "../hooks/useAutoLayout";
import type { DiagramElement } from "../types";

type NodeData = {
  label: string;
  width: number;
  height: number;
  meta: Record<string, unknown>;
};

type EdgeData = Record<string, unknown>;

type ReactFlowCanvasProps = {
  elements: DiagramElement[];
  selection: string[];
  readOnly?: boolean;
  diagramType?: "flowchart" | "module_architecture";
  onSelect: (ids: string[]) => void;
  onElementsChange?: (elements: DiagramElement[]) => void;
};

export function ReactFlowCanvas({
  elements,
  selection,
  readOnly = false,
  diagramType = "flowchart",
  onSelect,
  onElementsChange
}: ReactFlowCanvasProps) {
  const { autoLayout, layouting } = useAutoLayout();
  const syncingRef = useRef(false);

  // 转换 DiagramElement 到 React Flow 格式
  const initialNodes = useMemo(() => toReactFlowNodes(elements), [elements]);
  const initialEdges = useMemo(() => toReactFlowEdges(elements), [elements]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges as Edge[]);

  // 节点签名，用于判断是否需要同步
  const elementSignature = useMemo(
    () =>
      JSON.stringify(
        elements
          .map((el) => ({ id: el.id, x: Math.round(el.x), y: Math.round(el.y), text: el.text }))
          .sort((a, b) => a.id.localeCompare(b.id))
      ),
    [elements]
  );

  const lastSignatureRef = useRef(elementSignature);

  // 从外部同步到 React Flow
  useEffect(() => {
    if (syncingRef.current) {
      return;
    }
    if (lastSignatureRef.current === elementSignature) {
      return;
    }
    lastSignatureRef.current = elementSignature;
    syncingRef.current = true;

    const newNodes = toReactFlowNodes(elements);
    const newEdges = toReactFlowEdges(elements);
    setNodes(newNodes as Node[]);
    setEdges(newEdges as Edge[]);

    setTimeout(() => {
      syncingRef.current = false;
    }, 0);
  }, [elements, elementSignature, setNodes, setEdges]);

  // 从 React Flow 同步到外部
  const syncToExternal = useCallback(() => {
    if (syncingRef.current || readOnly || !onElementsChange) {
      return;
    }
    const newElements = fromReactFlowElements(nodes, edges);
    const newSignature = JSON.stringify(
      newElements
        .map((el) => ({ id: el.id, x: Math.round(el.x), y: Math.round(el.y), text: el.text }))
        .sort((a, b) => a.id.localeCompare(b.id))
    );
    if (newSignature !== lastSignatureRef.current) {
      lastSignatureRef.current = newSignature;
      onElementsChange(newElements);
    }
  }, [nodes, edges, readOnly, onElementsChange]);

  // 节点变化时同步
  useEffect(() => {
    syncToExternal();
  }, [syncToExternal]);

  // 处理选择变化
  const onSelectionChange = useCallback(
    (params: { nodes: Node[]; edges: Edge[] }) => {
      const selectedIds = params.nodes.map((n) => n.id).sort((a, b) => a.localeCompare(b));
      const prevIds = [...selection].sort((a, b) => a.localeCompare(b));
      if (selectedIds.length !== prevIds.length || !selectedIds.every((id, i) => id === prevIds[i])) {
        onSelect(selectedIds);
      }
    },
    [selection, onSelect]
  );

  // 自动布局
  const handleAutoLayout = async () => {
    if (layouting || readOnly) {
      return;
    }
    syncingRef.current = true;
    const result = await autoLayout(
      nodes as Node<NodeData>[],
      edges as Edge<EdgeData>[],
      diagramType
    );
    setNodes(result.nodes as Node[]);
    setEdges(result.edges as Edge[]);
    setTimeout(() => {
      syncingRef.current = false;
      syncToExternal();
    }, 0);
  };

  return (
    <div className="canvas">
      <div className="canvas-toolbar">
        <span>Canvas (React Flow)</span>
        {!readOnly && (
          <button type="button" onClick={handleAutoLayout} disabled={layouting}>
            {layouting ? "布局中..." : "自动布局"}
          </button>
        )}
      </div>
      <div className="reactflow-host">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={readOnly ? undefined : onNodesChange}
          onEdgesChange={readOnly ? undefined : onEdgesChange}
          onSelectionChange={onSelectionChange}
          nodeTypes={customNodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          panOnScroll
          selectionOnDrag={!readOnly}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable={!readOnly}
          style={{ background: "#f8faf7" }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d7dfd5" />
          <Controls showInteractive={!readOnly} />
          <MiniMap
            nodeColor={(node) => {
              switch (node.type) {
                case "decision":
                  return "#f06f2b";
                case "startEnd":
                  return "#22c55e";
                default:
                  return "#1f6f66";
              }
            }}
            maskColor="rgba(0, 0, 0, 0.1)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}