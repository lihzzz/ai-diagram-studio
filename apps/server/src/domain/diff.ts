import type { DiagramElement } from "../types/domain.js";

export type ChangeOp =
  | { kind: "add"; elementId: string; after: DiagramElement }
  | { kind: "remove"; elementId: string; before: DiagramElement }
  | {
      kind: "update";
      elementId: string;
      before: DiagramElement;
      after: DiagramElement;
      fields: string[];
    };

export function createDiff(before: DiagramElement[], after: DiagramElement[]): ChangeOp[] {
  const beforeMap = new Map(before.map((item) => [item.id, item]));
  const afterMap = new Map(after.map((item) => [item.id, item]));
  const ops: ChangeOp[] = [];

  for (const [id, beforeElement] of beforeMap.entries()) {
    const afterElement = afterMap.get(id);
    if (!afterElement) {
      ops.push({ kind: "remove", elementId: id, before: beforeElement });
      continue;
    }

    if (JSON.stringify(beforeElement) !== JSON.stringify(afterElement)) {
      const fields = Object.keys(afterElement).filter((key) => {
        const beforeValue = (beforeElement as Record<string, unknown>)[key];
        const afterValue = (afterElement as Record<string, unknown>)[key];
        return JSON.stringify(beforeValue) !== JSON.stringify(afterValue);
      });
      ops.push({
        kind: "update",
        elementId: id,
        before: beforeElement,
        after: afterElement,
        fields
      });
    }
  }

  for (const [id, afterElement] of afterMap.entries()) {
    if (!beforeMap.has(id)) {
      ops.push({ kind: "add", elementId: id, after: afterElement });
    }
  }

  return ops;
}

export function applyChangeSet(base: DiagramElement[], ops: ChangeOp[]): DiagramElement[] {
  const map = new Map(base.map((item) => [item.id, item]));
  for (const op of ops) {
    if (op.kind === "remove") {
      map.delete(op.elementId);
    }
    if (op.kind === "add") {
      map.set(op.elementId, op.after);
    }
    if (op.kind === "update") {
      map.set(op.elementId, op.after);
    }
  }
  return [...map.values()];
}
