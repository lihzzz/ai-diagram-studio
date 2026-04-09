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

export type DiagramRecord = {
  id: string;
  title: string;
  type: "flowchart";
  engineType: DiagramEngineType;
  currentVersion: number;
  elements: DiagramElement[];
  appState: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type GenerationJobResult = {
  jobId: string;
  status: "pending" | "running" | "succeeded" | "failed";
  progress: number;
  result: DiagramElement[] | null;
  reasoningSummary: Record<string, unknown> | null;
  error: string | null;
};
