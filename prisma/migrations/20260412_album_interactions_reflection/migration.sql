-- Passive Discord character mechanics: curated memories, interaction requests and reflection lessons.

CREATE TABLE "MemoryAlbumEntry" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "messageId" TEXT,
  "savedByUserId" TEXT NOT NULL,
  "authorUserId" TEXT,
  "content" TEXT NOT NULL,
  "note" TEXT,
  "category" TEXT NOT NULL DEFAULT 'moment',
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sourceUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MemoryAlbumEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemoryAlbumEntry_guildId_savedByUserId_messageId_key" ON "MemoryAlbumEntry"("guildId", "savedByUserId", "messageId");
CREATE INDEX "MemoryAlbumEntry_guildId_savedByUserId_createdAt_idx" ON "MemoryAlbumEntry"("guildId", "savedByUserId", "createdAt");
CREATE INDEX "MemoryAlbumEntry_guildId_channelId_createdAt_idx" ON "MemoryAlbumEntry"("guildId", "channelId", "createdAt");
ALTER TABLE "MemoryAlbumEntry" ADD CONSTRAINT "MemoryAlbumEntry_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InteractionRequest" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "messageId" TEXT,
  "userId" TEXT NOT NULL,
  "requestType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "title" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "category" TEXT,
  "expectedAnswerType" TEXT,
  "allowedOptions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "answerText" TEXT,
  "answerJson" JSONB,
  "metadataJson" JSONB,
  "expiresAt" TIMESTAMP(3),
  "answeredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InteractionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InteractionRequest_guildId_status_createdAt_idx" ON "InteractionRequest"("guildId", "status", "createdAt");
CREATE INDEX "InteractionRequest_guildId_userId_status_idx" ON "InteractionRequest"("guildId", "userId", "status");
CREATE INDEX "InteractionRequest_expiresAt_idx" ON "InteractionRequest"("expiresAt");
ALTER TABLE "InteractionRequest" ADD CONSTRAINT "InteractionRequest_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InteractionRequestEvent" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "payloadJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InteractionRequestEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InteractionRequestEvent_requestId_createdAt_idx" ON "InteractionRequestEvent"("requestId", "createdAt");
ALTER TABLE "InteractionRequestEvent" ADD CONSTRAINT "InteractionRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "InteractionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ReflectionLesson" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "messageId" TEXT,
  "userId" TEXT,
  "lessonType" TEXT NOT NULL DEFAULT 'feedback',
  "sentiment" TEXT NOT NULL DEFAULT 'neutral',
  "severity" INTEGER NOT NULL DEFAULT 1,
  "summary" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReflectionLesson_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReflectionLesson_messageId_key" ON "ReflectionLesson"("messageId");
CREATE INDEX "ReflectionLesson_guildId_status_createdAt_idx" ON "ReflectionLesson"("guildId", "status", "createdAt");
CREATE INDEX "ReflectionLesson_guildId_sentiment_createdAt_idx" ON "ReflectionLesson"("guildId", "sentiment", "createdAt");
ALTER TABLE "ReflectionLesson" ADD CONSTRAINT "ReflectionLesson_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
