-- V5.1 Phase F: 2 micro-blocks for relationship evaluator
-- characteristic — постоянная характеристика пользователя (3-5 фраз)
-- lastChange — что произошло в последней сессии / последнее изменение настроения
-- characteristicUpdatedAt — когда характеристика обновлялась последний раз

ALTER TABLE "RelationshipProfile"
  ADD COLUMN IF NOT EXISTS "characteristic" TEXT,
  ADD COLUMN IF NOT EXISTS "lastChange" TEXT,
  ADD COLUMN IF NOT EXISTS "characteristicUpdatedAt" TIMESTAMP(3);
