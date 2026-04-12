# Cluster 1

Cluster 1 now covers the persona/behavior layer plus the conservative Context Intelligence System from `deep-research-report.md`. It still avoids new ML/native dependencies and bundled media packs. Voice/music and heavy media generation remain out of scope.

## What Changed

- Added a typed persona schema and default Hori config under `packages/core/src/persona`.
- Added deterministic composer blocks for identity, tone, channel style, message kind, length, weak-model brevity, snark confidence, contextual energy, presets, slang, ideology, stale-take/media extension rules, anti-slop, analogy suppression and self-initiated constraints.
- Kept old `PersonaSettings` and `/bot-style` compatible through the `PersonaService` facade.
- Integrated composer output into `ChatOrchestrator`, including behavior trace and dynamic response caps.
- Added optional `maxTokens` to LLM chat calls so tiny answers stay cheap and long/deep answers can expand.
- Added feature flags and slash choices for the new behavior layers.
- Added `ContextBundleV2`: reply-chain anchors, active topic, entity triggers, topic window and entity memory.
- Replaced linear context formatting with a context sandwich: anchors first, compressed recent context, question anchor last.
- Added numeric `contextConfidence` and `mockeryConfidence` so self-interject and snark can be gated before the LLM.
- Added conservative topic sessions, affinity signals, guild mood state, reply queue and media registry tables/services.
- Added admin commands: `/bot-topic`, `/bot-mood`, `/bot-queue`, `/bot-media`.

## Extension Points

- Add a new channel kind by extending `ChannelKind`, `defaultChannelOverrides`, `channelKinds` and channel name heuristics.
- Add a new message kind by extending `MessageKind`, `messageKinds`, detection heuristics and preset/mode mapping.
- Add a new fast preset in `presets.ts` and wire it into `resolveStylePreset`.
- Add future mood engine output by passing `activeMode` or `debugOverrides.activeMode` into `composeBehaviorPrompt`.
- Auto-interject now has a numeric confidence gate. Keep the threshold conservative; weak context should suppress unsolicited replies.
- Media selection is registry-based only. Add local files with `/bot-media add`; missing files fall back to text.
- Topic summaries are cheap heuristics for now. If they become too noisy, improve `TopicService` before adding another LLM call.

## Acceptance Checks

- Default chat in `general` resolves to short, direct, Discord-like behavior.
- Meme bait in `memes` resolves to playful short behavior.
- Explanation requests resolve to focused compact behavior without analogies.
- Repeated or low-signal input resolves to tiny/dismissive/dry behavior.
- Auto-interject output resolves to tiny caps, unsolicited preset and self-interjection constraints.
- Explicit political/ancap/statist/communist/Israel input can enable ideological flavour, while unrelated opinions keep it background and omit the ideology prompt block.
- Common short chat keeps weak-model brevity and should not grow into a mini-essay without a reason.
- Reply-chain context appears before recent chat and is preserved during truncation.
- Self-initiated low-confidence messages are suppressed before the expensive LLM call.
- Topic reset respects replies, TTL and explicit topic switches.
- Media registry never sends a missing file; it falls back to text.
