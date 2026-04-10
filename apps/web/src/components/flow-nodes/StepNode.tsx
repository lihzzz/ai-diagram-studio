import { Handle, Position } from "@xyflow/react";
import { useRenderConfig } from "../../contexts/RenderConfigContext";

function getShapeBorderRadius(kind: string): string {
  if (kind === "start_end") return "50%";
  if (kind === "decision") return "4px";
  return "8px";
}

function getShapeTransform(kind: string): string {
  if (kind === "decision") return "rotate(45deg)";
  return "";
}

export function StepNode({ data }: { data?: Record<string, unknown> }) {
  const config = useRenderConfig();
  const kind = ((data?.kind ?? data?.style) ?? "process") as string;
  const shape = config.stepShapes[kind] ?? "rectangle";
  const isDiamond = shape === "diamond";

  const innerContent = (
    <div
      style={{
        width: isDiamond ? "70%" : "100%",
        height: isDiamond ? "70%" : "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: isDiamond ? "4px" : "8px 12px",
        transform: isDiamond ? "rotate(-45deg)" : undefined,
        overflow: "hidden"
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: config.canvas.nodeBorderColor,
          textAlign: "center",
          lineHeight: 1.3,
          transform: isDiamond ? undefined : undefined
        }}
      >
        {(data?.label as string) ?? ""}
      </div>
      {data?.subtitle ? (
        <div
          style={{
            fontSize: 10,
            color: `${config.canvas.nodeBorderColor}99`,
            textAlign: "center",
            marginTop: 2
          }}
        >
          {data.subtitle as string}
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      style={{
        width: isDiamond ? "140%" : "100%",
        height: isDiamond ? "140%" : "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <div
        style={{
          background: config.canvas.background,
          border: `2px solid ${config.canvas.nodeBorderColor}`,
          borderRadius: getShapeBorderRadius(kind),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          minWidth: 80,
          minHeight: 40,
          transform: getShapeTransform(kind)
        }}
      >
        {innerContent}
      </div>
      <Handle type="target" position={Position.Top} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
