import { describe, expect, it } from "vitest";

import { applyChangeSet, createDiff } from "./diff.js";

describe("diff domain", () => {
  it("should produce add/update/remove operations", () => {
    const before = [
      { id: "a", type: "rectangle", x: 0, y: 0, text: "A" },
      { id: "b", type: "rectangle", x: 1, y: 1, text: "B" }
    ];
    const after = [
      { id: "a", type: "rectangle", x: 0, y: 0, text: "A2" },
      { id: "c", type: "rectangle", x: 2, y: 2, text: "C" }
    ];

    const ops = createDiff(before, after);
    expect(ops.some((item) => item.kind === "update" && item.elementId === "a")).toBe(true);
    expect(ops.some((item) => item.kind === "remove" && item.elementId === "b")).toBe(true);
    expect(ops.some((item) => item.kind === "add" && item.elementId === "c")).toBe(true);
  });

  it("should apply change set on top of base", () => {
    const base = [{ id: "a", type: "rectangle", x: 0, y: 0, text: "A" }];
    const next = applyChangeSet(base, [
      {
        kind: "update",
        elementId: "a",
        before: base[0],
        after: { ...base[0], text: "A+" },
        fields: ["text"]
      },
      {
        kind: "add",
        elementId: "b",
        after: { id: "b", type: "rectangle", x: 10, y: 10, text: "B" }
      }
    ]);
    expect(next.length).toBe(2);
    expect(next.find((item) => item.id === "a")?.text).toBe("A+");
  });
});
