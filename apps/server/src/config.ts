import path from "node:path";

const cwd = process.cwd();

function asNumber(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

const nodeEnv = process.env.NODE_ENV ?? "development";

export const config = {
  port: asNumber(process.env.PORT, 3001),
  nodeEnv,
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",
  uploadStorageDir: path.resolve(cwd, process.env.UPLOAD_STORAGE_DIR ?? "./data/uploads"),
  exportOutputDir: path.resolve(cwd, process.env.EXPORT_OUTPUT_DIR ?? "./exports"),
  defaultProvider: process.env.DEFAULT_PROVIDER ?? "openai",
  defaultModelProfileId: process.env.DEFAULT_MODEL_PROFILE_ID ?? "profile_openai_quality",
  aiTemperature: asNumber(process.env.AI_TEMPERATURE, 0.2),
  aiMaxTokens: asNumber(process.env.AI_MAX_TOKENS, 4096),
  aiTimeoutMs: asNumber(process.env.AI_TIMEOUT_MS, 60000),
  aiLogPrompts: asBoolean(process.env.AI_LOG_PROMPTS, nodeEnv === "development"),
  aiPromptLogMaxChars: asNumber(process.env.AI_PROMPT_LOG_MAX_CHARS, 16000)
};
