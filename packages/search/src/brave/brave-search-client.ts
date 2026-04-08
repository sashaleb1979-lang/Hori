import type { AppEnv } from "@hori/config";
import type { AppLogger, SearchHit } from "@hori/shared";
import { searchRequestsCounter } from "@hori/shared";

import { SearchCacheService } from "../cache/search-cache-service";

interface BraveWebResult {
  title: string;
  url: string;
  description?: string;
  page_age?: string;
}

interface BraveResponse {
  web?: {
    results?: BraveWebResult[];
  };
}

export class BraveSearchClient {
  constructor(
    private readonly env: AppEnv,
    private readonly logger: AppLogger,
    private readonly cache: SearchCacheService
  ) {}

  async search(
    query: string,
    options: {
      userId: string;
      freshness?: string;
      maxResults?: number;
      applyCooldown?: boolean;
    }
  ): Promise<SearchHit[]> {
    if (!this.env.BRAVE_SEARCH_API_KEY) {
      throw new Error("BRAVE_SEARCH_API_KEY is not configured");
    }

    const limitedResults = Math.min(options.maxResults ?? 5, this.env.SEARCH_MAX_PAGES_PER_RESPONSE);
    const cacheKey = this.cache.makeCacheKey([query, options.freshness ?? "", String(limitedResults)]);
    const cached = await this.cache.get<SearchHit[]>(cacheKey);

    if (cached) {
      return cached;
    }

    if (options.applyCooldown !== false) {
      const claimed = await this.cache.claimCooldown(options.userId, this.env.SEARCH_USER_COOLDOWN_SEC);

      if (!claimed) {
        throw new Error("Search cooldown is active for this user");
      }
    }

    const searchUrl = new URL("https://api.search.brave.com/res/v1/web/search");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("count", String(limitedResults));

    if (options.freshness) {
      searchUrl.searchParams.set("freshness", options.freshness);
    }

    const response = await this.fetchWithRetry(searchUrl);

    if (!response.ok) {
      searchRequestsCounter.inc({ status: "error" });
      throw new Error(`Brave search failed with status ${response.status}`);
    }

    const payload = (await response.json()) as BraveResponse;
    const hits: SearchHit[] = (payload.web?.results ?? []).map((result) => ({
      title: result.title,
      url: result.url,
      description: result.description ?? "",
      source: "brave",
      publishedAt: result.page_age
    }));

    await this.cache.set(cacheKey, query, "brave", hits as never, this.env.SEARCH_CACHE_TTL_SEC);
    searchRequestsCounter.inc({ status: "ok" });

    this.logger.debug({ query, count: hits.length }, "brave search completed");

    return hits;
  }

  private async fetchWithRetry(searchUrl: URL, attempts = 3) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      try {
        const response = await fetch(searchUrl, {
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            "X-Subscription-Token": this.env.BRAVE_SEARCH_API_KEY!
          }
        });

        if (response.ok || response.status < 500) {
          return response;
        }

        lastError = new Error(`Brave search failed with status ${response.status}`);
      } catch (error) {
        lastError = error;
        this.logger.warn({ attempt, error }, "brave search request failed");
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Brave search request failed");
  }
}
