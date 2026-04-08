import type { SearchHit } from "@hori/shared";

export function buildSourceDigest(
  query: string,
  hits: SearchHit[],
  fetchedPages: Array<{ url: string; title: string; content: string }>
) {
  const lines: string[] = [`Запрос: ${query}`];

  if (hits.length) {
    lines.push("Найденные результаты:");
    for (const hit of hits) {
      lines.push(`- ${hit.title} | ${hit.url} | ${hit.description}`);
    }
  }

  if (fetchedPages.length) {
    lines.push("Содержимое страниц:");
    for (const page of fetchedPages) {
      lines.push(`URL: ${page.url}`);
      lines.push(`Title: ${page.title}`);
      lines.push(page.content.slice(0, 4000));
    }
  }

  return lines.join("\n");
}

