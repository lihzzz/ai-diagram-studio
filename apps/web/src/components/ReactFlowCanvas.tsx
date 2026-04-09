import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ELK from "elkjs/lib/elk.bundled.js";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MarkerType,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  MiniMap,
  Position,
  ReactFlow
} from "@xyflow/react";

import type { DiagramElement } from "../types";

type ReactFlowCanvasProps = {
  elements: DiagramElement[];
  selection: string[];
  readOnly?: boolean;
  onSelect: (ids: string[]) => void;
  onElementsChange?: (elements: DiagramElement[]) => void;
};

type ShapeType = "rectangle" | "diamond" | "ellipse";
type ShapeNodeData = {
  label: string;
  shape: ShapeType;
  width: number;
  height: number;
};
type ShapeNode = Node<ShapeNodeData>;

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 96;
const EDGE_FALLBACK_LENGTH = 160;
const elk = new ELK();

function normalizeShape(type: string): ShapeType {
  if (type === "diamond" || type === "ellipse") {
    return type;
  }
  return "rectangle";
}

function readNumber(input: unknown, fallback: number): number {
  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }
  if (typeof input === "string") {
    const parsed = Number(input);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function edgeMetaFromElement(edge: DiagramElement): { fromId: string | null; toId: string | null; label?: string } {
  const fromId = typeof edge.meta?.fromId === "string" ? edge.meta.fromId : null;
  const toId = typeof edge.meta?.toId === "string" ? edge.meta.toId : null;
  const labelFromMeta = typeof edge.meta?.label === "string" ? edge.meta.label.trim() : "";
  if (fromId && toId) {
    return {
      fromId,
      toId,
      label: labelFromMeta || undefined
    };
  }
  const parsed = (edge.text ?? "").match(/^([^:]+?)->([^:]+?)(?::(.*))?$/);
  if (!parsed) {
    return { fromId: null, toId: null };
  }
  const label = parsed[3]?.trim();
  return {
    fromId: parsed[1].trim(),
    toId: parsed[2].trim(),
    label: label || undefined
  };
}

function elementSignature(elements: DiagramElement[]): string {
  const normalized = [...elements]
    .map((item) => ({
      id: item.id,
      type: item.type,
      x: Math.round(item.x),
      y: Math.round(item.y),
      width: item.width ?? null,
      height: item.height ?? null,
      text: item.text ?? null,
      groupId: item.groupId ?? null
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(normalized);
}

function toFlowState(elements: DiagramElement[]): { nodes: ShapeNode[]; edges: Edge[] } {
  const nodes = elements
    .filter((item) => item.type !== "arrow")
    .map<ShapeNode>((item) => {
      const shape = normalizeShape(item.type);
      const width = item.width ?? DEFAULT_NODE_WIDTH;
      const height = item.height ?? DEFAULT_NODE_HEIGHT;
      return {
        id: item.id,
        type: "shapeNode",
        position: { x: item.x, y: item.y },
        data: {
          label: item.text ?? item.id,
          shape,
          width,
          height
        },
        style: {
          width,
          height
        }
      };
    });
  const nodeIdSet = new Set(nodes.map((item) => item.id));
  const edges = elements
    .filter((item) => item.type === "arrow")
    .map<Edge | null>((item) => {
      const meta = edgeMetaFromElement(item);
      if (!meta.fromId || !meta.toId) {
        return null;
      }
      if (!nodeIdSet.has(meta.fromId) || !nodeIdSet.has(meta.toId)) {
        return null;
      }
      return {
        id: item.id,
        source: meta.fromId,
        target: meta.toId,
        label: meta.label,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 2, stroke: "#1f6f66" },
        labelStyle: { fill: "#1a2b2a", fontSize: 12 }
      };
    })
    .filter((item): item is Edge => item !== null);

  return { nodes, edges };
}

function fromFlowState(nodes: ShapeNode[], edges: Edge[]): DiagramElement[] {
  const nodeElements: DiagramElement[] = nodes.map((item) => {
    const width = readNumber(item.width ?? item.measured?.width ?? item.style?.width, item.data.width ?? DEFAULT_NODE_WIDTH);
    const height = readNumber(
      item.height ?? item.measured?.height ?? item.style?.height,
      item.data.height ?? DEFAULT_NODE_HEIGHT
    );
    return {
      id: item.id,
      type: normalizeShape(item.data.shape),
      x: Math.round(item.position.x),
      y: Math.round(item.position.y),
      width,
      height,
      text: item.data.label
    };
  });

  const edgeElements: DiagramElement[] = edges.map((item) => {
    const label = typeof item.label === "string" ? item.label.trim() : "";
    return {
      id: item.id,
      type: "arrow",
      x: 0,
      y: 0,
      text: `${item.source}->${item.target}${label ? `:${label}` : ""}`,
      meta: {
        fromId: item.source,
        toId: item.target,
        label: label || null,
        dx: EDGE_FALLBACK_LENGTH,
        dy: 0
      }
    };
  });

  return [...nodeElements, ...edgeElements];
}

function ShapeNode({ data, selected }: NodeProps<Node<ShapeNodeData>>) {
  const baseStyle = {
    width: data.width,
    height: data.height
  };
  const shapeStyle =
    data.shape === "ellipse"
      ? { borderRadius: 999, clipPath: "none" }
      : data.shape === "diamond"
        ? { borderRadius: 0, clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }
        : { borderRadius: 14, clipPath: "none" };
  return (
    <div
      className={`rf-shape-node ${data.shape} ${selected ? "selected" : ""}`}
      style={{ ...baseStyle, ...shapeStyle }}
    >
      <Handle type="target" position={Position.Top} className="rf-shape-handle" />
      <Handle type="source" position={Position.Bottom} className="rf-shape-handle" />
      <Handle type="target" position={Position.Left} className="rf-shape-handle" />
      <Handle type="source" position={Position.Right} className="rf-shape-handle" />
      <div className={`rf-shape-label ${data.shape === "diamond" ? "diamond-label" : ""}`}>{data.label}</div>
    </div>
  );
}

const nodeTypes = { shapeNode: ShapeNode };

export function ReactFlowCanvas({
  elements,
  selection,
  readOnly = false,
  onSelect,
  onElementsChange
}: ReactFlowCanvasProps) {
  const [nodes, setNodes] = useState<ShapeNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [layingOut, setLayingOut] = useState(false);
  const incomingSignature = useMemo(() => elementSignature(elements), [elements]);
  const incomingSignatureRef = useRef(incomingSignature);
  const syncingFromPropsRef = useRef(false);

  useEffect(() => {
    incomingSignatureRef.current = incomingSignature;
    syncingFromPropsRef.current = true;
    const flowState = toFlowState(elements);
    setNodes(flowState.nodes);
    setEdges(flowState.edges);
    const timer = window.setTimeout(() => {
      syncingFromPropsRef.current = false;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [elements, incomingSignature]);

  useEffect(() => {
    if (readOnly || !onElementsChange || syncingFromPropsRef.current) {
      return;
    }
    const nextElements = fromFlowState(nodes, edges);
    const nextSignature = elementSignature(nextElements);
    if (nextSignature === incomingSignatureRef.current) {
      return;
    }
    onElementsChange(nextElements);
  }, [nodes, edges, onElementsChange, readOnly]);

  useEffect(() => {
    const selectedSet = new Set(selection);
    setNodes((current) =>
      current.map((item) => ({
        ...item,
        selected: selectedSet.has(item.id)
      }))
    );
    setEdges((current) =>
      current.map((item) => ({
        ...item,
        selected: selectedSet.has(item.id)
      }))
    );
  }, [selection]);

  const onNodesChange = useCallback((changes: NodeChange<ShapeNode>[]) => {
    setNodes((current) => applyNodeChanges<ShapeNode>(changes, current));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (readOnly) {
        return;
      }
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { strokeWidth: 2, stroke: "#1f6f66" }
          },
          current
        )
      );
    },
    [readOnly]
  );

  const runAutoLayout = useCallback(async () => {
    if (nodes.length === 0) {
      return;
    }
    setLayingOut(true);
    try {
      const elkGraph = {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "DOWN",
          "elk.layered.spacing.nodeNodeBetweenLayers": "120",
          "elk.spacing.nodeNode": "80"
        },
        children: nodes.map((item) => ({
          id: item.id,
          width: readNumber(item.width ?? item.measured?.width ?? item.style?.width, DEFAULT_NODE_WIDTH),
          height: readNumber(item.height ?? item.measured?.height ?? item.style?.height, DEFAULT_NODE_HEIGHT)
        })),
        edges: edges.map((item) => ({
          id: item.id,
          sources: [item.source],
          targets: [item.target]
        }))
      };

      const layoutResult = (await elk.layout(elkGraph as never)) as {
        children?: Array<{ id: string; x?: number; y?: number }>;
      };
      const positionById = new Map<string, { x: number; y: number }>();
      for (const child of layoutResult.children ?? []) {
        positionById.set(child.id, {
          x: Math.round(child.x ?? 0),
          y: Math.round(child.y ?? 0)
        });
      }
      setNodes((current) =>
        current.map((item) => {
          const next = positionById.get(item.id);
          if (!next) {
            return item;
          }
          return {
            ...item,
            position: next
          };
        })
      );
    } finally {
      setLayingOut(false);
    }
  }, [edges, nodes]);

  return (
    <div className="canvas">
      <div className="canvas-toolbar">
        <span>Canvas (React Flow + ELK)</span>
        <button type="button" onClick={() => void runAutoLayout()} disabled={layingOut}>
          {layingOut ? "布局中..." : "自动布局"}
        </button>
      </div>
      <div className="reactflow-host">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }) => {
            const ids = [...selectedNodes.map((item) => item.id), ...selectedEdges.map((item) => item.id)];
            onSelect(ids);
          }}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable
          fitViewOptions={{ padding: 0.16 }}
        >
          <Background color="#d3ded6" gap={20} />
          <MiniMap pannable zoomable />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
