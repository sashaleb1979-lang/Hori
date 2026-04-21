import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry });

export const inboundMessagesCounter = new Counter({
  name: "hori_inbound_messages_total",
  help: "Total inbound guild messages ingested",
  registers: [metricsRegistry]
});

export const botRepliesCounter = new Counter({
  name: "hori_bot_replies_total",
  help: "Total bot replies sent",
  labelNames: ["intent"],
  registers: [metricsRegistry]
});

export const botLatencyHistogram = new Histogram({
  name: "hori_bot_reply_latency_ms",
  help: "Latency for end-to-end bot responses",
  labelNames: ["intent"],
  buckets: [50, 100, 200, 400, 800, 1500, 3000, 5000, 10000],
  registers: [metricsRegistry]
});

export const searchRequestsCounter = new Counter({
  name: "hori_search_requests_total",
  help: "Brave search requests made by the bot",
  labelNames: ["status"],
  registers: [metricsRegistry]
});

export const llmTokensCounter = new Counter({
  name: "hori_llm_tokens_total",
  help: "Total LLM tokens consumed",
  labelNames: ["model", "type"],
  registers: [metricsRegistry]
});

export const llmCachedTokensCounter = new Counter({
  name: "hori_llm_cached_tokens_total",
  help: "Total LLM prompt tokens served from provider cache",
  labelNames: ["model"],
  registers: [metricsRegistry]
});

export const llmCostCounter = new Counter({
  name: "hori_llm_cost_usd_total",
  help: "Cumulative LLM cost in USD",
  labelNames: ["model"],
  registers: [metricsRegistry]
});

export const llmRetriesCounter = new Counter({
  name: "hori_llm_retries_total",
  help: "Total LLM API retries",
  labelNames: ["reason"],
  registers: [metricsRegistry]
});

