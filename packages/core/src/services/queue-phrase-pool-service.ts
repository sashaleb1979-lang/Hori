/**
 * V5.1 Phase H: пулы фраз для reply queue.
 *
 * 6 пулов, выбираемых по уровню отношений и стадии (initial/followup):
 *  - initial_warm   — пользователь с уровнем 1..4 в первый раз попал в очередь.
 *  - initial_neutral — уровень 0.
 *  - initial_cold   — уровень -1.
 *  - followup_warm  — пользователь с уровнем 1..4 продолжает писать в очереди.
 *  - followup_neutral — уровень 0.
 *  - followup_cold  — уровень -1.
 *
 * Анти-повтор: процесс хранит in-memory mapping (guildId+userId) → последняя
 * использованная фраза, и pick исключает её из выбора.
 *
 * Пулы пока зашиты в код. Редактирование из панели — отдельная итерация.
 */

export type QueuePhraseStage = "initial" | "followup";
export type QueuePhraseBucket = "warm" | "neutral" | "cold";

const DEFAULT_POOLS: Record<QueuePhraseStage, Record<QueuePhraseBucket, string[]>> = {
  initial: {
    warm: [
      "Секунду, я ещё прошлое дожую — и к тебе.",
      "Ща доделаю и отвечу, не убегай.",
      "Слышу-слышу, дай минуту.",
      "Ага, заметила. Подожди чуть.",
      "Окей, я тебя услышала, секунду.",
      "Ща, дай выдохнуть, потом отвечу.",
      "Видела. Минутку.",
      "Сейчас руки освободятся — отвечу.",
      "Ага, поняла. Не убегай, скоро.",
      "Ща-ща, доделаю и к тебе.",
      "Секундочка, я не игнорю.",
      "Дай чуть-чуть времени, я не пропала."
    ],
    neutral: [
      "Подожди чуть, я занята.",
      "Ща, не сразу.",
      "Сейчас не могу, попозже.",
      "Минутку.",
      "Заметила, отвечу.",
      "Ща, дай время.",
      "В очереди ты, не паникуй.",
      "Окей, поняла. Жди."
    ],
    cold: [
      "Жди.",
      "Сейчас не до тебя.",
      "Ща, занята.",
      "Подожди.",
      "Не сразу.",
      "В очереди."
    ]
  },
  followup: {
    warm: [
      "Я слышу, не дёргай каждые две секунды.",
      "Ну я же сказала — щас отвечу.",
      "Слушай, хватит спамить, в очереди ты.",
      "Подожди, я не телепорт.",
      "Окей, заметила, заметила, успокойся.",
      "Слышу. Жду пока освободятся руки.",
      "Не торопи, дай дойти.",
      "Ну блин, дай минуту.",
      "Я в курсе что ты ждёшь, спасибо."
    ],
    neutral: [
      "Я уже сказала — жди.",
      "Спам не ускорит.",
      "Подожди ещё.",
      "В очереди ты, я помню.",
      "Не дёргай.",
      "Я не пропала."
    ],
    cold: [
      "Жди и не дёргай.",
      "Я сказала жди.",
      "Спам не помогает.",
      "В очереди.",
      "Подожди молча."
    ]
  }
};

interface AntiRepeatKey {
  guildId: string;
  userId: string;
  stage: QueuePhraseStage;
  bucket: QueuePhraseBucket;
}

function bucketFromScore(score: number | null | undefined): QueuePhraseBucket {
  if (typeof score !== "number") return "neutral";
  if (score < 0) return "cold";
  if (score >= 1) return "warm";
  return "neutral";
}

function keyOf(input: AntiRepeatKey): string {
  return `${input.guildId}:${input.userId}:${input.stage}:${input.bucket}`;
}

export class QueuePhrasePoolService {
  private readonly lastUsed = new Map<string, string>();

  constructor(
    private readonly pools: Record<QueuePhraseStage, Record<QueuePhraseBucket, string[]>> = DEFAULT_POOLS
  ) {}

  /**
   * Выбрать фразу из пула. score — текущий relationship.relationshipScore (-1..4).
   * Возвращает фразу, гарантированно отличную от последней использованной
   * для этой пары (guildId, userId, stage, bucket), если в пуле есть >1 фразы.
   */
  pickPhrase(input: {
    guildId: string;
    userId: string;
    score: number | null | undefined;
    stage: QueuePhraseStage;
  }): string {
    const bucket = bucketFromScore(input.score);
    const pool = this.pools[input.stage][bucket];
    if (!pool.length) {
      return "Подожди.";
    }
    if (pool.length === 1) {
      return pool[0];
    }
    const key = keyOf({ guildId: input.guildId, userId: input.userId, stage: input.stage, bucket });
    const lastPick = this.lastUsed.get(key);
    const candidates = pool.filter((phrase) => phrase !== lastPick);
    const choice = candidates[Math.floor(Math.random() * candidates.length)];
    this.lastUsed.set(key, choice);
    return choice;
  }

  /** Очистить кэш анти-повтора (для тестов и админ-команд). */
  reset(): void {
    this.lastUsed.clear();
  }
}
