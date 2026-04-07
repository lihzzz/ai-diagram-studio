import path from "node:path";

const cwd = process.cwd();

function asNumber(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: asNumber(process.env.PORT, 3000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",
  iconStorageDir: path.resolve(cwd, process.env.ICON_STORAGE_DIR ?? "./data/icons"),
  exportOutputDir: path.resolve(cwd, process.env.EXPORT_OUTPUT_DIR ?? "./exports"),
  defaultProvider: process.env.DEFAULT_PROVIDER ?? "openai",
  defaultModelProfileId: process.env.DEFAULT_MODEL_PROFILE_ID ?? "profile_openai_quality",
  aiTemperature: asNumber(process.env.AI_TEMPERATURE, 0.2),
  aiMaxTokens: asNumber(process.env.AI_MAX_TOKENS, 4096),
  aiTimeoutMs: asNumber(process.env.AI_TIMEOUT_MS, 60000)
};