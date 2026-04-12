-- Context intelligence: persona config, topics, confidence signals, queue and media registry.

CREATE TABLE "PersonaConfig" (
  "id" TEXT NOT NULL,
  "personaId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "displayName" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'ru',
  "configJson" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PersonaConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PersonaConfig_personaId_key" ON "PersonaConfig"("personaId");
CREATE INDEX "PersonaConfig_active_idx" ON "PersonaConfig"("active");

CREATE TABLE "MoodState" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "mood" TEXT NOT NULL,
  "intensity" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "isRareMode" BOOLEAN NOT NULL DEFAULT false,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "cooldownEnds" TIMESTAMP(3),
  "reasonJson" JSONB,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MoodState_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MoodState_scope_scopeId_idx" ON "MoodState"("scope", "scopeId");
CREATE INDEX "MoodState_endsAt_idx" ON "MoodState"("endsAt");

CREATE TABLE "AffinitySignal" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "signalType" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "messageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AffinitySignal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AffinitySignal_guildId_userId_createdAt_idx" ON "AffinitySignal"("guildId", "userId", "createdAt");
CREATE INDEX "AffinitySignal_signalType_createdAt_idx" ON "AffinitySignal"("signalType", "createdAt");
ALTER TABLE "AffinitySignal" ADD CONSTRAINT "AffinitySignal_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TopicSession" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summaryShort" TEXT NOT NULL,
  "summaryFacts" JSONB NOT NULL,
  "embedding" vector,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "closedReason" TEXT,

  CONSTRAINT "TopicSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TopicSession_guildId_channelId_lastActiveAt_idx" ON "TopicSession"("guildId", "channelId", "lastActiveAt");
CREATE INDEX "TopicSession_guildId_channelId_closedAt_idx" ON "TopicSession"("guildId", "channelId", "closedAt");
ALTER TABLE "TopicSession" ADD CONSTRAINT "TopicSession_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TopicMessageLink" (
  "id" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "relevance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TopicMessageLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TopicMessageLink_topicId_relevance_idx" ON "TopicMessageLink"("topicId", "relevance");
CREATE UNIQUE INDEX "TopicMessageLink_topicId_messageId_key" ON "TopicMessageLink"("topicId", "messageId");
ALTER TABLE "TopicMessageLink" ADD CONSTRAINT "TopicMessageLink_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "TopicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TopicMessageLink" ADD CONSTRAINT "TopicMessageLink_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ReplyQueueItem" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "sourceMsgId" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "lockedUntil" TIMESTAMP(3),
  "resultMsgId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReplyQueueItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReplyQueueItem_guildId_channelId_status_priority_idx" ON "ReplyQueueItem"("guildId", "channelId", "status", "priority");
CREATE INDEX "ReplyQueueItem_lockedUntil_idx" ON "ReplyQueueItem"("lockedUntil");
ALTER TABLE "ReplyQueueItem" ADD CONSTRAINT "ReplyQueueItem_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MediaMetadata" (
  "id" TEXT NOT NULL,
  "mediaId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "toneTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "triggerTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "allowedMoods" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "allowedChannels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "nsfw" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "weight" INTEGER NOT NULL DEFAULT 1,
  "cooldownSec" INTEGER NOT NULL DEFAULT 600,
  "lastUsedAt" TIMESTAMP(3),
  "metaJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MediaMetadata_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaMetadata_mediaId_key" ON "MediaMetadata"("mediaId");
CREATE INDEX "MediaMetadata_type_idx" ON "MediaMetadata"("type");
CREATE INDEX "MediaMetadata_nsfw_idx" ON "MediaMetadata"("nsfw");
CREATE INDEX "MediaMetadata_enabled_idx" ON "MediaMetadata"("enabled");
