import { z } from "zod";

export const diagramTypeSchema = z.enum(["flowchart"]);
export const diagramEngineSchema = z.enum(["reactflow_elk", "excalidraw"]);
export const generationModeSchema = z.enum(["text", "image", "document", "chat"]);

export const diagramElementSchema = z.object({
  id: z.string(),
  type: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  text: z.string().optional(),
  groupId: z.string().optional(),
  meta: z.record(z.unknown()).optional()
});

export const createDiagramSchema = z.object({
  title: z.string().min(1).max(200),
  type: diagramTypeSchema,
  engineType: diagramEngineSchema.default("reactflow_elk"),
  elements: z.array(diagramElementSchema).default([]),
  appState: z.record(z.unknown()).optional()
});

export const updateDiagramSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  engineType: diagramEngineSchema.optional(),
  elements: z.array(diagramElementSchema).optional(),
  appState: z.record(z.unknown()).nullable().optional(),
  version: z.number().int().positive().optional()
});

export const createGenerationJobSchema = z.object({
  mode: generationModeSchema,
  diagramType: diagramTypeSchema,
  inputText: z.string().optional(),
  assetId: z.string().optional(),
  sessionId: z.string().optional(),
  diagramId: z.string().optional(),
  instruction: z.string().optional(),
  options: z.record(z.unknown()).optional(),
  modelProfileId: z.string().optional()
});

export const applyGenerationJobSchema = z.object({
  diagramId: z.string()
});

export const createChatSessionSchema = z.object({
  diagramId: z.string()
});

export const createChatTurnSchema = z.object({
  content: z.string().min(1),
  selection: z.array(z.string()).optional(),
  modelProfileId: z.string().optional()
});

export const createModelProfileSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  apiBase: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  qualityRank: z.number().int().min(1).max(100),
  isDefault: z.boolean().optional(),
  enabled: z.boolean().optional()
});

export const patchModelProfileSchema = z.object({
  model: z.string().min(1).optional(),
  apiBase: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  qualityRank: z.number().int().min(1).max(100).optional(),
  isDefault: z.boolean().optional(),
  enabled: z.boolean().optional()
});

export const setDefaultModelSchema = z.object({
  modelProfileId: z.string()
});
