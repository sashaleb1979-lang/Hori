export interface KnowledgeImportFrontmatter {
  title?: string;
  sourceUrl?: string;
  category?: string;
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

const LIST_KEYS = new Set<keyof KnowledgeImportFrontmatter>(["aliases", "keywords"]);
const SCALAR_KEYS = new Set<keyof KnowledgeImportFrontmatter>(["title", "sourceUrl", "category"]);

export function parseKnowledgeImportDocument(raw: string, fallbackTitle: string): ParsedKnowledgeImportDocument {
  const normalized = raw.replace(/\r\n/g, "\n");
  const extracted = extractFrontmatter(normalized);
  const frontmatter = extracted.frontmatter;
  const body = extracted.body.trim();
  const title = (frontmatter.title?.trim() || fallbackTitle).trim();
  const sourceUrl = frontmatter.sourceUrl?.trim() || null;

  return {
    title,
    sourceUrl,
    body,
    frontmatter,
    content: buildImportContent(body, frontmatter)
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

function buildImportContent(body: string, frontmatter: KnowledgeImportFrontmatter): string {
  const metadataLines = [
    frontmatter.category ? `Category: ${frontmatter.category}` : null,
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