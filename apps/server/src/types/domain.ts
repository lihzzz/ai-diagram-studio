export type DiagramType = "flowchart";
export type DiagramEngineType = "reactflow_elk" | "excalidraw";

export type DiagramElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  groupId?: string;
  meta?: Record<string, unknown>;
};
