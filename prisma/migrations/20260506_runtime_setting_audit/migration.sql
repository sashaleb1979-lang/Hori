-- V6 Phase I: audit log for runtime setting changes (core prompts etc.).
-- Append-only history. RuntimeSetting itself stores latest value;
-- RuntimeSettingAudit lets the panel show "who/when/what changed".

CREATE TABLE "RuntimeSettingAudit" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "guildId" TEXT,
  "previousValue" TEXT,
  "newValue" TEXT,
  "action" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RuntimeSettingAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RuntimeSettingAudit_key_createdAt_idx" ON "RuntimeSettingAudit" ("key", "createdAt" DESC);
CREATE INDEX "RuntimeSettingAudit_guildId_createdAt_idx" ON "RuntimeSettingAudit" ("guildId", "createdAt" DESC);
