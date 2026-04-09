import type { DiagramElement, DiagramType } from "../types/domain.js";

import type { ChangeOp } from "./diff.js";
import { createId } from "../utils/id.js";

function createNode(label: string, index: number, groupId?: string): DiagramElement {
  return {
    id: createId("node"),
    type: "rectangle",
    x: 120 + (index % 4) * 260,
    y: 100 + Math.floor(index / 4) * 180,
    width: 220,
    height: 96,
    text: label,
    groupId
  };
}

function createArrow(from: DiagramElement, to: DiagramElement): DiagramElement {
  return {
    id: createId("edge"),
    type: "arrow",
    x: from.x,
    y: from.y,
    text: `${from.id}->${to.id}`,
    meta: { fromId: from.id, toId: to.id }
  };
}

function normalizeLines(inputText: string): string[] {
  return inputText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractTopic(sentence: string): string {
  return sentence
    .replace(/(请|帮我|生成|创建|画|绘制|一个|一张|流程图|模块图|架构图)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitBySequenceHint(sentence: string): string[] {
  return sentence
    .split(/(?:->|=>|，|,|。|；|;|然后|接着|最后|并且|并|且|and then|then)/i)
    .map((item) => item.trim())
    .filter((item) => item.length > 1);
}

function isEcommerceFlow(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return /电商|购物|商城|订单|支付|商品/.test(sentence) || /e-?commerce|shopping|order|payment|cart/.test(lower);
}

function inferFlowSteps(sentence: string): string[] {
  const splitSteps = splitBySequenceHint(sentence);
  if (splitSteps.length >= 3) {
    return splitSteps;
  }

  if (isEcommerceFlow(sentence)) {
    return [
      "用户访问首页",
      "搜索/浏览商品",
      "加入购物车",
      "提交订单",
      "发起支付",
      "支付回调确认",
      "商家发货",
      "物流配送",
      "确认收货与评价"
    ];
  }

  const topic = extractTopic(sentence) || "业务流程";
  return ["开始", `输入: ${topic}`, "核心处理", "结果校验", "输出结果", "结束"];
}

function expandSingleLineIntent(line: string, diagramType: DiagramType): string[] {
  void diagramType;
  return inferFlowSteps(line);
}

export function generateElementsFromText(inputText: string, diagramType: DiagramType): DiagramElement[] {
  let lines = normalizeLines(inputText);
  if (lines.length === 0) {
    return [createNode("Start", 0), createNode("End", 1)];
  }
  if (lines.length === 1) {
    lines = expandSingleLineIntent(lines[0], diagramType);
  }

  const nodes = lines.map((line, index) => createNode(line, index));
  const edges: DiagramElement[] = [];

  for (let index = 0; index < nodes.length - 1; index += 1) {
    edges.push(createArrow(nodes[index], nodes[index + 1]));
  }

  return [...nodes, ...edges];
}

export function generateElementsFromDocument(chunks: string[], diagramType: DiagramType): DiagramElement[] {
  const topChunks = chunks.slice(0, 8);
  const normalized = topChunks.map((chunk) => chunk.slice(0, 50).replace(/\s+/g, " ").trim());
  return generateElementsFromText(normalized.join("\n"), diagramType);
}

export function generateElementsFromImageHint(filename: string, diagramType: DiagramType): DiagramElement[] {
  const hints = [
    `Extracted from ${filename}`,
    "Detected container",
    "Detected service",
    "Detected dependency"
  ];
  const elements = generateElementsFromText(hints.join("\n"), diagramType);
  return elements.map((element) => {
    if (element.type !== "rectangle") {
      return element;
    }

    return {
      ...element,
      meta: {
        ...(element.meta ?? {}),
        confidence: Math.random() < 0.35 ? 0.42 : 0.89,
        source: "image_ocr"
      }
    };
  });
}

export function generateChangeSetFromInstruction(
  input: DiagramElement[],
  instruction: string,
  selection: string[]
): { ops: ChangeOp[]; summary: string } {
  const lower = instruction.toLowerCase();
  const selectedSet = new Set(selection);
  const scope = selection.length > 0 ? input.filter((item) => selectedSet.has(item.id)) : input;

  if (lower.includes("删除") || lower.includes("remove") || lower.includes("delete")) {
    const target = scope.find((item) => item.type !== "arrow");
    if (target) {
      return {
        ops: [{ kind: "remove", elementId: target.id, before: target }],
        summary: `删除节点 ${target.text ?? target.id}`
      };
    }
  }

  if (lower.includes("重命名") || lower.includes("rename")) {
    const target = scope.find((item) => item.type !== "arrow");
    if (target) {
      const renamed = { ...target, text: `${target.text ?? "节点"} (Renamed)` };
      return {
        ops: [
          {
            kind: "update",
            elementId: target.id,
            before: target,
            after: renamed,
            fields: ["text"]
          }
        ],
        summary: `重命名节点 ${target.id}`
      };
    }
  }

  const newNode = createNode(`New: ${instruction.slice(0, 36)}`, input.length + 1);
  const anchor = scope.find((item) => item.type !== "arrow");
  const ops: ChangeOp[] = [{ kind: "add", elementId: newNode.id, after: newNode }];

  if (anchor) {
    const edge = createArrow(anchor, newNode);
    ops.push({ kind: "add", elementId: edge.id, after: edge });
  }

  return {
    ops,
    summary: `新增节点 ${newNode.text}`
  };
}

export function generateReasoningSummary(params: {
  inputType: string;
  diagramType: DiagramType;
  sourceRefs: string[];
  changeSummary?: string;
}): Record<string, unknown> {
  return {
    layeringReason: "按步骤顺序组织流程",
    keyDependencies: ["上游触发", "核心处理", "下游输出"],
    alternatives: ["可改为事件驱动链路", "可按领域边界拆分子模块"],
    sources: params.sourceRefs,
    inputType: params.inputType,
    changeSummary: params.changeSummary ?? null
  };
}
