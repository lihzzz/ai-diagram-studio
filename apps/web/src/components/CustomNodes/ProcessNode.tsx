import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

type ProcessNodeData = {
  label: string;
  width?: number;
  height?: number;
  icon?: string;
  meta?: Record<string, unknown>;
};

function ProcessNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as ProcessNodeData;
  const width = nodeData.width ?? 220;
  const height = nodeData.height ?? 96;
  const label = nodeData.label ?? "";

  return (
    <div
      style={{
        width,
        height,
        background: selected
          ? "linear-gradient(135deg, #0f7b6c 0%, #17605f 100%)"
          : "linear-gradient(135deg, #ffffff 0%, #f0f4f8 100%)",
        borderRadius: 12,
        border: selected ? "2px solid #0f7b6c" : "2px solid #1f6f66",
        boxShadow: selected
          ? "0 0 0 2px rgba(15, 123, 108, 0.3), 0 8px 24px rgba(0, 0, 0, 0.15)"
          : "0 4px 12px rgba(0, 0, 0, 0.1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "12px 16px",
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
          background: "#1f6f66",
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
          textAlign: "center",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: width - 32
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
          background: "#1f6f66",
          border: "2px solid #ffffff",
          bottom: -5,
          opacity: 0
        }}
      />
    </div>
  );
}

export const ProcessNode = memo(ProcessNodeComponent);