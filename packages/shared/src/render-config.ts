export type StepShape = "ellipse" | "rectangle" | "diamond";
export type EdgeStyle = "solid" | "dashed";

export type RenderConfig = {
  groupColors: Record<string, string>;
  stepKinds: string[];
  stepShapes: Record<string, StepShape>;
  edgeStyles: Record<string, EdgeStyle>;
  canvas: {
    background: string;
    gridColor: string;
    edgeColor: string;
    nodeBorderColor: string;
  };
};

export const DEFAULT_RENDER_CONFIG: RenderConfig = {
  groupColors: {
    blue: "#1e3a5f",
    green: "#1a4731",
    yellow: "#4a3f1a",
    red: "#4a1a1a",
    purple: "#2d1b69",
    gray: "#1e1e2e"
  },
  stepKinds: ["start_end", "process", "decision"],
  stepShapes: {
    start_end: "ellipse",
    process: "rectangle",
    decision: "diamond"
  },
  edgeStyles: {
    solid: "solid",
    dashed: "dashed"
  },
  canvas: {
    background: "#0a0a0f",
    gridColor: "#1e1e30",
    edgeColor: "#8888a8",
    nodeBorderColor: "#7c3aed"
  }
};

export const MINIMAL_LIGHT_RENDER_CONFIG: RenderConfig = {
  groupColors: {
    blue: "#E8F0FE",
    green: "#E6F4EA",
    yellow: "#FEF7E0",
    red: "#FCE8E6",
    purple: "#F3E8FD",
    gray: "#F1F3F4"
  },
  stepKinds: ["start_end", "process", "decision"],
  stepShapes: {
    start_end: "ellipse",
    process: "rectangle",
    decision: "diamond"
  },
  edgeStyles: {
    solid: "solid",
    dashed: "dashed"
  },
  canvas: {
    background: "#F8F8F8",
    gridColor: "#EAEAEA",
    edgeColor: "#B0B0B0",
    nodeBorderColor: "#C0C0C0"
  }
};
