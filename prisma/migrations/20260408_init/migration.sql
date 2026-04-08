CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "Guild" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT,
  "botName" TEXT NOT NULL DEFAULT 'Хори',
  "preferredLanguage" TEXT NOT NULL DEFAULT 'ru',
  "roughnessLevel" INTEGER NOT NULL DEFAULT 2,
  "sarcasmLevel" INTEGER NOT NULL DEFAULT 2,
  "roastLevel" INTEGER NOT NULL DEFAULT 2,
  "interjectTendency" INTEGER NOT NULL DEFAULT 1,
  "replyLength" TEXT NOT NULL DEFAULT 'short',
  "preferredStyle" TEXT NOT NULL DEFAULT 'коротко, сухо, по делу',
  "forbiddenWords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "forbiddenTopics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ChannelConfig" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "channelName" TEXT,
  "allowBotReplies" BOOLEAN NOT NULL DEFAULT TRUE,
  "allowInterjections" BOOLEAN NOT NULL DEFAULT FALSE,
  "isMuted" BOOLEAN NOT NULL DEFAULT FALSE,
  "topicInterestTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "responseLengthOverride" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChannelConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "ChannelConfig_guildId_channelId_key" ON "ChannelConfig"("guildId", "channelId");

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "username" TEXT,
  "globalName" TEXT,
  "isBot" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "UserStats" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "totalMessages" INTEGER NOT NULL DEFAULT 0,
  "totalReplies" INTEGER NOT NULL DEFAULT 0,
  "totalMentions" INTEGER NOT NULL DEFAULT 0,
  "avgMessageLength" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "activeHoursHistogram" JSONB,
  "topChannelsSnapshot" JSONB,
  "conversationStarterCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserStats_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE,
  CONSTRAINT "UserStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "UserStats_guildId_userId_key" ON "UserStats"("guildId", "userId");

CREATE TABLE "UserProfile" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "summaryShort" TEXT NOT NULL,
  "styleTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "topicTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sourceWindowSize" INTEGER NOT NULL DEFAULT 0,
  "lastProfiledAt" TIMESTAMP(3),
  "isEligible" BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT "UserProfile_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE,
  CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "UserProfile_guildId_userId_key" ON "UserProfile"("guildId", "userId");

CREATE TABLE "RelationshipProfile" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "toneBias" TEXT NOT NULL DEFAULT 'neutral',
  "roastLevel" INTEGER NOT NULL DEFAULT 0,
  "praiseBias" INTEGER NOT NULL DEFAULT 0,
  "interruptPriority" INTEGER NOT NULL DEFAULT 0,
  "doNotMock" BOOLEAN NOT NULL DEFAULT FALSE,
  "doNotInitiate" BOOLEAN NOT NULL DEFAULT FALSE,
  "protectedTopics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RelationshipProfile_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE,
  CONSTRAINT "RelationshipProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "RelationshipProfile_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "RelationshipProfile_guildId_userId_key" ON "RelationshipProfile"("guildId", "userId");

CREATE TABLE "Message" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "replyToMessageId" TEXT,
  "mentionCount" INTEGER NOT NULL DEFAULT 0,
  "charCount" INTEGER NOT NULL DEFAULT 0,
  "tokenEstimate" INTEGER NOT NULL DEFAULT 0,
  "flags" JSONB,
  "threadId" TEXT,
  "vectorizedAt" TIMESTAMP(3),
  CONSTRAINT "Message_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE,
  CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "Message_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "Message"("id") ON DELETE SET NULL
);
CREATE INDEX "Message_guildId_channelId_createdAt_idx" ON "Message"("guildId", "channelId", "createdAt");
CREATE INDEX "Message_guildId_userId_createdAt_idx" ON "Message"("guildId", "userId", "createdAt");

CREATE TABLE "MessageEmbedding" (
  "id" TEXT PRIMARY KEY,
  "messageId" TEXT NOT NULL UNIQUE,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "embedding" vector,
  "dimensions" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageEmbedding_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE
);
CREATE INDEX "MessageEmbedding_guildId_channelId_idx" ON "MessageEmbedding"("guildId", "channelId");

CREATE TABLE "ChannelSummary" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "rangeStart" TIMESTAMP(3) NOT NULL,
  "rangeEnd" TIMESTAMP(3) NOT NULL,
  "summaryShort" TEXT NOT NULL,
  "summaryLong" TEXT NOT NULL,
  "topicTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notableUsers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChannelSummary_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE
);
CREATE INDEX "ChannelSummary_guildId_channelId_rangeEnd_idx" ON "ChannelSummary"("guildId", "channelId", "rangeEnd");

CREATE TABLE "ServerMemory" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "source" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "embedding" vector,
  CONSTRAINT "ServerMemory_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "ServerMemory_guildId_key_key" ON "ServerMemory"("guildId", "key");
CREATE INDEX "ServerMemory_guildId_type_idx" ON "ServerMemory"("guildId", "type");

CREATE TABLE "UserMemoryNote" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "source" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "embedding" vector,
  CONSTRAINT "UserMemoryNote_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE,
  CONSTRAINT "UserMemoryNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "UserMemoryNote_guildId_userId_key_key" ON "UserMemoryNote"("guildId", "userId", "key");
CREATE INDEX "UserMemoryNote_guildId_userId_active_idx" ON "UserMemoryNote"("guildId", "userId", "active");

CREATE TABLE "SearchCache" (
  "id" TEXT PRIMARY KEY,
  "cacheKey" TEXT NOT NULL UNIQUE,
  "query" TEXT NOT NULL,
  "responseJson" JSONB NOT NULL,
  "provider" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "BotEventLog" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT,
  "channelId" TEXT,
  "messageId" TEXT,
  "userId" TEXT,
  "eventType" TEXT NOT NULL,
  "intent" TEXT,
  "routeReason" TEXT,
  "modelUsed" TEXT,
  "usedSearch" BOOLEAN NOT NULL DEFAULT FALSE,
  "toolCalls" JSONB,
  "contextMessages" INTEGER,
  "memoryLayers" JSONB,
  "latencyMs" INTEGER,
  "relationshipApplied" BOOLEAN NOT NULL DEFAULT FALSE,
  "debugTrace" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BotEventLog_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE
);
CREATE INDEX "BotEventLog_messageId_idx" ON "BotEventLog"("messageId");
CREATE INDEX "BotEventLog_guildId_createdAt_idx" ON "BotEventLog"("guildId", "createdAt");

CREATE TABLE "InterjectionLog" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "userId" TEXT,
  "topicKey" TEXT,
  "reason" TEXT,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "outcome" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InterjectionLog_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE
);
CREATE INDEX "InterjectionLog_guildId_channelId_createdAt_idx" ON "InterjectionLog"("guildId", "channelId", "createdAt");

CREATE TABLE "FeatureFlag" (
  "id" TEXT PRIMARY KEY,
  "scope" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "FeatureFlag_scope_scopeId_key_key" ON "FeatureFlag"("scope", "scopeId", "key");

CREATE TABLE "ModeratorPreference" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "moderatorUserId" TEXT NOT NULL,
  "preferredStyle" TEXT,
  "forbiddenTopics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "forbiddenWords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "allowRoastTargets" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "denyRoastTargets" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "responseLengthOverride" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModeratorPreference_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "ModeratorPreference_guildId_moderatorUserId_key" ON "ModeratorPreference"("guildId", "moderatorUserId");

CREATE TABLE "ChannelStats" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "totalMessages" INTEGER NOT NULL DEFAULT 0,
  "totalMentions" INTEGER NOT NULL DEFAULT 0,
  "avgMessageLength" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "activeHoursHistogram" JSONB,
  "topUsersSnapshot" JSONB,
  "conversationStarterCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChannelStats_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "ChannelStats_guildId_channelId_key" ON "ChannelStats"("guildId", "channelId");

CREATE TABLE "UserDailyAggregate" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "day" TIMESTAMP(3) NOT NULL,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "replyCount" INTEGER NOT NULL DEFAULT 0,
  "mentionCount" INTEGER NOT NULL DEFAULT 0,
  "charCount" INTEGER NOT NULL DEFAULT 0,
  "conversationStarterCount" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "UserDailyAggregate_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE,
  CONSTRAINT "UserDailyAggregate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "UserDailyAggregate_guildId_userId_day_key" ON "UserDailyAggregate"("guildId", "userId", "day");

CREATE TABLE "ChannelDailyAggregate" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "day" TIMESTAMP(3) NOT NULL,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "mentionCount" INTEGER NOT NULL DEFAULT 0,
  "charCount" INTEGER NOT NULL DEFAULT 0,
  "conversationStarterCount" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ChannelDailyAggregate_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "ChannelDailyAggregate_guildId_channelId_day_key" ON "ChannelDailyAggregate"("guildId", "channelId", "day");
