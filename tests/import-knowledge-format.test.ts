import { describe, expect, it } from "vitest";

import { parseKnowledgeImportDocument } from "../scripts/import-knowledge-format";

describe("parseKnowledgeImportDocument", () => {
  it("falls back to the filename title when there is no frontmatter", () => {
    const parsed = parseKnowledgeImportDocument("# Domain Expansion\n\nShort answer.", "mechanics/domain-expansion");

    expect(parsed.title).toBe("mechanics/domain-expansion");
    expect(parsed.sourceUrl).toBeNull();
    expect(parsed.content).toBe("# Domain Expansion\n\nShort answer.");
  });

  it("parses scalar frontmatter and prepends searchable metadata lines", () => {
    const parsed = parseKnowledgeImportDocument(
      [
        "---",
        "title: Domain Expansion",
        "sourceUrl: https://example.com/wiki/domain-expansion",
        "category: mechanics",
        "keywords: domain expansion, domain, de",
        "---",
        "# Domain Expansion",
        "",
        "Short answer."
      ].join("\n"),
      "fallback-title"
    );

    expect(parsed.title).toBe("Domain Expansion");
    expect(parsed.sourceUrl).toBe("https://example.com/wiki/domain-expansion");
    expect(parsed.content).toContain("Category: mechanics");
    expect(parsed.content).toContain("Keywords: domain expansion, domain, de");
    expect(parsed.content).toContain("Source: https://example.com/wiki/domain-expansion");
    expect(parsed.content).toContain("# Domain Expansion");
  });

  it("parses yaml-style lists for aliases and keywords", () => {
    const parsed = parseKnowledgeImportDocument(
      [
        "---",
        "aliases:",
        "  - DE",
        "  - domain",
        "keywords:",
        "  - sure-hit",
        "  - barrier",
        "---",
        "Body"
      ].join("\n"),
      "fallback-title"
    );

    expect(parsed.frontmatter.aliases).toEqual(["DE", "domain"]);
    expect(parsed.frontmatter.keywords).toEqual(["sure-hit", "barrier"]);
    expect(parsed.content).toContain("Aliases: DE, domain");
    expect(parsed.content).toContain("Keywords: sure-hit, barrier");
  });

  it("treats unclosed frontmatter as plain text", () => {
    const raw = ["---", "title: Broken", "Body without closing marker"].join("\n");
    const parsed = parseKnowledgeImportDocument(raw, "fallback-title");

    expect(parsed.title).toBe("fallback-title");
    expect(parsed.content).toBe(raw.trim());
  });
});