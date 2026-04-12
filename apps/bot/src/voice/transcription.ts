import type { AppEnv } from "@hori/config";
import type { AppLogger } from "@hori/shared";

import { Buffer } from "node:buffer";

export function isValidTranscription(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }

  if (normalized.includes("[BLANK_AUDIO]")) {
    return false;
  }

  return normalized.length >= 2;
}

export async function openAiTranscribeWav(
  env: AppEnv,
  wavBuffer: Buffer,
  logger: AppLogger,
): Promise<string> {
  if (!env.OPENAI_STT_API_KEY) {
    return "";
  }

  const baseUrl = env.OPENAI_STT_API_BASE_URL || "https://api.openai.com/v1";
  const form = new FormData();
  form.set("model", env.OPENAI_STT_MODEL);
  form.set("file", new File([wavBuffer], "voice.wav", { type: "audio/wav" }));

  try {
    const response = await fetch(new URL("/audio/transcriptions", baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_STT_API_KEY}`,
      },
      body: form,
      signal: AbortSignal.timeout(Math.max(30_000, env.OLLAMA_TIMEOUT_MS)),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, "openai stt request failed");
      return "";
    }

    const payload = (await response.json()) as { text?: string };
    return payload.text?.trim() ?? "";
  } catch (error) {
    logger.warn({ error }, "openai stt request failed");
    return "";
  }
}