import { describe, expect, it, vi } from "vitest";

import {
  chunkText,
  KnowledgeService,
  type KnowledgeServiceDeps
} from "../packages/core/src/services/knowledge-service";

describe("chunkText", () => {
  it("returns the whole text as a single chunk when small", () => {
    const out = chunkText("привет мир");
    expect(out).toEqual(["привет мир"]);
  });

  it("splits long content on paragraph boundaries", () => {
    const para = "x".repeat(800);
    const text = `${para}\n\n${para}\n\n${para}`;
    const out = chunkText(text, 1000, 100);
    expect(out.length).toBeGreaterThan(1);
    for (const chunk of out) {
      expect(chunk.length).toBeLessThanOrEqual(1100);
    }
  });

  it("handles a single oversized paragraph by length-splitting with overlap", () => {
    const text = "a".repeat(3000);
    const out = chunkText(text, 1000, 200);
    expect(out.length).toBe(4);
    expect(out[0].slice(-200)).toBe(out[1].slice(0, 200));
  });
});

function makePrismaStub(rows: { knowledgeCluster: unknown }) {
  return {
    knowledgeCluster: {
      findFirst: vi.fn().mockResolvedValue(rows.knowledgeCluster),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    knowledgeArticle: { upsert: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
    knowledgeChunk: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn()
    },
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0)
  } as unknown as KnowledgeServiceDeps["prisma"];
}

describe("KnowledgeService.matchTrigger", () => {
  const baseRow = {
    id: "c1",
    guildId: "g1",
    code: "jjs",
    title: "JJS Wiki",
    description: null,
    trigger: "?",
    enabled: true,
    answerModel: null,
    embedModel: null,
    dimensions: 768
  };

  function makeService(row: unknown) {
    const prisma = makePrismaStub({ knowledgeCluster: row });
    const service = new KnowledgeService({
      prisma,
      logger: undefined,
      defaultAnswerModel: "gpt-5-nano",
      embed: vi.fn(),
      chat: vi.fn()
    });
    return { service, prisma };
  }

  it("matches a configured trigger and extracts the question", async () => {
    const { service } = makeService(baseRow);
    const match = await service.matchTrigger("g1", "?как работает комбо");
    expect(match?.cluster.code).toBe("jjs");
    expect(match?.question).toBe("как работает комбо");
  });

  it("ignores letters/numbers as triggers", async () => {
    const { service, prisma } = makeService(baseRow);
    const match = await service.matchTrigger("g1", "привет");
    expect(match).toBeNull();
    expect(prisma.knowledgeCluster.findFirst).not.toHaveBeenCalled();
  });

  it("returns null when no cluster has the trigger", async () => {
    const { service } = makeService(null);
    const match = await service.matchTrigger("g1", "$что это");
    expect(match).toBeNull();
  });

  it("trims leading whitespace before extracting trigger", async () => {
    const { service } = makeService(baseRow);
    const match = await service.matchTrigger("g1", "   ?домены");
    expect(match?.question).toBe("домены");
  });
});

describe("KnowledgeService cluster trigger guards", () => {
  const baseRow = {
    id: "c1",
    guildId: "g1",
    code: "jjs",
    title: "JJS Wiki",
    description: null,
    trigger: "?",
    enabled: true,
    answerModel: null,
    embedModel: null,
    dimensions: 768
  };

  it("rejects createCluster when another enabled cluster already uses the trigger", async () => {
    const prisma = makePrismaStub({ knowledgeCluster: { id: "c2", code: "other", title: "Other" } });
    const service = new KnowledgeService({
      prisma,
      logger: undefined,
      defaultAnswerModel: "gpt-5-nano",
      embed: vi.fn(),
      chat: vi.fn()
    });

    await expect(service.createCluster({ guildId: "g1", code: "new", title: "New", trigger: "?" }))
      .rejects.toThrow(/already used by cluster "other"/i);
    expect(prisma.knowledgeCluster.create).not.toHaveBeenCalled();
  });

  it("rejects updateCluster when enabling a trigger that is already owned by another enabled cluster", async () => {
    const prisma = makePrismaStub({ knowledgeCluster: { id: "c2", code: "other", title: "Other" } });
    (prisma.knowledgeCluster.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(baseRow);

    const service = new KnowledgeService({
      prisma,
      logger: undefined,
      defaultAnswerModel: "gpt-5-nano",
      embed: vi.fn(),
      chat: vi.fn()
    });

    await expect(service.updateCluster("g1", "jjs", { trigger: "$" }))
      .rejects.toThrow(/already used by cluster "other"/i);
    expect(prisma.knowledgeCluster.update).not.toHaveBeenCalled();
  });
});

describe("KnowledgeService.answer", () => {
  const cluster = {
    id: "c1",
    guildId: "g1",
    code: "jjs",
    title: "JJS Wiki",
    description: null,
    trigger: "?",
    enabled: true,
    answerModel: null,
    embedModel: null,
    dimensions: 768
  };

  it("falls back to 'нет такой инфы' when no chunks are retrieved", async () => {
    const prisma = makePrismaStub({ knowledgeCluster: cluster });
    const embed = vi.fn().mockResolvedValue({ vector: [0.1, 0.2], model: "emb", dimensions: 768 });
    const chat = vi.fn();
    const service = new KnowledgeService({
      prisma,
      logger: undefined,
      defaultAnswerModel: "gpt-5-nano",
      embed,
      chat
    });

    const answer = await service.answer(cluster, "что такое домен");
    expect(answer.fallback).toBe(true);
    expect(answer.answer).toBe("нет такой инфы");
    expect(chat).not.toHaveBeenCalled();
  });

  it("invokes chat with restrictive system prompt when chunks exist", async () => {
    const prisma = makePrismaStub({ knowledgeCluster: cluster });
    (prisma.$queryRawUnsafe as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "ck1", articleId: "a1", chunkIndex: 0, content: "Домен это техника", title: "Домены", sortScore: 0.1 }
    ]);
    const embed = vi.fn().mockResolvedValue({ vector: [0.1, 0.2], model: "emb", dimensions: 768 });
    const chat = vi.fn().mockResolvedValue({ content: "Домен — техника", model: "gpt-5-nano" });

    const service = new KnowledgeService({
      prisma,
      logger: undefined,
      defaultAnswerModel: "gpt-5-nano",
      embed,
      chat
    });

    const answer = await service.answer(cluster, "что такое домен");
    expect(chat).toHaveBeenCalledTimes(1);
    const callArg = chat.mock.calls[0][0];
    expect(callArg.model).toBe("gpt-5-nano");
    expect(callArg.messages[0].role).toBe("system");
    expect(callArg.messages[0].content).toContain("ФРАГМЕНТЫ ВИКИ");
    expect(callArg.messages[0].content).toContain("копируй термины");
    expect(callArg.messages[1]).toEqual({ role: "user", content: "что такое домен" });
    expect(answer.answer).toBe("Домен — техника");
    expect(answer.fallback).toBe(false);
  });

  it("skips vector retrieval and falls back to lexical search on embedding dimension mismatch", async () => {
    const prisma = makePrismaStub({ knowledgeCluster: cluster });
    const rawQuery = prisma.$queryRawUnsafe as unknown as ReturnType<typeof vi.fn>;
    rawQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("ts_rank_cd")) {
        return [
          { id: "ck1", articleId: "a1", chunkIndex: 0, content: "Домен это техника", title: "Домены", sortScore: 0.2 }
        ];
      }
      return [
        { id: "ck-vector", articleId: "a2", chunkIndex: 1, content: "Векторный результат", title: "Вектор", sortScore: 0.01 }
      ];
    });
    const logger = { warn: vi.fn(), debug: vi.fn() };
    const embed = vi.fn().mockResolvedValue({ vector: [0.1, 0.2], model: "emb", dimensions: 1536 });
    const chat = vi.fn();

    const service = new KnowledgeService({
      prisma,
      logger: logger as never,
      defaultAnswerModel: "gpt-5-nano",
      embed,
      chat
    });

    const rows = await service.query(cluster, "что такое домен");

    expect(rows).toEqual([
      { id: "ck1", articleId: "a1", chunkIndex: 0, content: "Домен это техника", title: "Домены", sortScore: expect.any(Number) }
    ]);
    expect(rawQuery).toHaveBeenCalledTimes(1);
    expect(String(rawQuery.mock.calls[0]?.[0])).toContain("ts_rank_cd");
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ clusterId: cluster.id, clusterDimensions: 768, queryDimensions: 1536 }),
      "knowledge vector retrieval skipped due to embedding dimension mismatch"
    );
  });
});
