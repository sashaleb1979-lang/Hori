export function parseCsv(input?: string | null): string[] {
  if (!input) {
    return [];
  }

  return input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function estimateTokenCount(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

export function normalizeWhitespace(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

export function floorUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function incrementHourHistogram(existing: unknown, hour: number): Record<string, number> {
  const histogram = typeof existing === "object" && existing ? { ...(existing as Record<string, number>) } : {};
  histogram[String(hour)] = (histogram[String(hour)] ?? 0) + 1;
  return histogram;
}

export function updateTopSnapshot(
  snapshot: unknown,
  key: string,
  delta = 1,
  limit = 5
): Array<{ key: string; count: number }> {
  const current = Array.isArray(snapshot) ? (snapshot as Array<{ key: string; count: number }>) : [];
  const nextMap = new Map<string, number>();

  for (const item of current) {
    nextMap.set(item.key, item.count);
  }

  nextMap.set(key, (nextMap.get(key) ?? 0) + delta);

  return [...nextMap.entries()]
    .map(([entryKey, count]) => ({ key: entryKey, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, limit);
}

export function splitLongMessage(text: string, limit = 1900): string[] {
  if (text.length <= limit) {
    return [text];
  }

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > limit) {
    const slice = remaining.slice(0, limit);
    const breakPoint = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
    const end = breakPoint > 300 ? breakPoint : limit;
    parts.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }

  if (remaining.length) {
    parts.push(remaining);
  }

  return parts;
}

export function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

export function buildMemoryKey(input: string, maxLength = 48): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, maxLength);
}
