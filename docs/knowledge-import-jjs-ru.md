# JJS Knowledge Import

Этот поток нужен для быстрой массовой загрузки Jujutsu Shurigan в knowledge-кластер без ручной правки JSON и без кормления базы знаний кусками через чат.

## Что уже умеет импорт

- Один файл `.md` или `.txt` = одна статья.
- Папка обходится рекурсивно.
- Если в файле есть frontmatter, импорт берёт из него `title` и `sourceUrl`.
- `aliases`, `keywords` и `category` автоматически добавляются в ingest-контент как явные строки, чтобы lexical search их видел.
- Если frontmatter нет, title берётся из имени файла.

Основной импортёр: [scripts/import-knowledge.ts](scripts/import-knowledge.ts)

## Рекомендуемая структура папки

```text
jjs-wiki/
  mechanics/
    domain-expansion.md
    sure-hit.md
  characters/
    gojo.md
    sukuna.md
  skills/
    black-flash.md
  items/
    prison-realm.md
  modes/
    ranked.md
```

Правило простое: один файл = одна тема, которую пользователь реально спросит одним сообщением.

## Рекомендуемый формат файла

Смотри готовый шаблон: [examples/knowledge/jjs-article.template.md](examples/knowledge/jjs-article.template.md)

```md
---
title: Domain Expansion
sourceUrl: https://example.com/wiki/domain-expansion
category: mechanics
aliases:
  - DE
  - domain
keywords:
  - domain expansion
  - домен
  - де
  - sure-hit
---

# Domain Expansion

## Short answer

Короткий ответ по сути.

## Core facts

- факт
- факт

## How it works

Плотное объяснение.
```

## Что просить у ChatGPT

Смотри готовый prompt: [examples/knowledge/jjs-chatgpt-normalizer.prompt.md](examples/knowledge/jjs-chatgpt-normalizer.prompt.md)

Суть:

- не придумывать новые факты;
- не сглаживать жаргон;
- вытаскивать точные игровые термины;
- отдельно выписывать `aliases` и `keywords`;
- вычищать мусор вики-страниц.

## Как загружать

Dry-run:

```powershell
pnpm knowledge:import -- --guild YOUR_GUILD_ID --cluster jjs --title "Jujutsu Shurigan Wiki" --trigger ? --dir .\jjs-wiki --dry-run
```

Реальный импорт:

```powershell
pnpm knowledge:import -- --guild YOUR_GUILD_ID --cluster jjs --title "Jujutsu Shurigan Wiki" --trigger ? --dir .\jjs-wiki --replace
```

## Что проверять после загрузки

Прогоняй реальные вопросы игроков через `?`:

- `?как работает domain expansion`
- `?что делает black flash`
- `?чем sure-hit отличается от barrier`
- `?что такое prison realm`

Если ответ находится плохо:

- усиливай `keywords`;
- уточняй `title`;
- режь слишком широкую страницу на 2-3 статьи;
- поднимай важные отличия в секции `Short answer` или `Core facts`.