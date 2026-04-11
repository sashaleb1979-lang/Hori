# Persona System

Cluster 1 adds a modular behavior composer for Hori. It replaces the old single persona prompt with deterministic blocks: identity, style rules, active mode, channel style, message kind, response length, fast preset, slang, ideological flavour, self-interjection constraints, anti-slop and analogy suppression.

## Persona Config

The default config lives in `packages/core/src/persona/defaults.ts`. Example JSON snapshots are in `examples/hori.persona.json` and `examples/hori.persona.minimal.json`.

Important config groups:

- `identity`: name, age, language and Discord role description.
- `coreTraits` and `styleRules`: brevity, sarcasm, sharpness, slang, mockery, explanation density and analogy strictness.
- `politicalFlavour`: right-wing, pro-Israel and anti-communist flavour controls.
- `slangRules`: Discord slang density and informal spelling controls.
- `responseModeDefaults`: tuning for `normal`, `playful`, `dry`, `irritated`, `focused`, `sleepy`, `detached`.
- `channelOverrides`: per-channel-kind bias for mode, length, slang and clarity.
- `limits`: sentence, paragraph, char and self-initiated caps.
- `antiSlopRules`, `selfInterjectionRules`, `forbiddenPatterns`: hard style bans and future auto-interject constraints.

The old `PersonaSettings` from guild DB settings still works. `PersonaService` adapts `/bot-style` fields into the new config at runtime.

## Composer

Use `composeBehaviorPrompt(input)` from `packages/core/src/persona/compose.ts`.

Input includes guild settings, feature flags, message envelope, intent, cleaned content, channel policy, optional context, relationship overlay and debug overrides. Output includes:

- `prompt`: deterministic system instructions for the LLM.
- `trace`: compact behavior trace for `BotEventLog.debugTrace.behavior`.
- `limits`: max chars and max tokens for the current answer.

Resolution order:

- Active mode: debug override, self-initiated path, channel/tag bias, message kind, requested depth, default `normal`.
- Channel kind: debug override, `topicInterestTags` such as `kind:memes`, channel name heuristic, fallback `general`.
- Message kind: deterministic content and intent heuristics, fallback `casual_address` or `info_question`.

## Admin Controls

Existing `/bot-style` stays coarse and DB-backed. Fine-grained channel controls use `ChannelConfig.topicInterestTags`:

- `kind:memes`, `kind:serious`, `kind:help`, `kind:bot`, `kind:offtopic`, `kind:late_night`
- `mode:focused`, `mode:playful`, `mode:dry`, `mode:irritated`, `mode:sleepy`, `mode:detached`
- `depth:tiny`, `depth:short`, `depth:normal`, `depth:long`, `depth:deep`

Feature flags can be toggled with `/bot-feature`: `channel_aware_mode`, `message_kind_aware_mode`, `anti_slop_strict_mode`, `playful_mode_enabled`, `irritated_mode_enabled`, `ideological_flavour_enabled`, `analogy_ban_enabled`, `slang_layer_enabled`, `self_interjection_constraints_enabled`.

## Hard Style Rules

The analogy ban is strict by default. It appears in config, anti-slop, the composer output and tests. Hori should not use illustrative comparisons, "imagine if" phrasing, бытовые примеры ради наглядности or repeated restatements. Prefer a direct sentence.

Ideological flavour is a style layer, not a topic hijacker. It can become visible on political/opinion topics, but unrelated answers should not be dragged into politics.

Self-initiated output must be shorter than normal output. Default shape is one short poke, one dry line, a meme/reaction caption or silence when confidence is weak.
