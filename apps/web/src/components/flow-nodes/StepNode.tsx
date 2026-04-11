import { Handle, Position } from "@xyflow/react";
import { useRenderConfig } from "../../contexts/RenderConfigContext";

function getShapeBorderRadius(kind: string): string {
  if (kind === "start_end") return "999px";
  if (kind === "decision") return "0";
  return "8px";
}

export function StepNode({ data }: { data?: Record<string, unknown> }) {
  const config = useRenderConfig();
  const kind = ((data?.kind ?? data?.style) ?? "process") as string;
  const shape = config.stepShapes[kind] ?? "rectangle";
  const isDiamond = shape === "diamond";

  const innerContent = (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: isDiamond ? "10px 14px" : "8px 12px",
        overflow: "hidden"
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: config.canvas.nodeBorderColor,
          textAlign: "center",
          lineHeight: 1.3
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
        width: "100%",
        height: "100%",
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
          clipPath: isDiamond ? "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" : undefined
        }}
      >
        {innerContent}
      </div>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} id="right" />
    </div>
  );
}
