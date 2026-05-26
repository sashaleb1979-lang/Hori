---
description: "Use when planning architecture, migrations, refactors, roadmap work, prompt-runtime changes, legacy cleanup, or other long multi-step implementation in the Hori repository. Helps choose active docs, reject cancelled plans, and split work into validated slices."
name: "Hori Planning Guidelines"
---

# Hori Planning Guidelines

- Anchor every plan to one current source before listing steps:
  - `docs/implementation-plan-2026-05.md` is the active roadmap.
  - `docs/prompt-architecture-audit-2026-05-24.md` is the current-state audit and legacy cleanup guide.
  - `docs/hori-epoch-core-ladder-plan-ru.md` is target-architecture guidance only when it matches the current code, the audit, and direct user instructions.
- Never use stale docs, legacy comments, or disabled code paths as the main plan source.
- If documents conflict, call out the conflict explicitly and choose the newest active or current-state source instead of merging multiple narratives.
- Do not reopen skipped, cancelled, or forever-dropped items unless the user explicitly reopens them.
- Break plans into small slices. Each slice should name the owning code path or test surface, the intended behavior change, the narrow validation, and the exit condition.
- Prefer migrations that collapse duplicate surfaces instead of keeping old and new paths alive in parallel.
- For prompt, router, memory, or orchestration work, protect hot-path stability and clear ownership over adding more layers.
- Treat old prompt-card, memory-card, stale V7 single-block assumptions, string-context paths, and similar legacy surfaces as cleanup targets or compatibility bridges, not as the preferred future direction.
- For long refactors, sequence work as: controlling surface, focused check, smallest edit, validation, then adjacent follow-up.