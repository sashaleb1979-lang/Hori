import * as cheerio from "cheerio";

import { normalizeWhitespace } from "@hori/shared";

export function sanitizeHtmlToText(html: string, maxChars = 10000) {
  const $ = cheerio.load(html);

  $("script,style,noscript,svg,img,iframe").remove();

  const title = normalizeWhitespace($("title").first().text());
  const bodyText = normalizeWhitespace($("body").text());
  const content = bodyText.slice(0, maxChars);

  return {
    title,
    content
  };
}

