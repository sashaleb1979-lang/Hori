ALTER TABLE "ServerMemory"
ADD COLUMN IF NOT EXISTS "dimensions" INTEGER;

ALTER TABLE "UserMemoryNote"
ADD COLUMN IF NOT EXISTS "dimensions" INTEGER;

ALTER TABLE "ChannelMemoryNote"
ADD COLUMN IF NOT EXISTS "dimensions" INTEGER;

ALTER TABLE "EventMemory"
ADD COLUMN IF NOT EXISTS "dimensions" INTEGER;

ALTER TABLE "TopicSession"
ADD COLUMN IF NOT EXISTS "dimensions" INTEGER;

UPDATE "ServerMemory"
SET "dimensions" = vector_dims(embedding)
WHERE embedding IS NOT NULL;

UPDATE "UserMemoryNote"
SET "dimensions" = vector_dims(embedding)
WHERE embedding IS NOT NULL;

UPDATE "ChannelMemoryNote"
SET "dimensions" = vector_dims(embedding)
WHERE embedding IS NOT NULL;

UPDATE "EventMemory"
SET "dimensions" = vector_dims(embedding)
WHERE embedding IS NOT NULL;

UPDATE "TopicSession"
SET "dimensions" = vector_dims(embedding)
WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS "ServerMemory_guildId_dimensions_idx"
ON "ServerMemory"("guildId", "dimensions");

CREATE INDEX IF NOT EXISTS "UserMemoryNote_guildId_userId_active_dimensions_idx"
ON "UserMemoryNote"("guildId", "userId", "active", "dimensions");

CREATE INDEX IF NOT EXISTS "ChannelMemoryNote_guildId_channelId_active_dimensions_idx"
ON "ChannelMemoryNote"("guildId", "channelId", "active", "dimensions");

CREATE INDEX IF NOT EXISTS "EventMemory_guildId_active_dimensions_idx"
ON "EventMemory"("guildId", "active", "dimensions");

CREATE INDEX IF NOT EXISTS "TopicSession_guildId_channelId_dimensions_idx"
ON "TopicSession"("guildId", "channelId", "dimensions");