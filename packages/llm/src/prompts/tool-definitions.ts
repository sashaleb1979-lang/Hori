import type { OllamaToolDefinition } from "../client/ollama-client";

export const webSearchTool: OllamaToolDefinition = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the web for current information. Use for fresh facts, recent events, or source comparison.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        freshness: { type: "string" },
        maxResults: { type: "number" }
      },
      required: ["query"]
    }
  }
};

export const webFetchTool: OllamaToolDefinition = {
  type: "function",
  function: {
    name: "web_fetch",
    description: "Fetch and sanitize page content from a URL returned by search.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string" }
      },
      required: ["url"]
    }
  }
};

export const summarizeSourcesTool: OllamaToolDefinition = {
  type: "function",
  function: {
    name: "summarize_sources",
    description: "Summarize already fetched sources into a short synthesis.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        sources: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              url: { type: "string" },
              content: { type: "string" }
            },
            required: ["title", "url", "content"]
          }
        }
      },
      required: ["query", "sources"]
    }
  }
};

export const defaultToolSet = [webSearchTool, webFetchTool, summarizeSourcesTool];

