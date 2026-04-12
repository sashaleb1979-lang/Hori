# Persona System

Cluster 1 adds a modular behavior composer for Hori. It replaces the old single persona prompt with deterministic blocks: identity, style rules, active mode, channel style, message kind, context usage, response length, fast preset, slang, ideological flavour, self-interjection constraints, anti-slop and analogy suppression.

## Persona Config

The default config lives in `packages/core/src/persona/defaults.ts`. Example JSON snapshots are in `examples/hori.persona.json` and `examples/hori.persona.minimal.json`.

`examples/persona.initial.json` is kept only as a legacy `PersonaSettings` snapshot for `/bot-style`-compatible fields. For Cluster 1 tuning, prefer the `hori.persona*.json` examples.

Additional reference artifacts:

- `examples/cluster1-context-bundle-v2.json` — sample Context V2 payload shape.
- `examples/cluster1-behavior-trace.json` — sample `PersonaBehaviorTrace` / debug behavior output.
- `examples/cluster1-channel-config.json` — sample `ChannelConfig.topicInterestTags` setup.
- `examples/cluster1-cfg-expanded.json` — sample expanded `CFG` JSON runtime tuning.

Important config groups:

- `identity`: name, age, language and Discord role description.
- `coreTraits` and `styleRules`: brevity, sarcasm, sharpness, slang, mockery, explanation density and analogy strictness.
- `politicalFlavour`: sharp anarcho-capitalist, anti-state, pro-Israel and anti-communist flavour controls.
- `slangRules`: Discord slang density, informal spelling and allowed vocabulary examples.
- `contextualBehavior`: weak-model brevity, snark confidence, stale-take, context precision and future media-reaction biases.
- `responseModeDefaults`: tuning for `normal`, `playful`, `dry`, `irritated`, `focused`, `sleepy`, `detached`.
- `channelOverrides`: per-channel-kind bias for mode, length, slang and clarity.
- `limits`: sentence, paragraph, char and self-initiated caps.
- `antiSlopRules`, `selfInterjectionRules`, `forbiddenPatterns`: hard style bans and future auto-interject constraints.

The old `PersonaSettings` from guild DB settings still works. `PersonaService` adapts `/bot-style` fields into the new config at runtime.

## Model Tiers

`OLLAMA_FAST_MODEL` and `OLLAMA_SMART_MODEL` now both default to `qwen3.5:9b` unless overridden by env.

The routing split still matters:

- `fast` keeps lower token caps and colder sampling for cheap/common replies.
- `smart` keeps a wider token cap and slightly richer sampling for summaries, search and profile-like paths.

That tuning lives in `packages/llm/src/router/model-profiles.ts`, so changing tier behavior does not require rewriting the persona layer.

## Composer

Use `composeBehaviorPrompt(input)` from `packages/core/src/persona/compose.ts`.

Input includes guild settings, feature flags, message envelope, intent, cleaned content, channel policy, optional `ContextBundleV2`, `contextScores`, `contextTrace`, relationship overlay and debug overrides. Output includes:

- `prompt`: deterministic system instructions for the LLM.
- `trace`: compact behavior trace for `BotEventLog.debugTrace.behavior`, including mode, channel, message kind, energy, snark threshold, context confidence, active topic id and entity triggers.
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

Context intelligence flags can also be toggled with `/bot-feature`: `context_v2_enabled`, `context_confidence_enabled`, `topic_engine_enabled`, `affinity_signals_enabled`, `mood_engine_enabled`, `reply_queue_enabled`, `media_reactions_enabled`, `runtime_config_cache_enabled`, `embedding_cache_enabled`.

## Hard Style Rules

The analogy ban is strict by default. It appears in config, anti-slop, the composer output and tests. Hori should not use illustrative comparisons, "imagine if" phrasing, бытовые примеры ради наглядности or repeated restatements. Prefer a direct sentence.

Ideological flavour is a style layer, not a topic hijacker. It can become visible on explicitly political/ancap/statist/communist/Israel topics, but unrelated answers should not be dragged into politics.

Self-initiated output must be shorter than normal output. Default shape is one short poke, one dry line, a meme/reaction caption or silence when confidence is weak. The scorer now computes `mockeryConfidence`; low-confidence unsolicited output is suppressed before LLM generation.

Weak-model brevity is intentional: common chat should stay short unless the user asks for depth, gives a long or multi-part request, or the topic genuinely needs structure. Stale-take and media-reaction rules now connect to a conservative media registry; no files are bundled and missing media falls back to text.
