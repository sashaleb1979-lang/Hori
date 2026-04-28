import { describe, expect, it } from "vitest";

import { parseKnowledgeImportDocument, parseKnowledgeImportDocuments } from "../scripts/import-knowledge-format";

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

  it("splits a mixed file into multiple topic articles with shared and nested tags", () => {
    const parsed = parseKnowledgeImportDocuments(
      [
        "---",
        "title: Mixed JJS Notes",
        "sourceUrl: https://example.com/wiki/mixed-jjs-notes",
        "category: mechanics",
        "tags:",
        "  - jjs",
        "  - systems",
        "keywords:",
        "  - джжс",
        "  - jujutsu shurigan",
        "---",
        "Общий контекст страницы.",
        "",
        "# Topic: Domain Expansion",
        "Tags: домен, domain expansion, де",
        "Aliases: domain, expansion",
        "Keywords: sure-hit, barrier",
        "",
        "Краткая мысль про домен.",
        "",
        "## Subtopic: Activation",
        "Tags: активация, старт, запуск",
        "",
        "Подробности активации.",
        "",
        "## Subtopic: Counterplay",
        "Tags: контрплей, антидомен",
        "",
        "Подробности контрплея.",
        "",
        "# Topic: Black Flash",
        "Tags: black flash, блек флеш",
        "",
        "Краткая мысль про black flash."
      ].join("\n"),
      "fallback-title"
    );

    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.title).toBe("Domain Expansion");
    expect(parsed[0]?.sourceUrl).toBe("https://example.com/wiki/mixed-jjs-notes");
    expect(parsed[0]?.content).toContain("Page tags: jjs, systems");
    expect(parsed[0]?.content).toContain("Topic tags: домен, domain expansion, де");
    expect(parsed[0]?.content).toContain("Topic aliases: domain, expansion");
    expect(parsed[0]?.content).toContain("Topic keywords: sure-hit, barrier");
    expect(parsed[0]?.content).toContain("Subtopics: Activation; Counterplay");
    expect(parsed[0]?.content).toContain("Subtopic tags: Activation => активация, старт, запуск; Counterplay => контрплей, антидомен");
    expect(parsed[0]?.content).toContain("## Shared context");
    expect(parsed[0]?.content).toContain("Общий контекст страницы.");
    expect(parsed[1]?.title).toBe("Black Flash");
    expect(parsed[1]?.content).toContain("Page keywords: джжс, jujutsu shurigan");
    expect(parsed[1]?.content).toContain("Topic tags: black flash, блек флеш");
  });
});