import { randomUUID } from "node:crypto";

export function createId(prefix?: string): string {
  if (!prefix) {
    return randomUUID();
  }
  return `${prefix}_${randomUUID()}`;
}
