import { describe, expect, it } from "vitest";

import { MemeIndexer, type MemeCatalog, DEFAULT_FLASH_TROLLING_CONFIG, FlashTrollingService } from "@hori/core";

const sampleCatalog: MemeCatalog = {
  version: 1,
  packName: "test",
  items: [
    {
      mediaId: "1",
      type: "image",
      filePath: "assets/memes/1.jpg",
      triggerTags: ["facepalm", "strong_negative"],
      toneTags: ["strong_negative"],
      emotionTags: ["strong_negative"],
      messageKindTags: ["provocation"],
      weight: 2
    },
    {
      mediaId: "2",
      type: "image",
      filePath: "assets/memes/2.jpg",
      triggerTags: ["confusion"],
      toneTags: ["confusion"],
      emotionTags: ["confusion"],
      messageKindTags: ["info_question"],
      weight: 3
    },
    {
      mediaId: "3",
      type: "gif",
      filePath: "assets/memes/3.gif",
      triggerTags: ["confusion"],
      toneTags: ["confusion"],
      messageKindTags: ["info_question"],
      weight: 1
    }
  ]
};

describe("V6 Phase G: MemeIndexer", () => {
  it("loads catalog and reports size", () => {
    const idx = new MemeIndexer(sampleCatalog);
    expect(idx.size()).toBe(3);
  });

  it("filter narrows by triggerTag and toneTag", () => {
    const idx = new MemeIndexer(sampleCatalog);
    expect(idx.filter({ triggerTag: "facepalm" }).map((i) => i.mediaId)).toEqual(["1"]);
    expect(idx.filter({ toneTag: "confusion" }).map((i) => i.mediaId).sort()).toEqual(["2", "3"]);
  });

  it("pick respects weights (deterministic via seeded rng)", () => {
    const seq = [0, 0.5, 0.99];
    let i = 0;
    const idx = new MemeIndexer(sampleCatalog, () => seq[i++ % seq.length]);
    // confusion bucket: weights 3 + 1 = 4. roll=0*4=0 → "2"; roll=0.5*4=2 → still "2" (3-2=1>0); roll=0.99*4=3.96 → past "2" → "3".
    expect(idx.pick({ toneTag: "confusion" })?.mediaId).toBe("2");
    expect(idx.pick({ toneTag: "confusion" })?.mediaId).toBe("2");
    expect(idx.pick({ toneTag: "confusion" })?.mediaId).toBe("3");
  });

  it("pick returns null when no candidates", () => {
    const idx = new MemeIndexer(sampleCatalog);
    expect(idx.pick({ triggerTag: "no-such-tag" })).toBeNull();
  });

  it("collectTags aggregates unique tags", () => {
    const idx = new MemeIndexer(sampleCatalog);
    const tags = idx.collectTags();
    expect(tags.trigger).toContain("confusion");
    expect(tags.trigger).toContain("facepalm");
    expect(tags.tone).toContain("strong_negative");
  });
});

describe("V6 Phase G: FlashTrollingService 4:1:4 default", () => {
  it("default weights ratio is 4:1:4", () => {
    expect(DEFAULT_FLASH_TROLLING_CONFIG.weights).toEqual({ retort: 40, question: 10, meme: 40 });
  });

  it("pickAction with 4:1:4 yields correct distribution from rng", () => {
    // total = 90. retort < 40, question in [40,50), meme >= 50.
    // pickAction внутренне ещё вызывает rng для выбора текста (pool anti-repeat).
    // seq: [kind1, phrase1, kind2, phrase2, kind3].
    const seq = [0.0, 0.0, 0.5, 0.0, 0.99];
    let i = 0;
    const svc = new FlashTrollingService({ rng: () => seq[i++ % seq.length] });
    expect(svc.pickAction().kind).toBe("retort");
    expect(svc.pickAction().kind).toBe("question");
    expect(svc.pickAction().kind).toBe("meme");
  });
});
