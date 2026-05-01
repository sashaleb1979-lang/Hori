-- Add trigger field to HoriPromptSlot for keyword-based auto-activation
ALTER TABLE "HoriPromptSlot" ADD COLUMN "trigger" TEXT;
CREATE INDEX "HoriPromptSlot_guildId_trigger_idx" ON "HoriPromptSlot"("guildId", "trigger");
