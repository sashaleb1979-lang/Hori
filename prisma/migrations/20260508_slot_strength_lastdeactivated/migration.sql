-- Volna 3: add strength and lastDeactivatedAt to HoriPromptSlot
ALTER TABLE "HoriPromptSlot" ADD COLUMN "strength" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "HoriPromptSlot" ADD COLUMN "lastDeactivatedAt" TIMESTAMP(3);
