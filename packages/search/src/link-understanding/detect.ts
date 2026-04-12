import { isBlockedHostnameOrIp } from "./ssrf";

const MARKDOWN_LINK_RE = /\[[^\]]*]\((https?:\/\/\S+?)\)/gi;
const BARE_LINK_RE = /https?:\/\/\S+/gi;

function stripMarkdownLinks(message: string) {
  return message.replace(MARKDOWN_LINK_RE, " ");
}

function normalizeRawUrl(raw: string) {
  return raw.trim().replace(/[),.;!?]+$/u, "");
}

function resolveMaxLinks(value?: number) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  return 1;
}

function isAllowedUrl(raw: string) {
  try {
    const parsed = new URL(raw);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    return !isBlockedHostnameOrIp(parsed.hostname);
  } catch {
    return false;
  }
}

export function extractLinksFromMessage(message: string, opts?: { maxLinks?: number }) {
  const source = message.trim();

  if (!source) {
    return [];
  }

  const maxLinks = resolveMaxLinks(opts?.maxLinks);
  const sanitized = stripMarkdownLinks(source);
  const seen = new Set<string>();
  const results: string[] = [];

  for (const match of sanitized.matchAll(BARE_LINK_RE)) {
    const raw = normalizeRawUrl(match[0] ?? "");

    if (!raw || !isAllowedUrl(raw) || seen.has(raw)) {
      continue;
    }

    seen.add(raw);
    results.push(raw);

    if (results.length >= maxLinks) {
      break;
    }
  }

  return results;
}
