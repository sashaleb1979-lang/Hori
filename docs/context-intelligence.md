# Context Intelligence System

This layer improves Hori's local Discord understanding without adding heavy dependencies. It is conservative by design: deterministic heuristics, Prisma state, BullMQ jobs and compact prompt blocks.

## Context Bundle V2

`ContextService.buildContext()` returns `ContextBundleV2` while keeping the old fields. New fields:

- `replyChain`: parent messages from `Message.replyToMessageId`, oldest to newest.
- `activeTopic`: current `TopicSession` summary and confidence.
- `topicWindow`: recent messages linked to the active topic.
- `entities`: cheap regex entity triggers for politics, Israel/Palestine/Hamas, ancap/state/taxes and communism/socialism.
- `entityMemories`: a few matching `ServerMemory` rows.

`ContextBuilderService` formats this as a sandwich:

- `[CONTEXT ANCHORS]`: reply-chain, active topic, entity memory, profile/relationship and summaries.
- `[RECENT CONTEXT]`: compressed recent/topic messages, truncated first.
- `[QUESTION ANCHOR]`: current message and intent.

Anchors are kept during truncation. Recent context is the disposable part.

## Confidence

`ContextScoringService` returns:

- `contextConfidence`: reply-chain, reply-to-bot, active topic and entity triggers increase it; low-signal and empty context reduce it.
- `mockeryConfidence`: starts from context confidence and adjusts for relationship, `doNotMock`, provocation, meme bait and utility-style requests.

`ChatOrchestrator` passes the scores into `composeBehaviorPrompt()` and `BotTrace.context`. Self-initiated messages below `AUTOINTERJECT_MIN_CONFIDENCE` are suppressed before the LLM call.

## Topics

`TopicService` maintains `TopicSession` and `TopicMessageLink`.

Reset rules:

- Reply messages keep the current topic.
- Active topic expires after `TOPIC_TTL_MINUTES`.
- Explicit switches like `новая тема`, `другое`, `сменим тему`, `кстати` close the old topic.
- If a topic embedding exists, similarity below `TOPIC_SIM_THRESHOLD` resets the topic.
- Without embeddings, a small lexical-overlap fallback is used.

Worker job: `topic.update`.
Admin: `/bot-topic status`, `/bot-topic reset`.

## Affinity, Mood, Queue, Media

- `AffinitySignal` records cheap recent interaction signals and lightly adjusts relationship overlay without replacing `RelationshipProfile`.
- `MoodState` stores a guild mood with TTL. Admin: `/bot-mood status|set|clear`.
- `ReplyQueueItem` prevents channel pileups. Explicit messages get a short busy ack and are queued; auto-interjects are dropped when busy. Admin: `/bot-queue status|clear`.
- `MediaMetadata` is a registry for local files only. Admin: `/bot-media add|list|disable`. `media_reactions_enabled` is off by default; missing files fall back to text.

## Feature Flags

Use `/bot-feature` for:

- `context_v2_enabled`
- `context_confidence_enabled`
- `topic_engine_enabled`
- `affinity_signals_enabled`
- `mood_engine_enabled`
- `reply_queue_enabled`
- `media_reactions_enabled`
- `runtime_config_cache_enabled`
- `embedding_cache_enabled`

Defaults keep context/scoring/topic/affinity/cache/queue enabled and media disabled.

## Checks

Run:

```bash
corepack pnpm prisma:generate
corepack pnpm test
corepack pnpm lint
```
