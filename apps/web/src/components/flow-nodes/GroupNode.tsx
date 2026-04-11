import { Handle, Position } from "@xyflow/react";
import { useRenderConfig } from "../../contexts/RenderConfigContext";

function resolveGroupColor(raw: string | undefined, fallback: string, palette: Record<string, string>): string {
  if (!raw) {
    return fallback;
  }
  if (palette[raw]) {
    return palette[raw];
  }
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("color", raw)) {
    return raw;
  }
  return fallback;
}

export function GroupNode({ data }: { data?: Record<string, unknown> }) {
  const config = useRenderConfig();
  const colorKey = (data?.colorKey as string | undefined) ?? "blue";
  const bgColor = resolveGroupColor(colorKey, config.groupColors.blue, config.groupColors);
  const title = (data?.title as string) ?? "";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: bgColor,
        borderRadius: 8,
        border: `1px solid ${config.canvas.nodeBorderColor}33`,
        display: "flex",
        flexDirection: "column"
      }}
    >
      <div
        style={{
          padding: "4px 12px",
          fontSize: 12,
          fontWeight: 600,
          color: config.canvas.nodeBorderColor,
          borderBottom: `1px solid ${config.canvas.nodeBorderColor}22`
        }}
      >
        {title}
      </div>
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="target" position={Position.Top} id="top" />
    </div>
  );
}
