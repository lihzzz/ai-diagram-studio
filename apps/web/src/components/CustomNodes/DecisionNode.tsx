import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

type DecisionNodeData = {
  label: string;
  width?: number;
  height?: number;
  meta?: Record<string, unknown>;
};

function DecisionNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as DecisionNodeData;
  const size = Math.max(nodeData.width ?? 160, nodeData.height ?? 160);
  const label = nodeData.label ?? "";

  // 菱形通过 CSS clip-path 实现
  return (
    <div
      style={{
        width: size,
        height: size,
        background: selected
          ? "linear-gradient(135deg, #f06f2b 0%, #e05a1a 100%)"
          : "linear-gradient(135deg, #ffffff 0%, #fff5eb 100%)",
        clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
        border: selected ? "none" : "none",
        boxShadow: selected
          ? "0 0 0 3px rgba(240, 111, 43, 0.4)"
          : "0 4px 12px rgba(0, 0, 0, 0.1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 200ms ease",
        position: "relative"
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: 10,
          height: 10,
          background: "#f06f2b",
          border: "2px solid #ffffff",
          top: 0,
          opacity: 0
        }}
      />

      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 10,
          height: 10,
          background: "#f06f2b",
          border: "2px solid #ffffff",
          right: 0,
          opacity: 0
        }}
      />

      <div
        style={{
          position: "absolute",
          width: size * 0.6,
          height: size * 0.4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <span
          style={{
            color: selected ? "#ffffff" : "#1a2b2a",
            fontWeight: 600,
            fontSize: 13,
            textAlign: "center",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {label}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: 10,
          height: 10,
          background: "#f06f2b",
          border: "2px solid #ffffff",
          bottom: 0,
          opacity: 0
        }}
      />

      <Handle
        type="source"
        position={Position.Left}
        style={{
          width: 10,
          height: 10,
          background: "#f06f2b",
          border: "2px solid #ffffff",
          left: 0,
          opacity: 0
        }}
      />
    </div>
  );
}

export const DecisionNode = memo(DecisionNodeComponent);