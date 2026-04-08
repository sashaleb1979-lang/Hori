import { normalizeWhitespace } from "@hori/shared";

import type { AppEnv } from "@hori/config";

import { sanitizeHtmlToText } from "../sanitize/text-sanitizer";

function isAllowedDomain(urlString: string, env: AppEnv) {
  const url = new URL(urlString);
  const hostname = url.hostname.replace(/^www\./, "");

  if (env.SEARCH_DOMAIN_DENYLIST.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    return false;
  }

  if (!env.SEARCH_DOMAIN_ALLOWLIST.length) {
    return true;
  }

  return env.SEARCH_DOMAIN_ALLOWLIST.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

export async function fetchWebPage(url: string, env: AppEnv) {
  if (!isAllowedDomain(url, env)) {
    throw new Error("Domain is not allowed");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response: Response;

  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "HoriBot/0.1 (+https://github.com/your-org/hori)"
      }
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch page: ${response.status}`);
  }

  const html = await response.text();
  const sanitized = sanitizeHtmlToText(html);

  return {
    url,
    title: normalizeWhitespace(sanitized.title || url),
    content: sanitized.content
  };
}
