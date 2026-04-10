import fs from "node:fs/promises";

import { DEFAULT_RENDER_CONFIG, type RenderConfig } from "@ai-diagram-studio/shared";

export type StyleAnalysisResult = {
  stylePrompt: string;
  renderConfig: RenderConfig;
};

function toHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

function tint(hex: string, ratio: number): string {
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) {
    return hex;
  }
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  const mixed = (channel: number) => channel + (255 - channel) * ratio;
  return `#${toHex(mixed(r))}${toHex(mixed(g))}${toHex(mixed(b))}`;
}

function detectDominantColor(buffer: Buffer): string {
  if (buffer.length < 3) {
    return "#2563eb";
  }
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  // PNG/JPEG headers are noisy; start after a small offset and stride to keep cost stable.
  for (let index = 32; index + 2 < buffer.length; index += 257) {
    r += buffer[index];
    g += buffer[index + 1];
    b += buffer[index + 2];
    count += 1;
  }

  if (count === 0) {
    return "#2563eb";
  }

  return `#${toHex(r / count)}${toHex(g / count)}${toHex(b / count)}`;
}

export async function analyzeStyleFromImage(filePath: string): Promise<StyleAnalysisResult> {
  const file = await fs.readFile(filePath);
  const dominant = detectDominantColor(file);
  const soft = tint(dominant, 0.8);
  const medium = tint(dominant, 0.65);

  const renderConfig: RenderConfig = {
    ...DEFAULT_RENDER_CONFIG,
    groupColors: {
      ...DEFAULT_RENDER_CONFIG.groupColors,
      blue: soft,
      green: tint(dominant, 0.72),
      yellow: tint("#f59e0b", 0.68),
      red: tint("#ef4444", 0.7),
      purple: tint("#8b5cf6", 0.68),
      gray: tint("#64748b", 0.78)
    },
    canvas: {
      ...DEFAULT_RENDER_CONFIG.canvas,
      background: "#f8fafc",
      gridColor: medium,
      edgeColor: dominant,
      nodeBorderColor: dominant
    }
  };

  return {
    stylePrompt: `Use a clean technical style with ${dominant} accents, distinct group backgrounds, and clear edge hierarchy.`,
    renderConfig
  };
}
