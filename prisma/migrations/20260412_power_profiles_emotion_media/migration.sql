ALTER TABLE "MediaMetadata"
ADD COLUMN     "emotionTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "messageKindTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "autoUseEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "manualOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.82,
ADD COLUMN     "minIntensity" DOUBLE PRECISION NOT NULL DEFAULT 0.62;

CREATE TABLE "MediaUsageLog" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "reasonKey" TEXT,
    "autoTriggered" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MediaUsageLog_guildId_usedAt_idx" ON "MediaUsageLog"("guildId", "usedAt");
CREATE INDEX "MediaUsageLog_guildId_autoTriggered_usedAt_idx" ON "MediaUsageLog"("guildId", "autoTriggered", "usedAt");
CREATE INDEX "MediaUsageLog_guildId_mediaId_usedAt_idx" ON "MediaUsageLog"("guildId", "mediaId", "usedAt");