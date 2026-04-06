export type Message =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "system" | "user" | "assistant"; content: Array<Record<string, unknown>> };

export type OpenAIProfile = {
  provider: string;
  model: string;
  apiBase: string | null;
  apiKey: string | null;
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
}): Promise<Record<string, unknown>> {
  const endpoint = chatCompletionsEndpoint(params.profile.apiBase);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json"
  };
  if (params.profile.apiKey?.trim()) {
    headers.Authorization = `Bearer ${params.profile.apiKey.trim()}`;
  }

  try {
    const body = {
      model: params.profile.model,
      messages: params.messages,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      response_format: { type: "json_object" }
    };

    let response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      // Some OpenAI-compatible providers do not support response_format.
      const fallbackBody = {
        model: params.profile.model,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens
      };
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(fallbackBody),
        signal: controller.signal
      });
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const snippet = text.slice(0, 240).replace(/\s+/g, " ");
      throw new Error(`provider_http_${response.status}:${snippet}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const text = extractTextFromResponse(payload);
    return extractJsonObject(text);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("provider_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
