# Hori Copilot Instructions

This repository is a pnpm TypeScript monorepo. Runtime entrypoints live in `apps/*`, shared business logic lives in `packages/*`, and behavior is verified primarily through `tests/*`.

## Source of Truth

1. Follow direct user chat instructions first.
2. Use `docs/implementation-plan-2026-05.md` as the active implementation roadmap.
3. Use `docs/prompt-architecture-audit-2026-05-24.md` as the current-state reality check for prompt/runtime behavior and legacy cleanup.
4. Use `docs/hori-epoch-core-ladder-plan-ru.md` only as target-architecture guidance when it does not conflict with current code, the audit, or direct user instructions.
5. If documents conflict, do not blend them together. State the conflict and prefer the newest active or current-state source.

## Never Revive Cancelled or Legacy Paths

- Do not reintroduce old modular persona-composer flows, legacy prompt-card or memory-card paths, stale string-context paths, or the cancelled "small blocks after core" idea unless the user explicitly asks for them.
- Treat stale V7 or V-next comments, disabled branches, compatibility shims, and abandoned plan fragments as historical context only, not as implementation guidance.
- Prefer migration, deletion, or containment of legacy paths over extending them.
- Do not reopen skipped or forever-cancelled items from the active plan unless the user explicitly reopens them.
- Specifically avoid reviving `kind/contour`, old restored-context branches, or parallel legacy user-context surfaces when the current slot, ladder, or orchestrator direction already covers the job.

## Working Style

- Start from the controlling code path, owning abstraction, or nearest relevant test instead of broad repo exploration.
- Before the first edit, form one falsifiable local hypothesis and one focused validation step.
- After the first substantive edit, immediately run the narrowest useful validation before widening scope.
- Fix root causes instead of stacking adapters.
- Keep changes minimal, preserve public contracts unless the task requires a contract change, and update nearby docs or tests when source-of-truth behavior changes.
- For multi-step work, keep a short live checklist and explicitly note which active doc or section drives the current step.

## Validation

- Prefer the smallest useful check first: a focused Vitest file or behavior-specific test, then `corepack pnpm lint`, then `corepack pnpm build`, then broader `corepack pnpm test`.
- If Prisma types or generated client output look stale, run `corepack pnpm prisma:generate` before treating that as a source regression.
- If linked declarations or `dist` output look stale after source edits, rebuild the touched package once before declaring the source broken.

## Repo Architecture Guardrails

- Keep runtime edges in `apps/*` and reusable logic in `packages/*`.
- Keep prompt and routing behavior close to the real orchestrator/runtime path and its tests. Do not spread prompt policy across multiple competing surfaces.
- Prefer the current slot, ladder, and orchestrator direction over reviving parallel legacy context systems.
- When a task touches prompt behavior, router behavior, or memory surfaces, inspect nearby tests under `tests/*` and keep coverage aligned.