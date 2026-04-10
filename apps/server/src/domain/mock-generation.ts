import type { DiagramElement, DiagramType } from "../types/domain.js";

import { createId } from "../utils/id.js";

function createNode(label: string, index: number, diagramType: DiagramType): DiagramElement {
  const isArchitecture = diagramType === "module_architecture";
  return {
    id: createId("node"),
    type: "step",
    x: 120 + (index % 4) * 260,
    y: 100 + Math.floor(index / 4) * 180,
    width: 220,
    height: 96,
    text: isArchitecture ? `Module: ${label}` : label,
    style: isArchitecture ? "process" : index === 0 ? "start_end" : "process",
    meta: {
      kind: isArchitecture ? "process" : index === 0 ? "start_end" : "process"
    }
  };
}

function createArrow(from: DiagramElement, to: DiagramElement): DiagramElement {
  return {
    id: createId("edge"),
    type: "arrow",
    x: from.x,
    y: from.y,
    text: `${from.id}->${to.id}`,
    style: "solid",
    meta: { fromId: from.id, toId: to.id, style: "solid" }
  };
}

function normalizeLines(inputText: string): string[] {
  return inputText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function expandSingleLineIntent(line: string, diagramType: DiagramType): string[] {
  const lower = line.toLowerCase();
  if (diagramType === "module_architecture") {
    const topic = line.replace(/生成|创建|模块图|架构图|系统/g, "").trim() || "系统";
    return [`${topic} 接入层`, `${topic} 应用层`, `${topic} 服务层`, `${topic} 数据层`];
  }

  if (/电商|order|payment|shopping/.test(lower)) {
    return ["开始", "浏览商品", "创建订单", "支付", "发货", "结束"];
  }

  return ["开始", line, "处理", "结束"];
}

export function generateElementsFromText(inputText: string, diagramType: DiagramType): DiagramElement[] {
  let lines = normalizeLines(inputText);
  if (lines.length === 0) {
    lines = ["开始", "结束"];
  }
  if (lines.length === 1) {
    lines = expandSingleLineIntent(lines[0], diagramType);
  }

  const nodes = lines.map((line, index) => createNode(line, index, diagramType));
  const edges: DiagramElement[] = [];

  for (let index = 0; index < nodes.length - 1; index += 1) {
    edges.push(createArrow(nodes[index], nodes[index + 1]));
  }

  return [...nodes, ...edges];
}

export function generateReasoningSummary(params: {
  diagramType: DiagramType;
  sourceRefs: string[];
  fallbackReason?: string;
}): Record<string, unknown> {
  return {
    layeringReason: params.diagramType === "module_architecture" ? "按职责分层" : "按步骤推进",
    keyDependencies: ["输入", "处理", "输出"],
    alternatives: ["可拆分子流程", "可按领域拆分模块"],
    sources: params.sourceRefs,
    fallback: true,
    fallbackReason: params.fallbackReason ?? null
  };
}
