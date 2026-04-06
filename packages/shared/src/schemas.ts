import { z } from "zod";

export const diagramTypeSchema = z.enum(["flowchart", "module_architecture"]);
export const generationModeSchema = z.enum(["text", "image", "document", "chat"]);
export const generationJobTypeSchema = z.enum([
  "text_generate",
  "image_generate",
  "doc_generate",
  "chat_edit"
]);
export const jobStatusSchema = z.enum(["pending", "running", "succeeded", "failed"]);

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

export const diagramSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: diagramTypeSchema,
  currentVersion: z.number().int().positive(),
  elements: z.array(diagramElementSchema),
  appState: z.record(z.unknown()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const createDiagramSchema = z.object({
  title: z.string().min(1).max(200),
  type: diagramTypeSchema,
  elements: z.array(diagramElementSchema).default([]),
  appState: z.record(z.unknown()).optional()
});

export const updateDiagramSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  elements: z.array(diagramElementSchema).optional(),
  appState: z.record(z.unknown()).nullable().optional(),
  version: z.number().int().positive()
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

export type DiagramType = z.infer<typeof diagramTypeSchema>;
export type DiagramElement = z.infer<typeof diagramElementSchema>;
export type DiagramDto = z.infer<typeof diagramSchema>;
export type GenerationMode = z.infer<typeof generationModeSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
