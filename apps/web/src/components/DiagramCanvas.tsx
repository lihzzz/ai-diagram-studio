import { forwardRef, useEffect, useImperativeHandle, useCallback, useMemo, useRef, useState } from "react";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  getNodesBounds,
  getViewportForBounds,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange
} from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import { DEFAULT_RENDER_CONFIG, type RenderConfig } from "@ai-diagram-studio/shared";
import "@xyflow/react/dist/style.css";

import type { DiagramElement } from "../types";
import { downloadDataUrl, downloadText, elementsToJson } from "../utils/export-canvas";
import { fromReactFlowElements, toReactFlowElements, type ReactFlowEdge, type ReactFlowNode } from "../utils/reactflow-adapter";
import { RenderConfigProvider } from "../contexts/RenderConfigContext";
import { GroupNode } from "./flow-nodes/GroupNode";
import { StepNode } from "./flow-nodes/StepNode";
import { LabeledEdge } from "./flow-edges/LabeledEdge";

type DiagramCanvasProps = {
  elements: DiagramElement[];
  selection: string[];
  renderConfig?: RenderConfig;
  readOnly?: boolean;
  saving?: boolean;
  onSave?: () => Promise<void>;
  onSelect: (ids: string[]) => void;
  onElementsChange?: (elements: DiagramElement[]) => void;
};

export type DiagramCanvasHandle = {
  getExportOptions: () => {
    bounds: { x: number; y: number; width: number; height: number };
    viewport: { x: number; y: number; zoom: number };
  };
};

const nodeTypes = {
  group: GroupNode,
  step: StepNode
};

const edgeTypes = {
  labeled: LabeledEdge
};

type CanvasBodyProps = {
  elements: DiagramElement[];
  selection: string[];
  renderConfig: RenderConfig;
  readOnly: boolean;
  saving: boolean;
  onSave?: () => Promise<void>;
  onSelect: (ids: string[]) => void;
  onElementsChange?: (elements: DiagramElement[]) => void;
  hostRef: React.MutableRefObject<HTMLDivElement | null>;
  exposeHandle: (handle: DiagramCanvasHandle) => void;
};

function CanvasBody({
  elements,
  selection,
  renderConfig,
  readOnly,
  saving,
  onSave,
  onSelect,
  onElementsChange,
  hostRef,
  exposeHandle
}: CanvasBodyProps) {
  const flow = useReactFlow();
  const [nodes, setNodes] = useState<ReactFlowNode[]>([]);
  const [edges, setEdges] = useState<ReactFlowEdge[]>([]);
  const syncingRef = useRef(false);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const adapterResult = useMemo(() => toReactFlowElements(elements), [elements]);

  useEffect(() => {
    syncingRef.current = true;
    setNodes(adapterResult.nodes);
    setEdges(adapterResult.edges);
    const timer = window.setTimeout(() => {
      syncingRef.current = false;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [adapterResult.edges, adapterResult.nodes]);

  useEffect(() => {
    const selectedNodeIds = new Set(selection);
    setNodes((state) =>
      state.map((node) => ({
        ...node,
        selected: selectedNodeIds.has(node.id)
      }))
    );
  }, [selection]);

  const emitElements = useCallback((nextNodes: ReactFlowNode[], nextEdges: ReactFlowEdge[]) => {
    if (readOnly || !onElementsChange || syncingRef.current) return;
    onElementsChange(fromReactFlowElements(nextNodes, nextEdges));
  }, [readOnly, onElementsChange]);

  const onNodesChange = useCallback((changes: NodeChange<ReactFlowNode>[]) => {
    setNodes((state) => {
      const next = applyNodeChanges(changes, state);
      emitElements(next, edgesRef.current);
      return next;
    });
  }, [emitElements]);

  const onEdgesChange = useCallback((changes: EdgeChange<ReactFlowEdge>[]) => {
    setEdges((state) => {
      const next = applyEdgeChanges(changes, state);
      emitElements(nodesRef.current, next);
      return next;
    });
  }, [emitElements]);

  const onConnect = useCallback((connection: Connection) => {
    if (readOnly) return;
    const nextEdge: ReactFlowEdge = {
      id: `edge_${Date.now()}`,
      source: connection.source ?? "",
      target: connection.target ?? "",
      sourceHandle: connection.sourceHandle ?? null,
      targetHandle: connection.targetHandle ?? null,
      type: "labeled",
      data: { style: "solid" }
    };
    setEdges((state) => {
      const next = addEdge(nextEdge, state);
      emitElements(nodesRef.current, next);
      return next;
    });
  }, [readOnly, emitElements]);

  const handleSelectionChange = useCallback((payload: { nodes: ReactFlowNode[]; edges: ReactFlowEdge[] }) => {
    const ids = [...payload.nodes.map((node) => node.id), ...payload.edges.map((edge) => edge.id)];
    onSelect(ids);
  }, [onSelect]);

  const getExportOptions = () => {
    const targetNodes = flow.getNodes();
    const bounds = getNodesBounds(targetNodes);
    const viewport = getViewportForBounds(bounds, 1920, 1080, 0.25, 2, 0.1);
    return { bounds, viewport };
  };

  useEffect(() => {
    exposeHandle({ getExportOptions });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const exportImage = async (format: "png" | "svg") => {
    const pane = hostRef.current?.querySelector(".react-flow__viewport") as HTMLElement | null;
    if (!pane) return;

    const previousViewport = flow.getViewport();
    const { viewport } = getExportOptions();
    await flow.setViewport(viewport, { duration: 0 });
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

    try {
      if (format === "png") {
        const dataUrl = await toPng(pane, { pixelRatio: 2, backgroundColor: renderConfig.canvas.background });
        await downloadDataUrl(dataUrl, "diagram.png");
      } else {
        const dataUrl = await toSvg(pane, { backgroundColor: renderConfig.canvas.background });
        await downloadDataUrl(dataUrl, "diagram.svg");
      }
    } finally {
      await flow.setViewport(previousViewport, { duration: 0 });
    }
  };

  const exportJson = async () => {
    const json = elementsToJson(fromReactFlowElements(nodes, edges));
    await downloadText(json, "diagram.json");
  };

  return (
    <div className="ed-canvas" ref={hostRef}>
      <div className="ed-canvas-toolbar">
        <span className="ed-canvas-label">Canvas</span>
        <div className="ed-canvas-toolbar-actions">
          {onSave ? (
            <button type="button" className="ed-canvas-save-btn" onClick={() => void onSave()} disabled={Boolean(saving)}>
              {saving ? "保存中..." : "保存"}
            </button>
          ) : null}
          <button type="button" onClick={() => void exportImage("png")}>PNG</button>
          <button type="button" onClick={() => void exportImage("svg")}>SVG</button>
          <button type="button" onClick={() => void exportJson()}>JSON</button>
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodeTypes={nodeTypes as never}
        edgeTypes={edgeTypes as never}
        nodesConnectable={!readOnly}
        nodesDraggable={!readOnly}
        elementsSelectable
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={handleSelectionChange}
        defaultEdgeOptions={{
          type: "labeled",
          style: {
            stroke: renderConfig.canvas.edgeColor,
            strokeWidth: 2
          }
        }}
      >
        <Background color={renderConfig.canvas.gridColor} gap={24} />
        <MiniMap zoomable pannable style={{ background: `${renderConfig.canvas.background}88` }} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export const DiagramCanvas = forwardRef<DiagramCanvasHandle, DiagramCanvasProps>(function DiagramCanvas(
  {
    elements,
    selection,
    renderConfig = DEFAULT_RENDER_CONFIG,
    readOnly = false,
    saving = false,
    onSave,
    onSelect,
    onElementsChange
  },
  ref
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<DiagramCanvasHandle>({
    getExportOptions: () => ({
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      viewport: { x: 0, y: 0, zoom: 1 }
    })
  });

  useImperativeHandle(ref, () => handleRef.current, []);

  return (
    <RenderConfigProvider config={renderConfig}>
      <ReactFlowProvider>
        <CanvasBody
          elements={elements}
          selection={selection}
          renderConfig={renderConfig}
          readOnly={readOnly}
          saving={saving}
          onSave={onSave}
          onSelect={onSelect}
          onElementsChange={onElementsChange}
          hostRef={hostRef}
          exposeHandle={(handle) => {
            handleRef.current = handle;
          }}
        />
      </ReactFlowProvider>
    </RenderConfigProvider>
  );
});
