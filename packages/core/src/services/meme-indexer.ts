/**
 * V6 Phase G: Meme indexer.
 *
 * Лёгкая обёртка над `assets/memes/catalog.json` — даёт сервисам (FlashTrolling,
 * MediaReaction) единый источник правды для выбора мемов и упрощает работу из
 * панели (количество мемов, фильтрация по tag).
 *
 * Сам файл каталога не читается из ФС здесь — конкретный loader подставляется
 * в зависимости от среды (apps/bot читает с диска, тесты — inline). Так модуль
 * остаётся изолированным от Node FS.
 */

export interface MemeCatalogItem {
  mediaId: string;
  type: string;
  filePath: string;
  triggerTags?: string[];
  toneTags?: string[];
  emotionTags?: string[];
  messageKindTags?: string[];
  weight?: number;
  cooldownSec?: number;
  minConfidence?: number;
  minIntensity?: number;
  description?: string;
}

export interface MemeCatalog {
  version: number;
  packName: string;
  items: MemeCatalogItem[];
}

export interface MemePickFilter {
  triggerTag?: string;
  toneTag?: string;
  emotionTag?: string;
  messageKindTag?: string;
}

export class MemeIndexer {
  private items: MemeCatalogItem[];
  private readonly rng: () => number;

  constructor(catalog: MemeCatalog, rng: () => number = Math.random) {
    this.items = Array.isArray(catalog?.items) ? catalog.items.slice() : [];
    this.rng = rng;
  }

  size(): number {
    return this.items.length;
  }

  all(): ReadonlyArray<MemeCatalogItem> {
    return this.items;
  }

  filter(predicate: MemePickFilter): MemeCatalogItem[] {
    return this.items.filter((item) => {
      if (predicate.triggerTag && !(item.triggerTags ?? []).includes(predicate.triggerTag)) return false;
      if (predicate.toneTag && !(item.toneTags ?? []).includes(predicate.toneTag)) return false;
      if (predicate.emotionTag && !(item.emotionTags ?? []).includes(predicate.emotionTag)) return false;
      if (predicate.messageKindTag && !(item.messageKindTags ?? []).includes(predicate.messageKindTag)) return false;
      return true;
    });
  }

  /**
   * Weighted random pick. Если фильтр не дал кандидатов — возвращает null.
   * Веса: `item.weight ?? 1` (минимум 0). Если все веса нулевые — выбирается
   * равномерно случайный.
   */
  pick(filter: MemePickFilter = {}): MemeCatalogItem | null {
    const candidates = this.filter(filter);
    if (!candidates.length) return null;
    const totalWeight = candidates.reduce((acc, item) => acc + Math.max(0, item.weight ?? 1), 0);
    if (totalWeight <= 0) {
      return candidates[Math.floor(this.rng() * candidates.length)];
    }
    let roll = this.rng() * totalWeight;
    for (const item of candidates) {
      const w = Math.max(0, item.weight ?? 1);
      if (roll < w) return item;
      roll -= w;
    }
    return candidates[candidates.length - 1];
  }

  /** Подмножество тегов, встречающихся в каталоге (для UI). */
  collectTags(): { trigger: string[]; tone: string[]; emotion: string[]; messageKind: string[] } {
    const collect = (key: keyof Pick<MemeCatalogItem, "triggerTags" | "toneTags" | "emotionTags" | "messageKindTags">) => {
      const set = new Set<string>();
      for (const item of this.items) {
        for (const tag of item[key] ?? []) set.add(tag);
      }
      return Array.from(set).sort();
    };
    return {
      trigger: collect("triggerTags"),
      tone: collect("toneTags"),
      emotion: collect("emotionTags"),
      messageKind: collect("messageKindTags")
    };
  }
}
