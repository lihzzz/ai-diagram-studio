export type Message =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "system" | "user" | "assistant"; content: Array<Record<string, unknown>> };

export type OpenAIProfile = {
  provider: string;
  model: string;
  apiBase: string | null;
  apiKey: string | null;
};

export type JsonSchemaSpec = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

type RequestAttempt = {
  body: Record<string, unknown>;
  label: string;
};

function normalizeApiBase(apiBase: string | null): string {
  const trimmed = (apiBase ?? "").trim();
  if (trimmed.length > 0) {
    return trimmed.replace(/\/+$/, "");
  }
  return "https://api.openai.com/v1";
}

function chatCompletionsEndpoint(apiBase: string | null): string {
  const base = normalizeApiBase(apiBase);
  if (base.endsWith("/v1")) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

function extractTextFromResponse(payload: Record<string, unknown>): string {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  if (!first) {
    throw new Error("provider response has no choices");
  }
  const message = first.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const joined = content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        const record = item as Record<string, unknown>;
        return typeof record.text === "string" ? record.text : "";
      })
      .join("\n")
      .trim();
    if (joined) {
      return joined;
    }
  }
  throw new Error("provider response content is empty");
}

function extractJsonObject(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // continue
  }

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const sliced = raw.slice(first, last + 1);
    return JSON.parse(sliced) as Record<string, unknown>;
  }

  throw new Error("model did not return valid JSON");
}

export async function requestJsonFromModel(params: {
  profile: OpenAIProfile;
  messages: Message[];
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  jsonSchema?: JsonSchemaSpec;
  debugTag?: string;
}): Promise<Record<string, unknown>> {
  const endpoint = chatCompletionsEndpoint(params.profile.apiBase);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json"
  };
  if (params.profile.apiKey?.trim()) {
    headers.Authorization = `Bearer ${params.profile.apiKey.trim()}`;
  }

  try {
    const baseBody = {
      model: params.profile.model,
      messages: params.messages,
      temperature: params.temperature,
      max_tokens: params.maxTokens
    };
    const requestBodies: RequestAttempt[] = [];
    const apiBase = (params.profile.apiBase ?? "").toLowerCase();
    const preferJsonObject = apiBase.includes("dashscope");

    const jsonSchemaBody: RequestAttempt | null = params.jsonSchema
      ? {
          label: "json_schema",
          body: {
            ...baseBody,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: params.jsonSchema.name,
                schema: params.jsonSchema.schema,
                strict: params.jsonSchema.strict ?? true
              }
            }
          }
        }
      : null;

    const jsonObjectBody: RequestAttempt = {
      label: "json_object",
      body: {
        ...baseBody,
        response_format: { type: "json_object" }
      }
    };
    const plainBody: RequestAttempt = {
      label: "plain",
      body: baseBody
    };

    if (preferJsonObject) {
      requestBodies.push(jsonObjectBody);
      requestBodies.push(plainBody);
      if (jsonSchemaBody) {
        requestBodies.push(jsonSchemaBody);
      }
    } else {
      if (jsonSchemaBody) {
        requestBodies.push(jsonSchemaBody);
      }
      requestBodies.push(jsonObjectBody);
      requestBodies.push(plainBody);
    }

    let lastError = "provider_request_failed";

    for (const [index, attempt] of requestBodies.entries()) {
      const isLastAttempt = index === requestBodies.length - 1;
      const attemptTimeoutMs = isLastAttempt ? params.timeoutMs : Math.min(15000, params.timeoutMs);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), attemptTimeoutMs);
      if (params.debugTag) {
        console.info(
          `[ai.request.attempt] tag=${params.debugTag} format=${attempt.label} timeoutMs=${attemptTimeoutMs} endpoint=${endpoint}`
        );
      }

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(attempt.body),
          signal: controller.signal
        });
      } catch (error) {
        clearTimeout(timeout);
        if (error instanceof Error && error.name === "AbortError") {
          if (params.debugTag) {
            console.warn(`[ai.request.timeout] tag=${params.debugTag} format=${attempt.label}`);
          }
          lastError = `provider_timeout:${attempt.label}`;
          continue;
        }
        const message = error instanceof Error ? error.message : "unknown_fetch_error";
        if (params.debugTag) {
          console.warn(`[ai.request.network_error] tag=${params.debugTag} format=${attempt.label} message=${message}`);
        }
        lastError = `provider_network_error:${attempt.label}:${message.slice(0, 120)}`;
        continue;
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const snippet = text.slice(0, 240).replace(/\s+/g, " ");
        if (params.debugTag) {
          console.warn(
            `[ai.request.http_error] tag=${params.debugTag} format=${attempt.label} status=${response.status} body=${snippet}`
          );
        }
        lastError = `provider_http_${response.status}:${attempt.label}:${snippet}`;
        continue;
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const text = extractTextFromResponse(payload);
      if (params.debugTag) {
        console.info(`[ai.request.success] tag=${params.debugTag} format=${attempt.label}`);
      }
      return extractJsonObject(text);
    }

    throw new Error(lastError);
  } catch (error) {
    throw error;
  }
}
