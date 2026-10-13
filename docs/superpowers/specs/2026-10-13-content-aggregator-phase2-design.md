# Content Aggregator Phase 2 — Design Spec

**Date:** 2026-10-13
**Phase:** 2 of 3
**Builds on:** Phase 1 MVP (all code at `/Users/izaz/Desktop/content-aggregator/`)

---

## Context

Phase 1 shipped a working desktop content aggregator with RSS/Nitter ingestion, keyword categorization, SQLite + FTS5 storage, and a React feed UI. Phase 2 adds the features deferred from Phase 1:

1. **Automatic credibility scoring** — every ingested article is scored based on its source's reputation against a bundled trusted-sources allowlist, with tier assignment, flags, and a human-readable explanation.
2. **Source trust tier editor** — users can promote/demote sources between Tier 1 (trusted), Tier 2 (unknown), and Tier 3 (flagged) directly in Settings.
3. **Keyword management UI** — the keyword add/remove backend already exists; Phase 2 wires up the Settings UI so users can manage keywords per category without touching the database.
4. **Sort-by-source fix** — "Sort: Source" is disabled in the UI when a search query is active (it was silently ignored in Phase 1).
5. **IPC const cleanup** — the three keyword IPC channels were bare strings in Phase 1; Phase 2 moves them into the `IPC` const for consistency.

---

## Architecture

No new subsystems are introduced beyond `src/main/credibility/`. All other changes extend existing modules.

```
Ingestion pipeline (scheduler.ts):
  fetchSource → categorizeArticle → scoreArticle [NEW]
                                         │
                                         ▼
                                 credibility_scores table [NEW]

UI additions:
  ArticleCard → CredibilityBadge [NEW]
  Settings → source trust tier selector [EXTENDED]
  Settings → keyword management per category [EXTENDED]
  Home → sort-by-source disabled when query active [FIXED]
```

---

## Module Breakdown

### `src/main/credibility/trusted-sources.json`
Bundled allowlist of ~50 reputable source domains. Each entry: `{ "domain": string, "label": string }`. Never fetched from the network — ships with the app. User cannot edit this file directly; they use the trust tier editor to override.

Included domains (non-exhaustive): reuters.com, apnews.com, bbc.com, bbc.co.uk, theguardian.com, npr.org, nytimes.com, washingtonpost.com, economist.com, ft.com, wsj.com, bloomberg.com, nature.com, sciencemag.org, arstechnica.com, wired.com, theatlantic.com, newyorker.com, propublica.org, politifact.com, snopes.com, factcheck.org, abcnews.go.com, cbsnews.com, nbcnews.com, cnn.com, pbs.org, vox.com, fivethirtyeight.com, statista.com, who.int, cdc.gov, nih.gov, nasa.gov, techcrunch.com, theverge.com, ycombinator.com.

### `src/main/credibility/scorer.ts`
Exports one function: `scoreArticle(db, article): void`.

Algorithm:
1. Extract domain from `article.url` using `new URL(article.url).hostname` (strip `www.` prefix).
2. Load `trusted-sources.json` (imported at module load — not per-call).
3. Look up source's `trust_tier` from `sources` table via `article.source_id`.
4. Apply score matrix:

| In allowlist | trust_tier | Score | Flags | Explanation |
|---|---|---|---|---|
| Yes | 1 | 0.90 | `[]` | "Source is in the trusted allowlist" |
| Yes | 2 | 0.65 | `["unconfirmed_tier"]` | "Known source, not yet verified by you — promote to Tier 1 in Settings" |
| Yes | 3 | 0.15 | `["flagged_source"]` | "Source has been manually flagged" |
| No | 1 | 0.75 | `["not_in_allowlist"]` | "Manually trusted, not in the built-in allowlist" |
| No | 2 | 0.40 | `["unknown_source"]` | "Source reputation is unverified" |
| No | 3 | 0.10 | `["flagged_source"]` | "Source has been manually flagged" |

5. Call `upsertCredibilityScore(db, article.id, { score, tier, flags, explanation })`.
6. URL parse errors (malformed URLs) → score 0.40, flags `["parse_error"]`, explanation "Could not determine source domain".

### `src/main/db/schema.ts` (modified)
Add `credibility_scores` table to the existing `db.exec(...)` call:
```sql
CREATE TABLE IF NOT EXISTS credibility_scores (
  article_id  INTEGER PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  score       REAL NOT NULL,
  tier        INTEGER NOT NULL,
  flags       TEXT NOT NULL DEFAULT '[]',
  explanation TEXT NOT NULL,
  checked_at  TEXT DEFAULT (datetime('now'))
);
```

### `src/main/db/queries.ts` (modified)
New functions:
- `upsertCredibilityScore(db, articleId, data: {score, tier, flags: string[], explanation}): void` — INSERT OR REPLACE; serialises flags as JSON string.
- `getCredibilityScore(db, articleId): CredibilityScore | null`

`getFeed` and `searchArticles` updated to LEFT JOIN `credibility_scores` and attach parsed result to `ArticleWithMeta.credibility`.

Keyword IPC channel names moved into the `IPC` const (no logic change):
```typescript
CATEGORIES_ADD_KEYWORD:    'categories:add-keyword',
CATEGORIES_REMOVE_KEYWORD: 'categories:remove-keyword',
CATEGORIES_LIST_KEYWORDS:  'categories:list-keywords',
```

### `src/main/db/types.ts` (modified)
`ArticleWithMeta` gains:
```typescript
credibility?: {
  score: number;
  tier: number;
  flags: string[];
  explanation: string;
}
```

New type:
```typescript
export interface CredibilityScore {
  article_id: number;
  score: number;
  tier: number;
  flags: string[];      // already parsed from JSON
  explanation: string;
  checked_at: string;
}
```

`IPC` const gains the three keyword channels (see above).

### `src/main/ingestion/scheduler.ts` (modified)
After `categorizeArticle(db, article)`, add:
```typescript
import { scoreArticle } from '../credibility/scorer'
// ...
scoreArticle(db, article)
```

### `src/preload/index.ts` (modified)
Expose keyword methods using `IPC` const instead of bare strings:
```typescript
addKeyword:    (catId, keyword) => ipcRenderer.invoke(IPC.CATEGORIES_ADD_KEYWORD, catId, keyword),
removeKeyword: (keywordId)      => ipcRenderer.invoke(IPC.CATEGORIES_REMOVE_KEYWORD, keywordId),
listKeywords:  (catId)          => ipcRenderer.invoke(IPC.CATEGORIES_LIST_KEYWORDS, catId),
```

### `src/renderer/src/components/CredibilityBadge.tsx` (new)
Props: `credibility?: ArticleWithMeta['credibility']`

Renders nothing if `credibility` is undefined. Otherwise renders a colored pill:
- score ≥ 0.80 → green background, label "Trusted"
- score 0.50–0.79 → yellow background, label "Unverified"
- score < 0.50 → red background, label "Flagged"

Has a `title` attribute set to `credibility.explanation` for hover tooltip.

### `src/renderer/src/components/ArticleCard.tsx` (modified)
Add `<CredibilityBadge credibility={article.credibility} />` below the category badges.

### `src/renderer/src/pages/Settings.tsx` (modified)
Two additions:

**Source trust tier editor:** Each source list item gets an inline `<select>` with three options:
- `1` → "Tier 1 — Trusted"
- `2` → "Tier 2 — Unknown"
- `3` → "Tier 3 — Flagged"

Changing it calls `window.api.sources.update(id, { trust_tier: Number(e.target.value) })` then reloads sources.

**Keyword management:** Each category row gets an expand button. Expanded state shows:
- Current keywords list (fetched via `window.api.categories.listKeywords(catId)`)
- `✕` button per keyword (calls `window.api.categories.removeKeyword(keywordId)`)
- An "Add keyword" text input + button (calls `window.api.categories.addKeyword(catId, keyword)`)

### `src/renderer/src/pages/Home.tsx` (modified)
When `query.trim()` is non-empty, the `<option value="source">Sort: Source</option>` gets `disabled`. If `sortBy === 'source'` and a query is typed, `setSortBy('date')` is called automatically.

---

## Data Flow

```
Article ingested by fetchSource
  → insertArticle (DB)
  → FTS5 trigger fires (auto)
  → categorizeArticle (keyword rules)
  → scoreArticle [NEW]
      ├─ lookup source trust_tier
      ├─ lookup domain in trusted-sources.json
      ├─ compute score + flags + explanation
      └─ upsertCredibilityScore (DB)

Feed/Search query (IPC)
  → getFeed / searchArticles
      └─ LEFT JOIN credibility_scores → ArticleWithMeta.credibility
  → renderer → ArticleCard → CredibilityBadge
```

---

## Testing

**Unit tests (Node env — `tests/main/`):**

- `credibility/scorer.test.ts`:
  - Article from allowlist domain + tier 1 → score 0.90, no flags
  - Article from allowlist domain + tier 2 → score 0.65, flag `unconfirmed_tier`
  - Article from unknown domain + tier 2 → score 0.40, flag `unknown_source`
  - Article from tier 3 source → score ≤ 0.15, flag `flagged_source`
  - Malformed URL → score 0.40, flag `parse_error`

- `db/queries.test.ts` (extended):
  - `upsertCredibilityScore` persists and `getCredibilityScore` retrieves
  - `getFeed` includes `credibility` field when score exists; `undefined` when not

**Component tests (jsdom env — `tests/renderer/`):**

- `CredibilityBadge.test.tsx`:
  - Score 0.90 → renders green "Trusted" badge
  - Score 0.55 → renders yellow "Unverified" badge
  - Score 0.10 → renders red "Flagged" badge
  - `undefined` credibility → renders nothing

**Manual tests:**
- Add a Reuters RSS source → fetch → verify article shows green "Trusted" badge
- Add an unknown blog → fetch → verify article shows yellow "Unverified" badge
- Demote Reuters to Tier 3 in Settings → re-fetch → verify badge turns red
- Add a keyword to a category in Settings → trigger fetch → verify article is tagged
- Type `C++` in search bar → verify no crash (FTS fallback)
- Type a search query → verify "Sort: Source" option is disabled

---

## Risks & Constraints

| Risk | Mitigation |
|---|---|
| `scoreArticle` throws (malformed URL, DB error) | Wrap in try/catch in scheduler — same pattern as `fetchSource`; log error, never crash pipeline |
| trusted-sources.json grows stale | It's bundled — users update by updating the app; Phase 3 can add a remote update mechanism |
| Keyword UI re-fetches on every expand | Acceptable for Phase 2; cache if it becomes a perf issue |
| LEFT JOIN on credibility_scores slows getFeed | Table is small (one row per article); index on `article_id` is the PK — no perf concern |
