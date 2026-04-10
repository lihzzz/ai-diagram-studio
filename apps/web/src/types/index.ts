export type DiagramElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  groupId?: string;
  parentId?: string;
  subtitle?: string;
  style?: string;
  meta?: Record<string, unknown>;
};

export type DiagramRecord = {
  id: string;
  title: string;
  type: "flowchart" | "module_architecture";
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

export type GenerationJobSummary = {
  id: string;
  status: "pending" | "running" | "succeeded" | "failed";
  jobType: string;
  inputType: string;
  provider: string | null;
  model: string | null;
  templateId: string | null;
  diagramType: "flowchart" | "module_architecture";
  reasoningSummary: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};
