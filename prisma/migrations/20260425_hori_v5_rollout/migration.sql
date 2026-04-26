ALTER TABLE "RelationshipProfile"
ADD COLUMN "relationshipState" TEXT NOT NULL DEFAULT 'base',
ADD COLUMN "relationshipScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "positiveMarks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "escalationStage" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "escalationUpdatedAt" TIMESTAMP(3),
ADD COLUMN "coldUntil" TIMESTAMP(3),
ADD COLUMN "coldPermanent" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "HoriUserMemoryCard" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "details" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "openQuestions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "importance" TEXT NOT NULL DEFAULT 'normal',
  "sessionRangeStart" TIMESTAMP(3) NOT NULL,
  "sessionRangeEnd" TIMESTAMP(3) NOT NULL,
  "sessionMessageCount" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HoriUserMemoryCard_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HoriUserMemoryCard_guildId_userId_active_createdAt_idx" ON "HoriUserMemoryCard"("guildId", "userId", "active", "createdAt");
ALTER TABLE "HoriUserMemoryCard" ADD CONSTRAINT "HoriUserMemoryCard_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HoriUserMemoryCard" ADD CONSTRAINT "HoriUserMemoryCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "HoriRestoredContext" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "memoryCardId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HoriRestoredContext_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HoriRestoredContext_guildId_channelId_userId_key" ON "HoriRestoredContext"("guildId", "channelId", "userId");
CREATE INDEX "HoriRestoredContext_guildId_userId_consumedAt_expiresAt_idx" ON "HoriRestoredContext"("guildId", "userId", "consumedAt", "expiresAt");
ALTER TABLE "HoriRestoredContext" ADD CONSTRAINT "HoriRestoredContext_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HoriRestoredContext" ADD CONSTRAINT "HoriRestoredContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HoriRestoredContext" ADD CONSTRAINT "HoriRestoredContext_memoryCardId_fkey" FOREIGN KEY ("memoryCardId") REFERENCES "HoriUserMemoryCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
