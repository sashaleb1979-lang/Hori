# Cluster 1

Cluster 1 implements the persona and behavior layer only. It does not add long-term memory, relationship progression, conflict detection, media, voice, moderation or a full auto-interject engine.

## What Changed

- Added a typed persona schema and default Hori config under `packages/core/src/persona`.
- Added deterministic composer blocks for identity, tone, channel style, message kind, length, presets, slang, ideology, anti-slop, analogy suppression and self-initiated constraints.
- Kept old `PersonaSettings` and `/bot-style` compatible through the `PersonaService` facade.
- Integrated composer output into `ChatOrchestrator`, including behavior trace and dynamic response caps.
- Added optional `maxTokens` to LLM chat calls so tiny answers stay cheap and long/deep answers can expand.
- Added feature flags and slash choices for the new behavior layers.

## Extension Points

- Add a new channel kind by extending `ChannelKind`, `defaultChannelOverrides`, `channelKinds` and channel name heuristics.
- Add a new message kind by extending `MessageKind`, `messageKinds`, detection heuristics and preset/mode mapping.
- Add a new fast preset in `presets.ts` and wire it into `resolveStylePreset`.
- Add future mood engine output by passing `activeMode` or `debugOverrides.activeMode` into `composeBehaviorPrompt`.
- Add future auto-interject engine output through `isSelfInitiated` and the self-interjection constraint block.

## Acceptance Checks

- Default chat in `general` resolves to short, direct, Discord-like behavior.
- Meme bait in `memes` resolves to playful short behavior.
- Explanation requests resolve to focused compact behavior without analogies.
- Repeated or low-signal input resolves to tiny/dismissive/dry behavior.
- Auto-interject output resolves to tiny caps, unsolicited preset and self-interjection constraints.
- Political/opinion input can enable ideological flavour, while unrelated input keeps it background.
