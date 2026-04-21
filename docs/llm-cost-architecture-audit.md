# Hori LLM / Cost / Context Audit

Date: 2026-04-21
Status: final

## Scope

This document closes the remaining analysis phase for:

- token usage review
- bot message processing pipeline
- model routing and LLM configuration
- prompt and context assembly
- cost optimization opportunities

## Evidence Base

- Current repository state was re-audited directly in code.
- Earlier session conclusions about CSV token usage were incorporated where they still match the code.
- The raw CSV artifact itself is not present in the workspace at the time of writing, so this report treats code as the source of truth and uses the earlier CSV work only as directional evidence.

## Executive Summary

Hori is already in a much better state than an older audit would suggest. Centralized model routing exists, selective context building is implemented, OpenAI/Ollama token usage is traced, per-request USD cost is calculated, cached prompt tokens are tracked, and Prometheus metrics exist for tokens, cached tokens, retries, and cost.

The main cost driver is still prompt input volume, not output volume. The architecture explains why: every meaningful turn can stack persona instructions, dynamic behavior blocks, few-shot anchors, context anchors, recent messages, and sometimes link context or search synthesis. Completion caps help, but the biggest monthly win still comes from reducing or caching prompt-side text.

The most important architectural caveat left is that Contour B is not a separate model-cost tier. It is mainly a shorter-response tier. Both Contour B and Contour C currently use the same chat slot model and differ mostly by max token cap and context cap. That is acceptable in balanced mode, but it means there is no true cheap conversational path at the routing layer if the active chat slot is expensive.

The second major conclusion is that observability is now good enough to optimize with production data, but that data is not yet surfaced in a first-class operator dashboard. The backend records enough information; the missing piece is aggregation and presentation.

## Current Runtime Topology

### Main request path

The current chat pipeline is:

1. inbound message enters bot router
2. debounce and activation policy decide whether to process
3. intent router decides help, summary, search, rewrite, memory, profile, or chat
4. query embedding is built for non-help intents
5. memory HyDE may add an extra classifier-slot generation plus extra embedding for eligible chat queries
6. context service assembles contextual data
7. context builder formats selective context text
8. message kind detection and contour resolution choose response depth
9. persona composer builds behavior prompt blocks and few-shot anchors
10. LLM call is made, or template response is returned for Contour A
11. guardrails, media, tracing, relationship updates, and metrics run afterward

Primary integration file: packages/core/src/orchestrators/chat-orchestrator.ts

### Major token-spending branches

- Normal chat: one main chat call, plus optional HyDE generation/embedding, plus optional link context fetch
- Search: tool-planning call plus synthesis call, or direct fallback search synthesis call
- Summary: one dedicated summary call
- Analytics: one dedicated analytics narration call
- Rewrite: one rewrite call
- Memory write via moderator message: storage plus embedding write

## Model Routing State

Primary routing file: packages/llm/src/router/model-routing.ts

### Routing slots

- classifier
- chat
- summary
- rewrite
- search
- analytics
- profile
- memory

### Active OpenAI presets

#### balanced_openai

- classifier: gpt-5-nano
- chat: gpt-5.4-nano
- summary: gpt-5.4-nano
- rewrite: gpt-5.4-nano
- search: gpt-5.4-nano
- analytics: gpt-5.4-nano
- profile: gpt-5.4-nano
- memory: gpt-5.4-nano

#### economy_openai

- all slots: gpt-5-nano

#### quality_openai

- classifier: gpt-5-nano
- chat: gpt-5.4-mini
- all utility slots: gpt-5.4-nano

### Embeddings

- model: text-embedding-3-small
- default dimensions: 768
- supported dimensions: 512, 768, 1536

## Pricing and Cost Tracking State

### Pricing table

Primary pricing file: packages/llm/src/router/model-pricing.ts

Current configured prices per 1M tokens:

| Model | Input | Output |
| --- | ---: | ---: |
| gpt-4o-mini | $0.15 | $0.60 |
| gpt-5-nano | $0.10 | $0.40 |
| gpt-5-mini | $0.30 | $1.20 |
| gpt-5.4-nano | $0.10 | $0.40 |
| gpt-5.4-mini | $0.40 | $1.60 |
| text-embedding-3-small | $0.02 | $0.00 |

Cached prompt tokens are billed at 50% of input rate in the cost calculator.

### Telemetry that already exists

The current repository already records much more than an older audit assumed.

#### In orchestrator trace

packages/core/src/orchestrators/chat-orchestrator.ts records:

- promptTokens
- completionTokens
- totalTokens
- tokenSource
- costUsd
- llmCalls breakdown

#### In database

Each bot event log stores:

- promptTokens
- completionTokens
- totalTokens
- tokenSource
- costUsd

#### In metrics

packages/shared/src/metrics/index.ts exposes:

- hori_llm_tokens_total
- hori_llm_cached_tokens_total
- hori_llm_cost_usd_total
- hori_llm_retries_total

### What is still missing

- no built-in cost analytics panel or cost dashboard
- no per-intent or per-contour cost endpoint for operators
- no explicit spend guardrail such as per-day or per-guild budget caps
- no alerting on sudden model-cost shifts

## Prompt and Context Cost Anatomy

### Stable prompt components

Stable prompt text now exists in several layers:

- base persona prompt in packages/core/src/prompts/system-prompts.ts
- staticPrefix from persona composition
- core few-shot anchors in packages/core/src/persona/fewShot.ts

The chat path intentionally sends staticPrefix first to improve OpenAI prompt prefix caching.

### Dynamic prompt components

The dynamic part is still large on meaningful turns:

- behavior prompt from persona composition
- emotional guidance
- conflict guidance
- contour guidance
- context text
- optional link context

This dynamic layer is the real source of repeated uncached prompt spend.

### Few-shot state

Primary few-shot file: packages/core/src/persona/fewShot.ts

Current state:

- 46 total examples in the global list
- 12 live base anchors for Contour C
- 4 core anchors for Contour B
- optional blocks for concrete replies, meta feedback, and emotional advice

This is already leaner than the older broader anchor set, especially for Contour B.

### Context assembly state

Primary context formatting file: packages/core/src/services/context-builder.ts

Selective category inclusion is already implemented by message kind. That is a major architectural win and should be preserved.

Examples:

- smalltalk_hangout only gets user_profile plus recent_messages
- meme_bait only gets relationship plus recent_messages
- meta_feedback gets user_profile, relationship, reply_chain
- info_question gets reply_chain, active_topic, entities, entity_memory, server_memory, recent_messages

Current max context handling:

- Contour C uses runtime contextMaxChars
- Contour B and A effectively clamp to at most 1000 chars in the orchestrator
- recent messages are truncated first when over budget

## Key Findings

### 1. Input tokens are still the dominant cost center

This remains the central optimization fact.

Why:

- multiple system-style messages per request
- dynamic behavior composition
- context anchors plus recent messages
- search and link-understanding append extra prompt text
- HyDE can add an extra generation before retrieval

Practical implication:

- lowering completion caps helps, but reducing prompt size and improving cache hit rate has more leverage

### 2. Contour B is not a true cheap-model tier

Contour B currently saves by using:

- smaller response token cap
- smaller context budget
- smaller few-shot set

But it does not automatically switch to a cheaper model than Contour C. Both call getChatSettingsForContour(), and both use the chat slot model from runtime model routing.

Implication:

- in balanced_openai this is acceptable because chat already uses gpt-5.4-nano
- in quality_openai this becomes expensive because even light conversational turns in Contour B still pay gpt-5.4-mini pricing
- if the team wants a true cheap conversational lane, it needs a model-routing split, not just shorter maxTokens

### 3. Search is one of the biggest cost multipliers

Search can consume more than a normal chat turn because it may do:

- tool-planning LLM call
- search tool executions
- final synthesis LLM call

The fallback path can still do a full synthesis call after web fetches. Search quality is good, but it is not a cheap intent.

### 4. HyDE improves recall but adds hidden spend

The memory HyDE path now exists in chat-orchestrator:

- one classifier-slot generation to create retrieval-oriented pseudo text
- one extra embedding for the HyDE text
- one merge step with the original query embedding

This is smart retrieval behavior, but it should be treated as a premium retrieval feature, not free context.

### 5. Cost observability backend is good; operator UX is behind

The data needed for disciplined optimization already exists:

- per-call token counts
- cached token counts
- per-call USD cost
- per-model Prometheus metrics
- retry counters

The weak spot is not instrumentation anymore. The weak spot is operational visibility. Without an aggregate view, optimization still depends on ad hoc inspection.

### 6. Prompt caching is under-exploited

The code already does one important thing correctly: staticPrefix is sent first specifically to improve provider-side prompt caching.

The next win is to move as much stable text as possible into that prefix or another stable leading block. Right now a lot of persona and behavior material is still generated dynamically each turn, which reduces cached token reuse.

### 7. Selective context is already implemented and should not be rolled back

Older recommendations to add selective context are now obsolete: the repository already ships it. The remaining work is refinement, not invention.

The current remaining weakness is fallback breadth:

- unknown message kinds still use ALL_CATEGORIES
- some non-chat intents still inherit broader context than they strictly need

### 8. Retry handling exists, but spend policy does not

OpenAI client now has retry logic and llm retry metrics. That is operationally healthier than a one-shot client.

What still does not exist is spend policy above transport reliability:

- no per-request retry budget surfaced to trace
- no cost-aware abort rule when a request cascades into search plus retries
- no daily or guild-level spend ceiling

## High-Value Optimization Opportunities

### Priority A — High impact, low to medium effort

#### 1. Split chat routing by contour, not just by token cap

Recommended change:

- add a dedicated fast conversational slot for Contour B
- keep Contour C on the main chat slot

Expected effect:

- real model-tier separation for light vs deep chat
- strongest savings when quality_openai is active

#### 2. Expand stable prompt prefixing for cache reuse

Recommended change:

- move more invariant behavior instructions out of per-turn dynamic composition
- keep the first system blocks stable across turns wherever possible

Expected effect:

- higher cached_tokens
- direct prompt-input discount without losing behavior quality

#### 3. Build an operator-facing cost breakdown

Recommended change:

- aggregate botEventLog by intent, model, contour, and day
- expose costUsd, prompt tokens, cached tokens, and retry counts in panel or admin command

Expected effect:

- turns optimization from guesswork into measurement

### Priority B — Medium impact, low effort

#### 4. Tighten fallback context breadth

Recommended change:

- avoid ALL_CATEGORIES for vague or unknown kinds unless explicitly needed
- define narrower defaults per intent family

Expected effect:

- lower average prompt tokens on edge cases and uncategorized turns

#### 5. Make HyDE measurable and adaptive

Recommended change:

- log HyDE hit rate and compare retrieval quality or downstream usefulness
- disable or narrow it for cases where it adds cost without recall gain

Expected effect:

- keeps retrieval quality while trimming hidden extra calls

#### 6. Add budget guards for expensive intents

Recommended change:

- per-response cap for search planning loops
- per-guild or per-day soft budget alerting

Expected effect:

- prevents silent spend spikes from tool-heavy workloads

### Priority C — Medium impact, medium effort

#### 7. Add hybrid recall result caching

Recommended change:

- short TTL cache for repeated active-memory queries within the same conversational window

Expected effect:

- fewer repeated vector/lexical retrieval operations
- fewer repeated embeddings for similar requests when combined with cache keys

#### 8. Add cost and contour distribution analytics to experimentation loop

Recommended change:

- compare response usefulness and cost by message kind and contour
- validate whether current A/B/C mapping is still optimal

Expected effect:

- enables data-backed remapping of message kinds to cheaper contours where safe

## What Should Not Be Misdiagnosed

### False conclusion: cost tracking is missing

That was true in older notes, but it is no longer true in the current codebase.

### False conclusion: selective context is not implemented

Also outdated. It is implemented and already doing useful cost work.

### False conclusion: Contour B is automatically cheap

Not necessarily. It is shorter, not inherently cheaper at the model-routing layer.

## Recommended Implementation Sequence

### Phase 1

- add contour-specific chat model routing
- expose aggregated cost analytics from botEventLog

### Phase 2

- refactor prompt prefixing for higher cache reuse
- narrow unknown-kind and non-chat context defaults

### Phase 3

- measure HyDE cost vs retrieval benefit
- add budget policies for search-heavy and retry-heavy paths

### Phase 4

- add experimentation loop for contour assignment by message kind

## Final Assessment

Hori is no longer missing the fundamentals. The codebase already has:

- centralized routing
- selective context
- few-shot reduction by contour
- token and cost accounting
- retry telemetry
- prompt-cache-aware prefix placement

The remaining work is now second-order optimization:

- make cheap paths truly cheap at routing level
- turn existing cost telemetry into operator decisions
- reduce dynamic prompt churn so cached prompt discounts apply more often

If only one engineering change is chosen next, it should be contour-specific model routing plus a cost dashboard. That closes the loop between architecture and real spend.