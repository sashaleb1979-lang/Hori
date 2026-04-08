import { normalizeWhitespace } from "@hori/shared";

export class ResponseGuard {
  enforce(text: string, options: { maxChars: number; forbiddenWords: string[] }) {
    let guarded = normalizeWhitespace(text);

    for (const forbiddenWord of options.forbiddenWords) {
      if (!forbiddenWord) {
        continue;
      }

      const escaped = forbiddenWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      guarded = guarded.replace(new RegExp(escaped, "gi"), "[скрыто]");
    }

    if (guarded.length > options.maxChars) {
      guarded = `${guarded.slice(0, options.maxChars - 3).trim()}...`;
    }

    return guarded;
  }
}

