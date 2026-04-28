-- V5.1 Phase C: явный 3-уровневый доступ к каналу.
-- accessMode:
--   'full'   — обычная работа (read + reply + interject).
--   'silent' — читает (контекст/аналитика), но не отвечает и не встревает.
--   'off'    — игнорирует канал полностью.
-- NULL — fallback на legacy-поля (allowBotReplies/isMuted) для обратной совместимости.

ALTER TABLE "ChannelConfig"
  ADD COLUMN IF NOT EXISTS "accessMode" TEXT;
