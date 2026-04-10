export type DiagramType = "flowchart" | "module_architecture";

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
