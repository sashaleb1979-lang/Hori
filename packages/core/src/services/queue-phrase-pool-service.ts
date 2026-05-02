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

export type QueuePhrasePools = Record<QueuePhraseStage, Record<QueuePhraseBucket, string[]>>;

export const DEFAULT_QUEUE_PHRASE_POOLS: QueuePhrasePools = {
  initial: {
    // V6 Item 16: ~50 фраз для тёплого/обычного отношения.
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
      "Дай чуть-чуть времени, я не пропала.",
      "Запомнила, отвечу как смогу.",
      "Ща, дай дочитать.",
      "Потерпи минутку, я тут.",
      "Ага, увидела сообщение. Скоро.",
      "Не пропадаю, просто другой разговор дожимаю.",
      "Ща доразберусь и к тебе.",
      "Окей, в очереди, держись.",
      "Дай минутку, не убегу.",
      "Поняла, чуть позже.",
      "Я в курсе, скоро отвечу.",
      "Ща, не бросаю.",
      "Сейчас. Серьёзно, секунду.",
      "Ага. Чуть-чуть подожди.",
      "Слышу, скоро вернусь.",
      "Дай мне секунду собраться.",
      "Ща, я тут просто параллельно занята.",
      "Ага, отвечу как разберусь.",
      "Подожди, не игнорю.",
      "Ща дойду до тебя.",
      "Секунду, держись.",
      "Я скоро. Честно.",
      "Дай дочитать предыдущее.",
      "Ага, на очереди.",
      "Ща, спокойно.",
      "Видела, отвечу.",
      "Чуть-чуть подожди, не убегу.",
      "Минутку, я не телепорт.",
      "Слышу. Жди немного.",
      "Ща, я тут.",
      "Ага, не пропустила.",
      "Дай освободиться и отвечу.",
      "Окей, понятно. Скоро.",
      "Ща, потерпи.",
      "Я почти.",
      "Спокойно, отвечу.",
      "Жди, скоро вернусь.",
      "Поняла, не убегу.",
      "Ща, минута."
    ],
    // V6 Item 16: ~20 фраз для нейтрального.
    neutral: [
      "Подожди чуть, я занята.",
      "Ща, не сразу.",
      "Сейчас не могу, попозже.",
      "Минутку.",
      "Заметила, отвечу.",
      "Ща, дай время.",
      "В очереди ты, не паникуй.",
      "Окей, поняла. Жди.",
      "Подожди, не разорвусь.",
      "Не сразу, дай минуту.",
      "В курсе, отвечу.",
      "Ща доберусь.",
      "Подожди немного.",
      "Поняла, чуть позже.",
      "Не пропускаю, в очереди.",
      "Ща, дойдёт черёд.",
      "Окей, скоро.",
      "Минута.",
      "Жди немного.",
      "Не сразу. Попозже."
    ],
    // V6 Item 16: ~10 фраз для холодного/грубого.
    cold: [
      "Жди.",
      "Сейчас не до тебя.",
      "Ща, занята.",
      "Подожди.",
      "Не сразу.",
      "В очереди.",
      "Не дёргай.",
      "Позже.",
      "Помолчи минуту.",
      "Сама подойду."
    ]
  },
  followup: {
    // V6 Item 16: ~30 follow-up для тёплого.
    warm: [
      "Я слышу, не дёргай каждые две секунды.",
      "Ну я же сказала — щас отвечу.",
      "Слушай, хватит спамить, в очереди ты.",
      "Подожди, я не телепорт.",
      "Окей, заметила, заметила, успокойся.",
      "Слышу. Жду пока освободятся руки.",
      "Не торопи, дай дойти.",
      "Ну блин, дай минуту.",
      "Я в курсе что ты ждёшь, спасибо.",
      "Ну вот опять. Я не пропала.",
      "Чуть-чуть терпения.",
      "Ага, помню про тебя.",
      "Слышу с первого раза.",
      "Дай дойти, я тут.",
      "Ну подожди ты.",
      "Ага, в очереди ты, в очереди.",
      "Я не убежала, успокойся.",
      "Серьёзно, минутку.",
      "Я тут, не пропадаю.",
      "Дай мне доделать, потом отвечу.",
      "Ну ща, ну ща.",
      "Не подгоняй, помню про тебя.",
      "Ага, не глухая.",
      "Я слышу-слышу, ща.",
      "Не нужно повторять, я в курсе.",
      "Ща дойду до тебя, не паникуй.",
      "Заметила в первый раз. Жди.",
      "Окей, я в очереди тебя держу.",
      "Не убегаю, доделываю.",
      "Я не молчу, я просто занята."
    ],
    // 30 нейтральных follow-up — универсальные, без имён, по отношению.
    neutral: [
      "Я уже сказала — жди.",
      "Спам не ускорит.",
      "Подожди ещё.",
      "В очереди, я помню.",
      "Не дёргай.",
      "Я не пропала.",
      "Сказала же — потом.",
      "Не торопи.",
      "Подожди молча.",
      "Не повторяй.",
      "Ща дойду.",
      "Я слышу, не глухая.",
      "Помню про тебя.",
      "Жди ещё.",
      "Не паникуй.",
      "Одно сообщение достаточно.",
      "В курсе, отвечу.",
      "Терпение.",
      "Секунду.",
      "Ещё минута.",
      "Подожди немного.",
      "Я не забыла.",
      "Очередь движется.",
      "Ага, слышу.",
      "Жди, без спама.",
      "Ещё чуть-чуть.",
      "Занята, скоро.",
      "Видела сообщение.",
      "Дай закончить.",
      "Скоро отвечу."
    ],
    // 30 холодных follow-up — сухие, по отношению cold_lowest.
    cold: [
      "Жди и не дёргай.",
      "Я сказала жди.",
      "Спам не помогает.",
      "В очереди.",
      "Подожди молча.",
      "Не доставай.",
      "Молча жди.",
      "Хватит.",
      "Сказала — жди.",
      "Не надо повторять.",
      "Ещё раз — жди.",
      "Молчи.",
      "Не торопи меня.",
      "Потом.",
      "Позже.",
      "Не дёргай.",
      "Я помню без напоминаний.",
      "Тихо.",
      "Жди.",
      "Хватит писать.",
      "Одно — и всё.",
      "Терпи.",
      "Видела.",
      "Не мешай.",
      "Знаю.",
      "Стоп.",
      "Отстань на минуту.",
      "Слышу.",
      "Не надо.",
      "Молчи и жди."
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
  private pools: QueuePhrasePools;

  constructor(pools: QueuePhrasePools = DEFAULT_QUEUE_PHRASE_POOLS) {
    this.pools = pools;
  }

  /** V6 Phase F: panel-tunable. Подменить пулы (частично — мерджит с текущими). */
  setPools(overrides: Partial<{ [S in QueuePhraseStage]: Partial<Record<QueuePhraseBucket, string[]>> }>): void {
    const next: QueuePhrasePools = {
      initial: { ...this.pools.initial },
      followup: { ...this.pools.followup }
    };
    for (const stage of ["initial", "followup"] as const) {
      const stageOverride = overrides[stage];
      if (!stageOverride) continue;
      for (const bucket of ["warm", "neutral", "cold"] as const) {
        const list = stageOverride[bucket];
        if (Array.isArray(list) && list.length) {
          next[stage][bucket] = list.filter((p) => typeof p === "string" && p.trim().length > 0);
        }
      }
    }
    this.pools = next;
    this.lastUsed.clear();
  }

  getPools(): QueuePhrasePools {
    return {
      initial: { ...this.pools.initial },
      followup: { ...this.pools.followup }
    };
  }

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
    const stage = this.pools[input.stage];
    const pool = stage[bucket];
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
