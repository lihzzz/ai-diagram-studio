import { z } from "zod";

export const diagramTypeSchema = z.enum(["flowchart", "module_architecture"]);
export const generationModeSchema = z.enum(["text"]);

export const diagramElementSchema = z.object({
  id: z.string(),
  type: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  text: z.string().optional(),
  groupId: z.string().optional(),
  parentId: z.string().optional(),
  subtitle: z.string().optional(),
  style: z.string().optional(),
  meta: z.record(z.unknown()).optional()
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
  version: z.number().int().positive().optional()
});

export const createGenerationJobSchema = z.object({
  mode: generationModeSchema,
  diagramType: diagramTypeSchema,
  inputText: z.string().optional(),
  diagramId: z.string().optional(),
  previousReasoning: z.record(z.unknown()).optional(),
  existingElements: z.array(diagramElementSchema).optional(),
  options: z.record(z.unknown()).optional(),
  modelProfileId: z.string().optional()
});

export const applyGenerationJobSchema = z.object({
  diagramId: z.string()
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
