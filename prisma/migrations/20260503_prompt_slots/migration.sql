-- V5.1 Phase B: prompt-слоты вместо memory cards.
-- Слот: короткий контекст/инструкция, активный 10 минут с момента активации,
-- потом 6 часов cooldown. ownerLevel — снэпшот уровня отношений владельца на момент создания.

CREATE TABLE IF NOT EXISTS "HoriPromptSlot" (
  "id"            TEXT PRIMARY KEY,
  "guildId"       TEXT NOT NULL,
  "channelId"     TEXT,
  "ownerUserId"   TEXT NOT NULL,
  "ownerLevel"    INTEGER NOT NULL DEFAULT 0,
  "title"         TEXT,
  "content"       TEXT NOT NULL,
  "activatedAt"   TIMESTAMP(3),
  "cooldownUntil" TIMESTAMP(3),
  "active"        BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HoriPromptSlot_guildId_fkey"      FOREIGN KEY ("guildId")     REFERENCES "Guild"("id") ON DELETE CASCADE,
  CONSTRAINT "HoriPromptSlot_ownerUserId_fkey"  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")  ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "HoriPromptSlot_guildId_channelId_active_activatedAt_idx"
  ON "HoriPromptSlot" ("guildId", "channelId", "active", "activatedAt");

CREATE INDEX IF NOT EXISTS "HoriPromptSlot_guildId_ownerUserId_idx"
  ON "HoriPromptSlot" ("guildId", "ownerUserId");
