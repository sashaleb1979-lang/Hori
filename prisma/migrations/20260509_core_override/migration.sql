-- Volna 5: add HoriCoreOverride table for mood override
CREATE TABLE "HoriCoreOverride" (
  "id"         TEXT NOT NULL,
  "guildId"    TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "coreId"     TEXT NOT NULL,
  "expiresAt"  TIMESTAMP(3),
  "reason"     TEXT,
  "by"         TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HoriCoreOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HoriCoreOverride_guildId_userId_key" ON "HoriCoreOverride"("guildId", "userId");
CREATE INDEX "HoriCoreOverride_guildId_expiresAt_idx" ON "HoriCoreOverride"("guildId", "expiresAt");

ALTER TABLE "HoriCoreOverride" ADD CONSTRAINT "HoriCoreOverride_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HoriCoreOverride" ADD CONSTRAINT "HoriCoreOverride_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
