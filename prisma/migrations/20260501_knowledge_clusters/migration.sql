-- Knowledge clusters: per-guild RAG knowledge bases (e.g. wiki "?jjs how to combo")

CREATE TABLE IF NOT EXISTS "KnowledgeCluster" (
    "id"          TEXT NOT NULL,
    "guildId"     TEXT NOT NULL,
    "code"        TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "trigger"     TEXT NOT NULL DEFAULT '?',
    "enabled"     BOOLEAN NOT NULL DEFAULT true,
    "answerModel" TEXT,
    "embedModel"  TEXT,
    "dimensions"  INTEGER,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KnowledgeCluster_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeCluster_guildId_code_key"
  ON "KnowledgeCluster"("guildId", "code");
CREATE INDEX IF NOT EXISTS "KnowledgeCluster_guildId_enabled_idx"
  ON "KnowledgeCluster"("guildId", "enabled");
CREATE INDEX IF NOT EXISTS "KnowledgeCluster_guildId_trigger_enabled_idx"
  ON "KnowledgeCluster"("guildId", "trigger", "enabled");

ALTER TABLE "KnowledgeCluster"
  ADD CONSTRAINT "KnowledgeCluster_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "KnowledgeArticle" (
    "id"         TEXT NOT NULL,
    "clusterId"  TEXT NOT NULL,
    "title"      TEXT NOT NULL,
    "sourceUrl"  TEXT,
    "rawContent" TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeArticle_clusterId_title_key"
  ON "KnowledgeArticle"("clusterId", "title");
CREATE INDEX IF NOT EXISTS "KnowledgeArticle_clusterId_idx"
  ON "KnowledgeArticle"("clusterId");

ALTER TABLE "KnowledgeArticle"
  ADD CONSTRAINT "KnowledgeArticle_clusterId_fkey"
  FOREIGN KEY ("clusterId") REFERENCES "KnowledgeCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "KnowledgeChunk" (
    "id"         TEXT NOT NULL,
    "clusterId"  TEXT NOT NULL,
    "articleId"  TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content"    TEXT NOT NULL,
    "tokens"     INTEGER NOT NULL DEFAULT 0,
    "embedding"  vector,
    "dimensions" INTEGER,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KnowledgeChunk_clusterId_dimensions_idx"
  ON "KnowledgeChunk"("clusterId", "dimensions");
CREATE INDEX IF NOT EXISTS "KnowledgeChunk_articleId_chunkIndex_idx"
  ON "KnowledgeChunk"("articleId", "chunkIndex");

ALTER TABLE "KnowledgeChunk"
  ADD CONSTRAINT "KnowledgeChunk_clusterId_fkey"
  FOREIGN KEY ("clusterId") REFERENCES "KnowledgeCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeChunk"
  ADD CONSTRAINT "KnowledgeChunk_articleId_fkey"
  FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
