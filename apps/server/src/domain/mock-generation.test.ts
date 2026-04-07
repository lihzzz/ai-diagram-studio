import { describe, expect, it } from "vitest";

import {
  generateChangeSetFromInstruction,
  generateElementsFromText
} from "./mock-generation.js";

describe("mock generation", () => {
  it("should generate non-empty graph from text", () => {
    const elements = generateElementsFromText("A\nB\nC", "flowchart");
    expect(elements.length).toBeGreaterThan(3);
  });

  it("should expand single-sentence ecommerce intent into multi-step flow", () => {
    const elements = generateElementsFromText("生成一个电商网站流程图", "flowchart");
    const nodes = elements.filter((item) => item.type === "rectangle");
    const edges = elements.filter((item) => item.type === "arrow");
    expect(nodes.length).toBeGreaterThanOrEqual(6);
    expect(edges.length).toBeGreaterThanOrEqual(5);
  });

  it("should expand single-sentence architecture intent into modules", () => {
    const elements = generateElementsFromText("生成一个订单系统模块图", "module_architecture");
    const nodeTexts = elements.filter((item) => item.type === "rectangle").map((item) => item.text ?? "");
    expect(nodeTexts.some((text) => text.includes("Module:"))).toBe(true);
    expect(nodeTexts.length).toBeGreaterThanOrEqual(4);
  });

  it("should output ops for chat instruction", () => {
    const base = [{ id: "n1", type: "rectangle", x: 0, y: 0, text: "订单服务" }];
    const patch = generateChangeSetFromInstruction(base, "新增支付风控模块", []);
    expect(patch.ops.length).toBeGreaterThan(0);
  });
});
