ALTER TABLE "BotEventLog"
  ADD COLUMN "promptTokens" INTEGER,
  ADD COLUMN "completionTokens" INTEGER,
  ADD COLUMN "totalTokens" INTEGER,
  ADD COLUMN "tokenSource" TEXT;

CREATE INDEX "BotEventLog_guildId_totalTokens_createdAt_idx"
  ON "BotEventLog"("guildId", "totalTokens", "createdAt");
