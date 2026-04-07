import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

type StartEndNodeData = {
  label: string;
  width?: number;
  height?: number;
  isEnd?: boolean;
  meta?: Record<string, unknown>;
};

function StartEndNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as StartEndNodeData;
  const width = nodeData.width ?? 140;
  const height = nodeData.height ?? 60;
  const label = nodeData.label ?? "";
  const isEnd = nodeData.isEnd ?? (label.toLowerCase().includes("结束") || label.toLowerCase().includes("end"));

  const gradientStart = isEnd ? "#ef4444" : "#22c55e";
  const gradientEnd = isEnd ? "#dc2626" : "#16a34a";

  return (
    <div
      style={{
        width,
        height,
        background: selected
          ? `linear-gradient(135deg, ${gradientStart} 0%, ${gradientEnd} 100%)`
          : `linear-gradient(135deg, #ffffff 0%, ${isEnd ? "#fef2f2" : "#f0fdf4"} 100%)`,
        borderRadius: height / 2, // stadium shape (pill)
        border: selected
          ? `2px solid ${gradientStart}`
          : `2px solid ${isEnd ? "#ef4444" : "#22c55e"}`,
        boxShadow: selected
          ? `0 0 0 2px rgba(${isEnd ? "239, 68, 68" : "34, 197, 94"}, 0.3), 0 6px 20px rgba(0, 0, 0, 0.12)`
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
          background: isEnd ? "#ef4444" : "#22c55e",
          border: "2px solid #ffffff",
          top: -5,
          opacity: 0
        }}
      />

      <span
        style={{
          color: selected ? "#ffffff" : "#1a2b2a",
          fontWeight: 600,
          fontSize: 14,
          textAlign: "center"
        }}
      >
        {label}
      </span>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: 10,
          height: 10,
          background: isEnd ? "#ef4444" : "#22c55e",
          border: "2px solid #ffffff",
          bottom: -5,
          opacity: 0
        }}
      />
    </div>
  );
}

export const StartEndNode = memo(StartEndNodeComponent);