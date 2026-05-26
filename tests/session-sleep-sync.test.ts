import { afterEach, describe, expect, it, vi } from "vitest";

import { stopSessionSleepSync, syncGuildSleepNickname } from "../apps/bot/src/runtime/session-sleep-sync";

afterEach(() => {
  stopSessionSleepSync();
  vi.restoreAllMocks();
});

function createGuild(id: string, nickname: string | null = null) {
  const me = {
    nickname,
    setNickname: vi.fn().mockResolvedValue(undefined)
  };

  return {
    id,
    members: {
      me,
      fetchMe: vi.fn().mockResolvedValue(me)
    }
  } as const;
}

describe("session sleep nickname sync", () => {
  it("switches nickname to sleep marker while guild sleep is active", async () => {
    const guild = createGuild("guild-1", "Хори");
    const runtime = {
      client: {
        user: {
          username: "Хори",
          globalName: "Хори"
        }
      },
      prisma: {
        guild: {
          findUnique: vi.fn().mockResolvedValue({ botName: "Хори" })
        }
      },
      sessionBuffer: {
        getGuildSleepUntil: vi.fn().mockResolvedValue(new Date("2026-05-14T10:20:00.000Z"))
      },
      logger: {
        warn: vi.fn()
      }
    } as never;

    await syncGuildSleepNickname(runtime, guild as never);

    expect(guild.members.me.setNickname).toHaveBeenCalledWith("спит");
  });

  it("restores configured guild bot name after sleep expires", async () => {
    const guild = createGuild("guild-2", "спит");
    const runtime = {
      client: {
        user: {
          username: "Хори",
          globalName: "Хори"
        }
      },
      prisma: {
        guild: {
          findUnique: vi.fn().mockResolvedValue({ botName: "Хори Prime" })
        }
      },
      sessionBuffer: {
        getGuildSleepUntil: vi.fn().mockResolvedValue(null)
      },
      logger: {
        warn: vi.fn()
      }
    } as never;

    await syncGuildSleepNickname(runtime, guild as never);

    expect(runtime.prisma.guild.findUnique).toHaveBeenCalledWith({
      where: { id: "guild-2" },
      select: { botName: true }
    });
    expect(guild.members.me.setNickname).toHaveBeenCalledWith("Хори Prime");
  });
});