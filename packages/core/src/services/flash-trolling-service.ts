/**
 * V5.1 Phase I: Flash-троллинг.
 *
 * Расписание-планировщик периодически выбирает случайное недавнее длинное
 * сообщение в разрешённом канале и реагирует одним из трёх типов:
 *  - retort   — короткая реплика-усмешка ("ну ну", "угу, конечно");
 *  - question — короткое подтверждение / вопрос ("понятненько", "что за движ");
 *  - meme     — мем из assets/memes/.
 *
 * Веса по умолчанию: 40 / 20 / 40. Все параметры настраиваются через панель.
 *
 * Этот сервис содержит чистую логику выбора. Реальный scheduler и интеграция
 * с Discord API — следующая итерация (FlashTrollingScheduler в apps/bot).
 */

export interface FlashTrollingWeights {
  retort: number;
  question: number;
  meme: number;
}

export interface FlashTrollingConfig {
  enabled: boolean;
  intervalMinutes: number;
  minMessageLength: number;
  weights: FlashTrollingWeights;
  channelAllowlist: string[];
}

export const DEFAULT_FLASH_TROLLING_CONFIG: FlashTrollingConfig = {
  enabled: false,
  intervalMinutes: 60,
  minMessageLength: 80,
  // V6 Phase G: ratio retort:question:meme = 4:1:4 (per V6 spec).
  weights: { retort: 40, question: 10, meme: 40 },
  channelAllowlist: []
};

export type FlashActionKind = "retort" | "question" | "meme";

export interface FlashAction {
  kind: FlashActionKind;
  /** Текстовая фраза для retort/question. Для meme не используется. */
  text?: string;
}

const DEFAULT_RETORTS: string[] = [
  "ну ну",
  "угу, конечно",
  "ага-ага",
  "ну да, ну да",
  "ха.",
  "ммм",
  "оу",
  "о как",
  "красава",
  "да ладно",
  "серьёзно?",
  "уверен?"
];

const DEFAULT_QUESTIONS: string[] = [
  "понятненько",
  "что за движ",
  "и чё",
  "ну и?",
  "а смысл?",
  "к чему это",
  "и что дальше",
  "ага, и?",
  "так-так",
  "интересно"
];

export interface FlashTrollingServiceOptions {
  config?: Partial<FlashTrollingConfig>;
  retorts?: string[];
  questions?: string[];
  rng?: () => number;
}

export class FlashTrollingService {
  private config: FlashTrollingConfig;
  private retorts: string[];
  private questions: string[];
  private readonly rng: () => number;
  private lastRetort: string | null = null;
  private lastQuestion: string | null = null;

  constructor(options: FlashTrollingServiceOptions = {}) {
    this.config = { ...DEFAULT_FLASH_TROLLING_CONFIG, ...options.config };
    this.retorts = options.retorts ?? DEFAULT_RETORTS;
    this.questions = options.questions ?? DEFAULT_QUESTIONS;
    this.rng = options.rng ?? Math.random;
  }

  getConfig(): FlashTrollingConfig {
    return { ...this.config, weights: { ...this.config.weights }, channelAllowlist: [...this.config.channelAllowlist] };
  }

  updateConfig(patch: Partial<FlashTrollingConfig>): void {
    this.config = { ...this.config, ...patch };
    if (patch.weights) {
      this.config.weights = { ...this.config.weights, ...patch.weights };
    }
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  isChannelAllowed(channelId: string): boolean {
    if (!this.config.channelAllowlist.length) return true;
    return this.config.channelAllowlist.includes(channelId);
  }

  isMessageEligible(content: string): boolean {
    return typeof content === "string" && content.trim().length >= this.config.minMessageLength;
  }

  /**
   * Выбирает действие согласно весам. Если все веса 0, fallback retort.
   */
  pickAction(): FlashAction {
    const { retort, question, meme } = this.config.weights;
    const total = Math.max(0, retort) + Math.max(0, question) + Math.max(0, meme);
    if (total <= 0) {
      return { kind: "retort", text: this.pickRetort() };
    }
    const roll = this.rng() * total;
    if (roll < Math.max(0, retort)) {
      return { kind: "retort", text: this.pickRetort() };
    }
    if (roll < Math.max(0, retort) + Math.max(0, question)) {
      return { kind: "question", text: this.pickQuestion() };
    }
    return { kind: "meme" };
  }

  private pickRetort(): string {
    return this.pickFromPool(this.retorts, () => this.lastRetort, (val) => { this.lastRetort = val; });
  }

  private pickQuestion(): string {
    return this.pickFromPool(this.questions, () => this.lastQuestion, (val) => { this.lastQuestion = val; });
  }

  private pickFromPool(pool: string[], getLast: () => string | null, setLast: (v: string) => void): string {
    if (pool.length === 0) return "";
    if (pool.length === 1) {
      setLast(pool[0]);
      return pool[0];
    }
    const last = getLast();
    const candidates = last ? pool.filter((p) => p !== last) : pool;
    const list = candidates.length ? candidates : pool;
    const idx = Math.floor(this.rng() * list.length) % list.length;
    const chosen = list[idx];
    setLast(chosen);
    return chosen;
  }
}
