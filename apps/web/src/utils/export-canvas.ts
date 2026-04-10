import type { DiagramElement } from "../types";

export type ExportOptions = {
  format: "png" | "svg" | "json";
  includeBackground?: boolean;
};

export async function downloadDataUrl(dataUrl: string, filename: string): Promise<void> {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function downloadText(content: string, filename: string): Promise<void> {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  await downloadDataUrl(url, filename);
  URL.revokeObjectURL(url);
}

export function elementsToJson(elements: DiagramElement[]): string {
  return JSON.stringify({ elements }, null, 2);
}
