export interface KnowledgeImportFrontmatter {
  title?: string;
  sourceUrl?: string;
  category?: string;
  tags?: string[];
  aliases?: string[];
  keywords?: string[];
}

export interface ParsedKnowledgeImportDocument {
  title: string;
  sourceUrl: string | null;
  content: string;
  body: string;
  frontmatter: KnowledgeImportFrontmatter;
}

interface TopicMetadata {
  title: string;
  body: string;
  tags: string[];
  aliases: string[];
  keywords: string[];
  subtopics: Array<{ title: string; tags: string[] }>;
}

const LIST_KEYS = new Set<keyof KnowledgeImportFrontmatter>(["tags", "aliases", "keywords"]);
const SCALAR_KEYS = new Set<keyof KnowledgeImportFrontmatter>(["title", "sourceUrl", "category"]);

export function parseKnowledgeImportDocuments(raw: string, fallbackTitle: string): ParsedKnowledgeImportDocument[] {
  const normalized = raw.replace(/\r\n/g, "\n");
  const extracted = extractFrontmatter(normalized);
  const frontmatter = extracted.frontmatter;
  const body = extracted.body.trim();
  const sourceUrl = frontmatter.sourceUrl?.trim() || null;
  const topics = parseTopicBlocks(body);

  if (!topics.length) {
    const title = (frontmatter.title?.trim() || fallbackTitle).trim();
    return [{
      title,
      sourceUrl,
      body,
      frontmatter,
      content: buildSingleTopicContent(body, frontmatter)
    }];
  }

  const sharedContext = extractSharedContext(body);
  return topics.map((topic) => ({
    title: topic.title,
    sourceUrl,
    body: topic.body,
    frontmatter,
    content: buildTopicContent(topic, frontmatter, sharedContext)
  }));
}

export function parseKnowledgeImportDocument(raw: string, fallbackTitle: string): ParsedKnowledgeImportDocument {
  return parseKnowledgeImportDocuments(raw, fallbackTitle)[0] ?? {
    title: fallbackTitle,
    sourceUrl: null,
    body: "",
    frontmatter: {},
    content: ""
  };
}

function extractFrontmatter(raw: string): { frontmatter: KnowledgeImportFrontmatter; body: string } {
  if (!raw.startsWith("---\n")) {
    return { frontmatter: {}, body: raw };
  }

  const closingIndex = raw.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return { frontmatter: {}, body: raw };
  }

  const frontmatterBlock = raw.slice(4, closingIndex);
  const body = raw.slice(closingIndex + 5);
  return {
    frontmatter: parseFrontmatterBlock(frontmatterBlock),
    body
  };
}

function parseFrontmatterBlock(block: string): KnowledgeImportFrontmatter {
  const frontmatter: KnowledgeImportFrontmatter = {};
  let activeListKey: keyof KnowledgeImportFrontmatter | null = null;

  for (const rawLine of block.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const listMatch = /^-\s+(.+)$/.exec(trimmed);
    if (listMatch && activeListKey && LIST_KEYS.has(activeListKey)) {
      const items = ensureList(frontmatter, activeListKey);
      items.push(listMatch[1].trim());
      continue;
    }

    activeListKey = null;

    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim() as keyof KnowledgeImportFrontmatter;
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (LIST_KEYS.has(key)) {
      if (!value) {
        activeListKey = key;
        ensureList(frontmatter, key);
        continue;
      }

      const items = ensureList(frontmatter, key);
      items.push(...parseListValue(value));
      continue;
    }

    if (SCALAR_KEYS.has(key)) {
      frontmatter[key] = stripOptionalQuotes(value) as never;
    }
  }

  return frontmatter;
}

function ensureList(
  frontmatter: KnowledgeImportFrontmatter,
  key: keyof KnowledgeImportFrontmatter
): string[] {
  const existing = frontmatter[key];
  if (Array.isArray(existing)) {
    return existing;
  }

  const created: string[] = [];
  frontmatter[key] = created as never;
  return created;
}

function parseListValue(raw: string): string[] {
  const unwrapped = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
  return unwrapped
    .split(",")
    .map((item) => stripOptionalQuotes(item.trim()))
    .filter(Boolean);
}

function stripOptionalQuotes(value: string): string {
  return value.replace(/^['\"]|['\"]$/g, "").trim();
}

function buildSingleTopicContent(body: string, frontmatter: KnowledgeImportFrontmatter): string {
  const metadataLines = [
    frontmatter.category ? `Category: ${frontmatter.category}` : null,
    frontmatter.tags?.length ? `Tags: ${frontmatter.tags.join(", ")}` : null,
    frontmatter.aliases?.length ? `Aliases: ${frontmatter.aliases.join(", ")}` : null,
    frontmatter.keywords?.length ? `Keywords: ${frontmatter.keywords.join(", ")}` : null,
    frontmatter.sourceUrl ? `Source: ${frontmatter.sourceUrl}` : null
  ].filter((line): line is string => Boolean(line));

  if (!metadataLines.length) {
    return body;
  }

  const trimmedBody = body.trim();
  if (!trimmedBody) {
    return metadataLines.join("\n");
  }

  return `${metadataLines.join("\n")}\n\n${trimmedBody}`;
}

function buildTopicContent(topic: TopicMetadata, frontmatter: KnowledgeImportFrontmatter, sharedContext: string): string {
  const metadataLines = [
    frontmatter.title ? `Page title: ${frontmatter.title}` : null,
    frontmatter.category ? `Category: ${frontmatter.category}` : null,
    frontmatter.tags?.length ? `Page tags: ${frontmatter.tags.join(", ")}` : null,
    frontmatter.aliases?.length ? `Page aliases: ${frontmatter.aliases.join(", ")}` : null,
    frontmatter.keywords?.length ? `Page keywords: ${frontmatter.keywords.join(", ")}` : null,
    topic.tags.length ? `Topic tags: ${topic.tags.join(", ")}` : null,
    topic.aliases.length ? `Topic aliases: ${topic.aliases.join(", ")}` : null,
    topic.keywords.length ? `Topic keywords: ${topic.keywords.join(", ")}` : null,
    topic.subtopics.length ? `Subtopics: ${topic.subtopics.map((subtopic) => subtopic.title).join("; ")}` : null,
    topic.subtopics.some((subtopic) => subtopic.tags.length > 0)
      ? `Subtopic tags: ${topic.subtopics.filter((subtopic) => subtopic.tags.length > 0).map((subtopic) => `${subtopic.title} => ${subtopic.tags.join(", ")}`).join("; ")}`
      : null,
    frontmatter.sourceUrl ? `Source: ${frontmatter.sourceUrl}` : null
  ].filter((line): line is string => Boolean(line));

  const parts = [
    metadataLines.join("\n"),
    sharedContext ? `## Shared context\n\n${sharedContext}` : null,
    topic.body.trim()
  ].filter((part): part is string => Boolean(part && part.trim()));

  return parts.join("\n\n");
}

function extractSharedContext(body: string): string {
  const firstTopicIndex = body.search(/^# Topic:/m);
  if (firstTopicIndex <= 0) {
    return "";
  }

  return body.slice(0, firstTopicIndex).trim();
}

function parseTopicBlocks(body: string): TopicMetadata[] {
  const matches = Array.from(body.matchAll(/^# Topic:\s*(.+)$/gm));
  if (!matches.length) {
    return [];
  }

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? body.length;
    const block = body.slice(start, end).trim();
    return parseTopicBlock(block);
  });
}

function parseTopicBlock(block: string): TopicMetadata {
  const lines = block.split("\n");
  const titleLine = lines.shift() ?? "# Topic: Untitled";
  const title = titleLine.replace(/^# Topic:\s*/i, "").trim() || "Untitled";

  const tags: string[] = [];
  const aliases: string[] = [];
  const keywords: string[] = [];
  let bodyStartIndex = 0;

  while (bodyStartIndex < lines.length) {
    const line = lines[bodyStartIndex]?.trim() ?? "";
    if (!line) {
      bodyStartIndex += 1;
      break;
    }

    const parsed = parseInlineMetadataLine(line);
    if (!parsed) {
      break;
    }

    if (parsed.key === "tags") tags.push(...parsed.values);
    if (parsed.key === "aliases") aliases.push(...parsed.values);
    if (parsed.key === "keywords") keywords.push(...parsed.values);
    bodyStartIndex += 1;
  }

  const body = lines.slice(bodyStartIndex).join("\n").trim();
  return {
    title,
    body,
    tags: uniqueStrings(tags),
    aliases: uniqueStrings(aliases),
    keywords: uniqueStrings(keywords),
    subtopics: parseSubtopics(body)
  };
}

function parseSubtopics(body: string): Array<{ title: string; tags: string[] }> {
  const matches = Array.from(body.matchAll(/^## Subtopic:\s*(.+)$/gm));
  if (!matches.length) {
    return [];
  }

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? body.length;
    const block = body.slice(start, end).trim();
    const lines = block.split("\n");
    const title = (lines.shift() ?? "").replace(/^## Subtopic:\s*/i, "").trim() || "Untitled subtopic";
    const tags: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const parsed = parseInlineMetadataLine(line);
      if (!parsed) break;
      if (parsed.key === "tags" || parsed.key === "keywords") {
        tags.push(...parsed.values);
      }
    }

    return {
      title,
      tags: uniqueStrings(tags)
    };
  });
}

function parseInlineMetadataLine(line: string): { key: "tags" | "aliases" | "keywords"; values: string[] } | null {
  const match = /^(Tags|Aliases|Keywords):\s*(.+)$/i.exec(line);
  if (!match) {
    return null;
  }

  const rawKey = match[1].toLowerCase();
  const key = rawKey === "tags" ? "tags" : rawKey === "aliases" ? "aliases" : "keywords";
  return {
    key,
    values: parseListValue(match[2])
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}