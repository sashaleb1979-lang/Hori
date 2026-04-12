CREATE TABLE "ChannelMemoryNote" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'note',
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
  "salience" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "source" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "embedding" vector,
  CONSTRAINT "ChannelMemoryNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChannelMemoryNote_guildId_channelId_key_key" ON "ChannelMemoryNote"("guildId", "channelId", "key");
CREATE INDEX "ChannelMemoryNote_guildId_channelId_active_idx" ON "ChannelMemoryNote"("guildId", "channelId", "active");
CREATE INDEX "ChannelMemoryNote_guildId_channelId_type_idx" ON "ChannelMemoryNote"("guildId", "channelId", "type");
ALTER TABLE "ChannelMemoryNote" ADD CONSTRAINT "ChannelMemoryNote_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EventMemory" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT,
  "eventKey" TEXT NOT NULL,
  "title" TEXT,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'event',
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
  "salience" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "source" TEXT,
  "createdBy" TEXT,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "embedding" vector,
  CONSTRAINT "EventMemory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventMemory_guildId_eventKey_key_key" ON "EventMemory"("guildId", "eventKey", "key");
CREATE INDEX "EventMemory_guildId_active_updatedAt_idx" ON "EventMemory"("guildId", "active", "updatedAt");
CREATE INDEX "EventMemory_guildId_channelId_active_idx" ON "EventMemory"("guildId", "channelId", "active");
CREATE INDEX "EventMemory_guildId_eventKey_idx" ON "EventMemory"("guildId", "eventKey");
ALTER TABLE "EventMemory" ADD CONSTRAINT "EventMemory_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MemoryBuildRun" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT,
  "scope" TEXT NOT NULL,
  "depth" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "requestedBy" TEXT NOT NULL,
  "bestModel" TEXT,
  "progressJson" JSONB,
  "resultJson" JSONB,
  "errorText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemoryBuildRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MemoryBuildRun_guildId_status_createdAt_idx" ON "MemoryBuildRun"("guildId", "status", "createdAt");
CREATE INDEX "MemoryBuildRun_guildId_channelId_createdAt_idx" ON "MemoryBuildRun"("guildId", "channelId", "createdAt");
ALTER TABLE "MemoryBuildRun" ADD CONSTRAINT "MemoryBuildRun_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
