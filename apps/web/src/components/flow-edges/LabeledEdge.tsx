import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { useRenderConfig } from "../../contexts/RenderConfigContext";

export function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style
}: EdgeProps) {
  const config = useRenderConfig();
  const edgeStyle = (data?.style as "solid" | "dashed" | undefined) ?? "solid";
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  });

  const strokeColor = config.canvas.edgeColor;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...(style ?? {}),
          stroke: strokeColor,
          strokeWidth: 2,
          strokeDasharray: edgeStyle === "dashed" ? "6 4" : undefined
        }}
      />
      {(data?.label as string | undefined) ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              background: config.canvas.background,
              padding: "2px 6px",
              borderRadius: 4,
              fontSize: 10,
              color: strokeColor,
              border: `1px solid ${strokeColor}33`,
              pointerEvents: "none"
            }}
          >
            {data?.label as string}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
