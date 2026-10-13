# Content Aggregator Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic credibility scoring, source trust tier editor, keyword management UI, sort-by-source fix when search is active, and IPC const cleanup.

**Architecture:** The credibility pipeline runs in the existing ingestion scheduler immediately after `categorizeArticle`; scores live in a new `credibility_scores` table joined into every feed/search query; the renderer shows a colored pill badge on each article card. Settings gets inline controls for source tier and category keywords; Home.tsx disables the "Sort: Source" option while a search query is active.

**Tech Stack:** TypeScript, better-sqlite3, Vitest (Node env for main, jsdom for renderer), React 18, TailwindCSS v4.

**Spec:** `docs/superpowers/specs/2026-10-13-content-aggregator-phase2-design.md`

## Global Constraints

- Node env tests run with: `npm test` (`vitest run --config tests/vitest.config.ts`)
- Renderer tests run with: `npm run test:renderer` (`vitest run --config tests/renderer/vitest.config.ts`)
- TypeScript must stay clean — no `any` escapes unless casting raw SQLite rows
- `credibility` is optional on `ArticleWithMeta` (articles ingested before Phase 2 have no score row)
- `flags` is stored as a JSON string in SQLite; always serialize on write and parse on read
- `trusted-sources.json` is a bundled static file — never fetched from network
- `scoreArticle` must never throw — wrap in try/catch in the scheduler
- IPC const cleanup is a refactor only — no logic change to keyword handlers
- Scores use the exact matrix from the spec: (allowlist ✓/✗) × (trust_tier 1/2/3)
- CredibilityBadge renders nothing when `credibility` is `undefined`

## Review Focus

- **Missing credibility row**: `getFeed` and `searchArticles` must return `credibility: undefined` (not a partial object or `null`) when no score row exists. The LEFT JOIN produces NULLs — the attach step must detect this and omit the field.
- **URL parse errors in scorer**: `new URL(article.url)` throws on malformed URLs; the spec mandates score 0.40, flag `["parse_error"]`. The try/catch must wrap the URL constructor specifically, not silence all scorer errors.
- **Sort-by-source auto-reset**: when the user types into the search box while `sortBy === 'source'`, `setSortBy('date')` must fire — tested by simulating the `onChange` callback, not just disabling the option.
- **Keyword expand state isolation**: each category row has its own expanded boolean; expanding one must not expand others. Render multiple categories and verify independence.
- **IPC const mismatch**: `ipc/categories.ts` currently uses bare strings `'categories:add-keyword'` etc.; `preload/index.ts` also uses bare strings. Both must switch to `IPC.CATEGORIES_ADD_KEYWORD` etc. in the same commit so there is never a mismatch.

---

### Task 1: Schema + Types

**Files:**
- Modify: `src/main/db/schema.ts`
- Modify: `src/main/db/types.ts`

**Interfaces:**
- Produces: `CredibilityScore` interface; `credibility?` field on `ArticleWithMeta`; `IPC.CATEGORIES_ADD_KEYWORD`, `IPC.CATEGORIES_REMOVE_KEYWORD`, `IPC.CATEGORIES_LIST_KEYWORDS` in the `IPC` const — all later tasks rely on these names verbatim.

- [ ] **Step 1: Write the failing test**

Add to `tests/main/db/queries.test.ts` (after the existing `categories` describe block):

```typescript
import { upsertCredibilityScore, getCredibilityScore } from '../../../src/main/db/queries'

describe('credibility scores', () => {
  it('upsertCredibilityScore persists and getCredibilityScore retrieves', () => {
    const { id: sourceId } = createSource(db, { name: 'F', url: 'https://f.com/rss', type: 'rss', trust_tier: 1 })
    insertArticle(db, {
      source_id: sourceId, url: 'https://a.com/1', title: 'T',
      body_text: '', author: '', published_at: '2026-01-01T00:00:00Z', url_hash: 'h1',
    })
    const article = getArticleByUrlHash(db, 'h1')!
    upsertCredibilityScore(db, article.id, { score: 0.90, tier: 1, flags: [], explanation: 'trusted' })
    const cs = getCredibilityScore(db, article.id)
    expect(cs).not.toBeNull()
    expect(cs!.score).toBe(0.90)
    expect(cs!.tier).toBe(1)
    expect(cs!.flags).toEqual([])
    expect(cs!.explanation).toBe('trusted')
  })

  it('upsertCredibilityScore replaces on re-score', () => {
    const { id: sourceId } = createSource(db, { name: 'G', url: 'https://g.com/rss', type: 'rss', trust_tier: 2 })
    insertArticle(db, {
      source_id: sourceId, url: 'https://b.com/1', title: 'T2',
      body_text: '', author: '', published_at: '2026-01-01T00:00:00Z', url_hash: 'h2',
    })
    const article = getArticleByUrlHash(db, 'h2')!
    upsertCredibilityScore(db, article.id, { score: 0.65, tier: 2, flags: ['unconfirmed_tier'], explanation: 'first' })
    upsertCredibilityScore(db, article.id, { score: 0.90, tier: 1, flags: [], explanation: 'updated' })
    const cs = getCredibilityScore(db, article.id)!
    expect(cs.score).toBe(0.90)
    expect(cs.explanation).toBe('updated')
  })

  it('getFeed includes credibility when score exists, undefined when not', () => {
    const { id: sourceId } = createSource(db, { name: 'H', url: 'https://h.com/rss', type: 'rss', trust_tier: 1 })
    insertArticle(db, {
      source_id: sourceId, url: 'https://c.com/1', title: 'Scored',
      body_text: '', author: '', published_at: '2026-01-01T00:00:00Z', url_hash: 'h3',
    })
    insertArticle(db, {
      source_id: sourceId, url: 'https://c.com/2', title: 'Unscored',
      body_text: '', author: '', published_at: '2026-01-02T00:00:00Z', url_hash: 'h4',
    })
    const scored = getArticleByUrlHash(db, 'h3')!
    upsertCredibilityScore(db, scored.id, { score: 0.90, tier: 1, flags: [], explanation: 'trusted' })
    const feed = getFeed(db, { sort_by: 'date', limit: 10, offset: 0 })
    const scoredResult = feed.find(a => a.url_hash === 'h3')!
    const unscoredResult = feed.find(a => a.url_hash === 'h4')!
    expect(scoredResult.credibility).toBeDefined()
    expect(scoredResult.credibility!.score).toBe(0.90)
    expect(unscoredResult.credibility).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `upsertCredibilityScore` not exported, `credibility_scores` table does not exist

- [ ] **Step 3: Add `credibility_scores` table to schema**

In `src/main/db/schema.ts`, add inside the single `db.exec(...)` string after the `category_keywords` table:

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

- [ ] **Step 4: Extend `ArticleWithMeta`, add `CredibilityScore`, extend `IPC` const**

Replace the contents of `src/main/db/types.ts` with:

```typescript
export interface Source {
  id: number; name: string; url: string;
  type: 'rss' | 'nitter' | 'scrape'; trust_tier: 1 | 2 | 3;
  last_fetched_at: string | null; active: 0 | 1;
}
export interface Article {
  id: number; source_id: number; url: string; title: string;
  body_text: string; author: string; published_at: string;
  fetched_at: string; url_hash: string;
}
export interface Category { id: number; name: string; color: string; }
export interface ArticleWithMeta extends Article {
  source_name: string; source_trust_tier: number;
  categories: Array<{ id: number; name: string; color: string; confidence: number }>;
  credibility?: {
    score: number;
    tier: number;
    flags: string[];
    explanation: string;
  };
}
export interface CredibilityScore {
  article_id: number;
  score: number;
  tier: number;
  flags: string[];
  explanation: string;
  checked_at: string;
}
export interface SearchParams {
  query?: string; category_id?: number;
  sort_by: 'date' | 'relevance' | 'source'; limit: number; offset: number;
}
export const IPC = {
  SOURCES_LIST: 'sources:list', SOURCES_CREATE: 'sources:create',
  SOURCES_UPDATE: 'sources:update', SOURCES_DELETE: 'sources:delete',
  SOURCES_FETCH_NOW: 'sources:fetch-now', ARTICLES_FEED: 'articles:feed',
  ARTICLES_SEARCH: 'articles:search', CATEGORIES_LIST: 'categories:list',
  CATEGORIES_CREATE: 'categories:create', CATEGORIES_UPDATE: 'categories:update',
  CATEGORIES_DELETE: 'categories:delete',
  CATEGORIES_ADD_KEYWORD: 'categories:add-keyword',
  CATEGORIES_REMOVE_KEYWORD: 'categories:remove-keyword',
  CATEGORIES_LIST_KEYWORDS: 'categories:list-keywords',
} as const
```

- [ ] **Step 5: Run type-check to verify**

Run: `npm run typecheck`
Expected: PASS (new fields are additive; optional `credibility?` doesn't break existing usages)

- [ ] **Step 6: Commit**

```bash
git -C /Users/izaz/Desktop/content-aggregator add src/main/db/schema.ts src/main/db/types.ts
git -C /Users/izaz/Desktop/content-aggregator commit -m "feat: add credibility_scores table, CredibilityScore type, and IPC keyword consts"
```

---

### Task 2: DB Query Extensions

**Files:**
- Modify: `src/main/db/queries.ts`
- Modify: `tests/main/db/queries.test.ts` (tests written in Task 1)

**Interfaces:**
- Consumes: `CredibilityScore` from `./types`; `credibility_scores` table from Task 1
- Produces:
  - `upsertCredibilityScore(db, articleId: number, data: { score: number; tier: number; flags: string[]; explanation: string }): void`
  - `getCredibilityScore(db, articleId: number): CredibilityScore | null`
  - `getFeed` and `searchArticles` now return `ArticleWithMeta` with `credibility` populated when a score row exists

- [ ] **Step 1: Add `upsertCredibilityScore` and `getCredibilityScore` to queries.ts**

Add after `getAllKeywordRules` at the bottom of `src/main/db/queries.ts`:

```typescript
import type { CredibilityScore } from './types'

export function upsertCredibilityScore(
  db: InstanceType<typeof Database>,
  articleId: number,
  data: { score: number; tier: number; flags: string[]; explanation: string }
): void {
  db.prepare(`
    INSERT OR REPLACE INTO credibility_scores (article_id, score, tier, flags, explanation)
    VALUES (?, ?, ?, ?, ?)
  `).run(articleId, data.score, data.tier, JSON.stringify(data.flags), data.explanation)
}

export function getCredibilityScore(
  db: InstanceType<typeof Database>,
  articleId: number
): CredibilityScore | null {
  const row = db.prepare('SELECT * FROM credibility_scores WHERE article_id = ?').get(articleId) as (CredibilityScore & { flags: string }) | null
  if (!row) return null
  return { ...row, flags: JSON.parse(row.flags) }
}
```

Note: the `import type { CredibilityScore }` line should be added at the top of the file alongside the existing type imports.

- [ ] **Step 2: Update `getFeed` to LEFT JOIN credibility_scores**

Replace the `getFeed` function in `src/main/db/queries.ts`:

```typescript
export function getFeed(
  db: InstanceType<typeof Database>,
  params: Omit<SearchParams, 'query'>
): ArticleWithMeta[] {
  const categoryFilter = params.category_id
    ? 'JOIN article_categories ac ON ac.article_id = a.id AND ac.category_id = ?'
    : ''
  const args: (number | string)[] = params.category_id ? [params.category_id] : []
  const orderBy = params.sort_by === 'source' ? 's.name' : 'a.published_at DESC'
  args.push(params.limit, params.offset)

  const rows = db.prepare(`
    SELECT a.*, s.name AS source_name, s.trust_tier AS source_trust_tier,
           cs.score AS cs_score, cs.tier AS cs_tier, cs.flags AS cs_flags,
           cs.explanation AS cs_explanation
    FROM articles a
    JOIN sources s ON s.id = a.source_id
    LEFT JOIN credibility_scores cs ON cs.article_id = a.id
    ${categoryFilter}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...args) as Array<ArticleWithMeta & { cs_score: number | null; cs_tier: number | null; cs_flags: string | null; cs_explanation: string | null }>

  return attachCategories(db, rows.map(attachCredibility))
}
```

- [ ] **Step 3: Update `searchArticles` to LEFT JOIN credibility_scores**

Replace the `searchArticles` function:

```typescript
export function searchArticles(
  db: InstanceType<typeof Database>,
  params: SearchParams
): ArticleWithMeta[] {
  if (!params.query?.trim()) return getFeed(db, params)
  try {
    const rows = db.prepare(`
      SELECT a.*, s.name AS source_name, s.trust_tier AS source_trust_tier,
             fts.rank AS fts_rank,
             cs.score AS cs_score, cs.tier AS cs_tier, cs.flags AS cs_flags,
             cs.explanation AS cs_explanation
      FROM articles_fts fts
      JOIN articles a ON a.id = fts.rowid
      JOIN sources s ON s.id = a.source_id
      LEFT JOIN credibility_scores cs ON cs.article_id = a.id
      WHERE articles_fts MATCH ?
      ORDER BY ${params.sort_by === 'relevance' ? 'fts.rank' : 'a.published_at DESC'}
      LIMIT ? OFFSET ?
    `).all(params.query, params.limit, params.offset) as Array<ArticleWithMeta & { cs_score: number | null; cs_tier: number | null; cs_flags: string | null; cs_explanation: string | null }>
    return attachCategories(db, rows.map(attachCredibility))
  } catch {
    return getFeed(db, params)
  }
}
```

- [ ] **Step 4: Add the `attachCredibility` helper** (private, above `attachCategories`)

```typescript
type RawWithCredibility = ArticleWithMeta & {
  cs_score: number | null
  cs_tier: number | null
  cs_flags: string | null
  cs_explanation: string | null
}

function attachCredibility(row: RawWithCredibility): ArticleWithMeta {
  const { cs_score, cs_tier, cs_flags, cs_explanation, ...rest } = row
  if (cs_score === null) return rest as ArticleWithMeta
  return {
    ...rest,
    credibility: {
      score: cs_score,
      tier: cs_tier!,
      flags: JSON.parse(cs_flags!),
      explanation: cs_explanation!,
    },
  } as ArticleWithMeta
}
```

- [ ] **Step 5: Update import at top of queries.ts to include `CredibilityScore`**

The existing import line:
```typescript
import type { Source, Article, Category, ArticleWithMeta, SearchParams } from './types'
```
Change to:
```typescript
import type { Source, Article, Category, ArticleWithMeta, SearchParams, CredibilityScore } from './types'
```

Also add to the re-export line:
```typescript
export type { Source, Article, Category, ArticleWithMeta, SearchParams, CredibilityScore }
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: All tests PASS (including the 3 new credibility tests from Task 1)

- [ ] **Step 7: Run type-check**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git -C /Users/izaz/Desktop/content-aggregator add src/main/db/queries.ts tests/main/db/queries.test.ts
git -C /Users/izaz/Desktop/content-aggregator commit -m "feat: add credibility score queries and join into feed/search results"
```

---

### Task 3: Credibility Scorer Module

**Files:**
- Create: `src/main/credibility/trusted-sources.json`
- Create: `src/main/credibility/scorer.ts`
- Create: `tests/main/credibility/scorer.test.ts`

**Interfaces:**
- Consumes: `upsertCredibilityScore(db, articleId, data)` from Task 2; `sources` table row with `trust_tier`
- Produces: `scoreArticle(db: InstanceType<typeof Database>, article: Article): void`

- [ ] **Step 1: Write failing tests**

Create `tests/main/credibility/scorer.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../../src/main/db/schema'
import { createSource, insertArticle, getArticleByUrlHash, getCredibilityScore } from '../../../src/main/db/queries'
import { scoreArticle } from '../../../src/main/credibility/scorer'

let db: InstanceType<typeof Database>

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
})

afterEach(() => { db.close() })

describe('scoreArticle', () => {
  it('allowlist domain + tier 1 → score 0.90, no flags', () => {
    const { id: sourceId } = createSource(db, { name: 'Reuters', url: 'https://feeds.reuters.com/reuters/topNews', type: 'rss', trust_tier: 1 })
    insertArticle(db, {
      source_id: sourceId, url: 'https://reuters.com/article/1',
      title: 'T', body_text: '', author: '', published_at: '2026-01-01T00:00:00Z', url_hash: 'h1',
    })
    const article = getArticleByUrlHash(db, 'h1')!
    scoreArticle(db, article)
    const cs = getCredibilityScore(db, article.id)!
    expect(cs.score).toBe(0.90)
    expect(cs.flags).toEqual([])
    expect(cs.explanation).toBe('Source is in the trusted allowlist')
  })

  it('allowlist domain + tier 2 → score 0.65, flag unconfirmed_tier', () => {
    const { id: sourceId } = createSource(db, { name: 'BBC', url: 'https://feeds.bbc.co.uk/rss', type: 'rss', trust_tier: 2 })
    insertArticle(db, {
      source_id: sourceId, url: 'https://bbc.com/news/1',
      title: 'T', body_text: '', author: '', published_at: '2026-01-01T00:00:00Z', url_hash: 'h2',
    })
    const article = getArticleByUrlHash(db, 'h2')!
    scoreArticle(db, article)
    const cs = getCredibilityScore(db, article.id)!
    expect(cs.score).toBe(0.65)
    expect(cs.flags).toContain('unconfirmed_tier')
  })

  it('unknown domain + tier 2 → score 0.40, flag unknown_source', () => {
    const { id: sourceId } = createSource(db, { name: 'Blog', url: 'https://randomblog.example.com/rss', type: 'rss', trust_tier: 2 })
    insertArticle(db, {
      source_id: sourceId, url: 'https://randomblog.example.com/post/1',
      title: 'T', body_text: '', author: '', published_at: '2026-01-01T00:00:00Z', url_hash: 'h3',
    })
    const article = getArticleByUrlHash(db, 'h3')!
    scoreArticle(db, article)
    const cs = getCredibilityScore(db, article.id)!
    expect(cs.score).toBe(0.40)
    expect(cs.flags).toContain('unknown_source')
  })

  it('tier 3 source → score ≤ 0.15, flag flagged_source', () => {
    const { id: sourceId } = createSource(db, { name: 'Flagged', url: 'https://flagged.example.com/rss', type: 'rss', trust_tier: 3 })
    insertArticle(db, {
      source_id: sourceId, url: 'https://flagged.example.com/1',
      title: 'T', body_text: '', author: '', published_at: '2026-01-01T00:00:00Z', url_hash: 'h4',
    })
    const article = getArticleByUrlHash(db, 'h4')!
    scoreArticle(db, article)
    const cs = getCredibilityScore(db, article.id)!
    expect(cs.score).toBeLessThanOrEqual(0.15)
    expect(cs.flags).toContain('flagged_source')
  })

  it('malformed URL → score 0.40, flag parse_error', () => {
    const { id: sourceId } = createSource(db, { name: 'Broken', url: 'https://broken.example.com/rss', type: 'rss', trust_tier: 2 })
    insertArticle(db, {
      source_id: sourceId, url: 'not-a-url',
      title: 'T', body_text: '', author: '', published_at: '2026-01-01T00:00:00Z', url_hash: 'h5',
    })
    const article = getArticleByUrlHash(db, 'h5')!
    scoreArticle(db, article)
    const cs = getCredibilityScore(db, article.id)!
    expect(cs.score).toBe(0.40)
    expect(cs.flags).toContain('parse_error')
    expect(cs.explanation).toBe('Could not determine source domain')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `scoreArticle` not found

- [ ] **Step 3: Create `trusted-sources.json`**

Create `src/main/credibility/trusted-sources.json`:

```json
[
  { "domain": "reuters.com", "label": "Reuters" },
  { "domain": "apnews.com", "label": "AP News" },
  { "domain": "bbc.com", "label": "BBC" },
  { "domain": "bbc.co.uk", "label": "BBC UK" },
  { "domain": "theguardian.com", "label": "The Guardian" },
  { "domain": "npr.org", "label": "NPR" },
  { "domain": "nytimes.com", "label": "New York Times" },
  { "domain": "washingtonpost.com", "label": "Washington Post" },
  { "domain": "economist.com", "label": "The Economist" },
  { "domain": "ft.com", "label": "Financial Times" },
  { "domain": "wsj.com", "label": "Wall Street Journal" },
  { "domain": "bloomberg.com", "label": "Bloomberg" },
  { "domain": "nature.com", "label": "Nature" },
  { "domain": "sciencemag.org", "label": "Science Magazine" },
  { "domain": "arstechnica.com", "label": "Ars Technica" },
  { "domain": "wired.com", "label": "Wired" },
  { "domain": "theatlantic.com", "label": "The Atlantic" },
  { "domain": "newyorker.com", "label": "The New Yorker" },
  { "domain": "propublica.org", "label": "ProPublica" },
  { "domain": "politifact.com", "label": "PolitiFact" },
  { "domain": "snopes.com", "label": "Snopes" },
  { "domain": "factcheck.org", "label": "FactCheck.org" },
  { "domain": "abcnews.go.com", "label": "ABC News" },
  { "domain": "cbsnews.com", "label": "CBS News" },
  { "domain": "nbcnews.com", "label": "NBC News" },
  { "domain": "cnn.com", "label": "CNN" },
  { "domain": "pbs.org", "label": "PBS" },
  { "domain": "vox.com", "label": "Vox" },
  { "domain": "fivethirtyeight.com", "label": "FiveThirtyEight" },
  { "domain": "statista.com", "label": "Statista" },
  { "domain": "who.int", "label": "World Health Organization" },
  { "domain": "cdc.gov", "label": "CDC" },
  { "domain": "nih.gov", "label": "NIH" },
  { "domain": "nasa.gov", "label": "NASA" },
  { "domain": "techcrunch.com", "label": "TechCrunch" },
  { "domain": "theverge.com", "label": "The Verge" },
  { "domain": "ycombinator.com", "label": "Y Combinator" }
]
```

- [ ] **Step 4: Create `scorer.ts`**

Create `src/main/credibility/scorer.ts`:

```typescript
import type Database from 'better-sqlite3'
import type { Article } from '../db/types'
import { upsertCredibilityScore } from '../db/queries'
import trustedSources from './trusted-sources.json'

const allowlistDomains = new Set(trustedSources.map(s => s.domain))

interface SourceRow { trust_tier: 1 | 2 | 3 }

export function scoreArticle(db: InstanceType<typeof Database>, article: Article): void {
  const sourceRow = db.prepare('SELECT trust_tier FROM sources WHERE id = ?').get(article.source_id) as SourceRow | null
  const tier: 1 | 2 | 3 = (sourceRow?.trust_tier ?? 2) as 1 | 2 | 3

  let domain: string
  try {
    const hostname = new URL(article.url).hostname
    domain = hostname.replace(/^www\./, '')
  } catch {
    upsertCredibilityScore(db, article.id, {
      score: 0.40,
      tier,
      flags: ['parse_error'],
      explanation: 'Could not determine source domain',
    })
    return
  }

  const inAllowlist = allowlistDomains.has(domain)

  let score: number
  let flags: string[]
  let explanation: string

  if (inAllowlist) {
    if (tier === 1) {
      score = 0.90; flags = []; explanation = 'Source is in the trusted allowlist'
    } else if (tier === 2) {
      score = 0.65; flags = ['unconfirmed_tier']; explanation = 'Known source, not yet verified by you — promote to Tier 1 in Settings'
    } else {
      score = 0.15; flags = ['flagged_source']; explanation = 'Source has been manually flagged'
    }
  } else {
    if (tier === 1) {
      score = 0.75; flags = ['not_in_allowlist']; explanation = 'Manually trusted, not in the built-in allowlist'
    } else if (tier === 2) {
      score = 0.40; flags = ['unknown_source']; explanation = 'Source reputation is unverified'
    } else {
      score = 0.10; flags = ['flagged_source']; explanation = 'Source has been manually flagged'
    }
  }

  upsertCredibilityScore(db, article.id, { score, tier, flags, explanation })
}
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All 5 new scorer tests PASS, all prior tests still PASS

- [ ] **Step 6: Run type-check**

Run: `npm run typecheck`
Expected: PASS. If TypeScript complains about importing `.json`, ensure `tsconfig.node.json` has `"resolveJsonModule": true`.

- [ ] **Step 7: Commit**

```bash
git -C /Users/izaz/Desktop/content-aggregator add src/main/credibility/ tests/main/credibility/
git -C /Users/izaz/Desktop/content-aggregator commit -m "feat: credibility scorer with trusted-sources allowlist"
```

---

### Task 4: Scheduler Integration + IPC Const Cleanup

**Files:**
- Modify: `src/main/ingestion/scheduler.ts`
- Modify: `src/main/ipc/categories.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `scoreArticle(db, article)` from Task 3; `IPC.CATEGORIES_ADD_KEYWORD` etc. from Task 1
- Produces: articles are scored immediately after categorization; keyword IPC channels use const names throughout

- [ ] **Step 1: Update `scheduler.ts` to call `scoreArticle`**

Replace `src/main/ingestion/scheduler.ts` with:

```typescript
import cron from 'node-cron'
import { openDb } from '../db/connection'
import { listSources } from '../db/queries'
import { fetchSource } from './rss-fetcher'
import { categorizeArticle } from '../categorization/keyword-rules'
import { scoreArticle } from '../credibility/scorer'
import type Database from 'better-sqlite3'

let task: ReturnType<typeof cron.schedule> | null = null

async function runIngestion(db: InstanceType<typeof Database>): Promise<void> {
  const sources = listSources(db).filter(s => s.active === 1)
  for (const source of sources) {
    try {
      await fetchSource(db, source)
      const uncategorized = db.prepare(`
        SELECT a.* FROM articles a
        LEFT JOIN article_categories ac ON ac.article_id = a.id
        WHERE a.source_id = ? AND ac.article_id IS NULL
      `).all(source.id) as any[]
      for (const article of uncategorized) {
        categorizeArticle(db, article)
      }
      const unscored = db.prepare(`
        SELECT a.* FROM articles a
        LEFT JOIN credibility_scores cs ON cs.article_id = a.id
        WHERE a.source_id = ? AND cs.article_id IS NULL
      `).all(source.id) as any[]
      for (const article of unscored) {
        try {
          scoreArticle(db, article)
        } catch (err) {
          console.error(`[scheduler] Failed to score article ${article.id}:`, err)
        }
      }
    } catch (err) {
      console.error(`[scheduler] Failed to fetch source ${source.id} (${source.url}):`, err)
    }
  }
}

export function startScheduler(): void {
  if (task) return
  const db = openDb()
  task = cron.schedule('*/15 * * * *', () => runIngestion(db))
}

export function stopScheduler(): void {
  task?.stop()
  task = null
}

export async function fetchAllNow(): Promise<void> {
  const db = openDb()
  await runIngestion(db)
}
```

- [ ] **Step 2: Update `ipc/categories.ts` to use IPC const**

Replace `src/main/ipc/categories.ts` with:

```typescript
import { ipcMain } from 'electron'
import { openDb } from '../db/connection'
import {
  listCategories, createCategory, updateCategory, deleteCategory,
  addKeyword, removeKeyword, listKeywords
} from '../db/queries'
import { IPC } from '../db/types'

export function registerCategoryHandlers(): void {
  ipcMain.handle(IPC.CATEGORIES_LIST, () => listCategories(openDb()))
  ipcMain.handle(IPC.CATEGORIES_CREATE, (_e, data) => createCategory(openDb(), data))
  ipcMain.handle(IPC.CATEGORIES_UPDATE, (_e, id, data) => updateCategory(openDb(), id, data))
  ipcMain.handle(IPC.CATEGORIES_DELETE, (_e, id) => deleteCategory(openDb(), id))
  ipcMain.handle(IPC.CATEGORIES_ADD_KEYWORD, (_e, catId, keyword) => addKeyword(openDb(), catId, keyword))
  ipcMain.handle(IPC.CATEGORIES_REMOVE_KEYWORD, (_e, keywordId) => removeKeyword(openDb(), keywordId))
  ipcMain.handle(IPC.CATEGORIES_LIST_KEYWORDS, (_e, catId) => listKeywords(openDb(), catId))
}
```

- [ ] **Step 3: Update `preload/index.ts` to use IPC const**

Replace `src/preload/index.ts` with:

```typescript
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../main/db/types'
import type { Source, Category, ArticleWithMeta, SearchParams } from '../main/db/types'

const api = {
  sources: {
    list: (): Promise<Source[]> => ipcRenderer.invoke(IPC.SOURCES_LIST),
    create: (data: Pick<Source, 'name' | 'url' | 'type' | 'trust_tier'>): Promise<{ id: number }> =>
      ipcRenderer.invoke(IPC.SOURCES_CREATE, data),
    update: (id: number, data: Partial<Source>): Promise<void> =>
      ipcRenderer.invoke(IPC.SOURCES_UPDATE, id, data),
    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke(IPC.SOURCES_DELETE, id),
    fetchNow: (): Promise<void> =>
      ipcRenderer.invoke(IPC.SOURCES_FETCH_NOW),
  },
  articles: {
    getFeed: (params: Omit<SearchParams, 'query'>): Promise<ArticleWithMeta[]> =>
      ipcRenderer.invoke(IPC.ARTICLES_FEED, params),
    search: (params: SearchParams): Promise<ArticleWithMeta[]> =>
      ipcRenderer.invoke(IPC.ARTICLES_SEARCH, params),
  },
  categories: {
    list: (): Promise<Category[]> => ipcRenderer.invoke(IPC.CATEGORIES_LIST),
    create: (data: Pick<Category, 'name' | 'color'>): Promise<{ id: number }> =>
      ipcRenderer.invoke(IPC.CATEGORIES_CREATE, data),
    update: (id: number, data: Partial<Category>): Promise<void> =>
      ipcRenderer.invoke(IPC.CATEGORIES_UPDATE, id, data),
    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke(IPC.CATEGORIES_DELETE, id),
    addKeyword: (catId: number, keyword: string): Promise<void> =>
      ipcRenderer.invoke(IPC.CATEGORIES_ADD_KEYWORD, catId, keyword),
    removeKeyword: (keywordId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.CATEGORIES_REMOVE_KEYWORD, keywordId),
    listKeywords: (catId: number): Promise<Array<{ id: number; category_id: number; keyword: string }>> =>
      ipcRenderer.invoke(IPC.CATEGORIES_LIST_KEYWORDS, catId),
  },
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
```

- [ ] **Step 4: Run type-check**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All tests PASS (scheduler has no unit tests — it's covered by integration)

- [ ] **Step 6: Commit**

```bash
git -C /Users/izaz/Desktop/content-aggregator add src/main/ingestion/scheduler.ts src/main/ipc/categories.ts src/preload/index.ts
git -C /Users/izaz/Desktop/content-aggregator commit -m "feat: integrate scorer into ingestion pipeline and clean up keyword IPC consts"
```

---

### Task 5: CredibilityBadge Component + ArticleCard

**Files:**
- Create: `src/renderer/src/components/CredibilityBadge.tsx`
- Modify: `src/renderer/src/components/ArticleCard.tsx`
- Create: `tests/renderer/components/CredibilityBadge.test.tsx`

**Interfaces:**
- Consumes: `ArticleWithMeta['credibility']` from Task 1 types
- Produces: `<CredibilityBadge credibility={...} />` — renders colored pill or nothing when undefined

- [ ] **Step 1: Write failing tests**

Create `tests/renderer/components/CredibilityBadge.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { CredibilityBadge } from '../../../src/renderer/src/components/CredibilityBadge'

it('score 0.90 → green "Trusted" badge', () => {
  render(<CredibilityBadge credibility={{ score: 0.90, tier: 1, flags: [], explanation: 'trusted' }} />)
  const badge = screen.getByText('Trusted')
  expect(badge).toBeInTheDocument()
  expect(badge).toHaveStyle({ backgroundColor: expect.stringContaining('') })
  expect(badge.className).toMatch(/green/)
})

it('score 0.55 → yellow "Unverified" badge', () => {
  render(<CredibilityBadge credibility={{ score: 0.55, tier: 2, flags: ['unconfirmed_tier'], explanation: 'unverified' }} />)
  expect(screen.getByText('Unverified')).toBeInTheDocument()
  expect(screen.getByText('Unverified').className).toMatch(/yellow/)
})

it('score 0.10 → red "Flagged" badge', () => {
  render(<CredibilityBadge credibility={{ score: 0.10, tier: 3, flags: ['flagged_source'], explanation: 'flagged' }} />)
  expect(screen.getByText('Flagged')).toBeInTheDocument()
  expect(screen.getByText('Flagged').className).toMatch(/red/)
})

it('undefined credibility → renders nothing', () => {
  const { container } = render(<CredibilityBadge credibility={undefined} />)
  expect(container).toBeEmptyDOMElement()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:renderer`
Expected: FAIL — `CredibilityBadge` not found

- [ ] **Step 3: Create `CredibilityBadge.tsx`**

Create `src/renderer/src/components/CredibilityBadge.tsx`:

```tsx
import type { ArticleWithMeta } from '../types'

interface Props {
  credibility?: ArticleWithMeta['credibility']
}

export function CredibilityBadge({ credibility }: Props) {
  if (!credibility) return null

  let label: string
  let colorClass: string

  if (credibility.score >= 0.80) {
    label = 'Trusted'
    colorClass = 'bg-green-100 text-green-800'
  } else if (credibility.score >= 0.50) {
    label = 'Unverified'
    colorClass = 'bg-yellow-100 text-yellow-800'
  } else {
    label = 'Flagged'
    colorClass = 'bg-red-100 text-red-800'
  }

  return (
    <span
      className={`text-xs rounded-full px-2 py-0.5 font-medium ${colorClass}`}
      title={credibility.explanation}
    >
      {label}
    </span>
  )
}
```

- [ ] **Step 4: Add `CredibilityBadge` to `ArticleCard.tsx`**

In `src/renderer/src/components/ArticleCard.tsx`, add the import and render the badge below the categories block. Replace the file content:

```tsx
import type { ArticleWithMeta } from '../types'
import { CredibilityBadge } from './CredibilityBadge'

interface Props { article: ArticleWithMeta }

export function ArticleCard({ article }: Props) {
  const date = new Date(article.published_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric'
  })

  return (
    <article className="border rounded-lg p-4 flex flex-col gap-1 hover:shadow-sm transition-shadow">
      <a href={article.url} target="_blank" rel="noopener noreferrer"
         className="font-semibold text-blue-700 hover:underline leading-tight">
        {article.title}
      </a>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>{article.source_name}</span>
        <span>·</span>
        <span>{date}</span>
        {article.author && <><span>·</span><span>{article.author}</span></>}
      </div>
      {article.categories.length > 0 && (
        <div className="flex gap-1 flex-wrap mt-1">
          {article.categories.map(c => (
            <span key={c.id}
              className="text-xs rounded-full px-2 py-0.5 font-medium"
              style={{ background: c.color + '20', color: c.color }}
            >
              {c.name}
            </span>
          ))}
        </div>
      )}
      <div className="mt-1">
        <CredibilityBadge credibility={article.credibility} />
      </div>
      {article.body_text && (
        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{article.body_text}</p>
      )}
    </article>
  )
}
```

- [ ] **Step 5: Run renderer tests**

Run: `npm run test:renderer`
Expected: All 4 new badge tests PASS + the 3 existing ArticleCard tests PASS

- [ ] **Step 6: Run type-check**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git -C /Users/izaz/Desktop/content-aggregator add src/renderer/src/components/CredibilityBadge.tsx src/renderer/src/components/ArticleCard.tsx tests/renderer/components/CredibilityBadge.test.tsx
git -C /Users/izaz/Desktop/content-aggregator commit -m "feat: CredibilityBadge component with green/yellow/red tiers, wired into ArticleCard"
```

---

### Task 6: Settings — Source Trust Tier Editor + Keyword Management

**Files:**
- Modify: `src/renderer/src/pages/Settings.tsx`

**Interfaces:**
- Consumes: `window.api.sources.update(id, { trust_tier })`, `window.api.categories.listKeywords(catId)`, `window.api.categories.addKeyword(catId, keyword)`, `window.api.categories.removeKeyword(keywordId)` — all wired in Task 4

- [ ] **Step 1: Add trust tier selector and keyword management to `Settings.tsx`**

Replace `src/renderer/src/pages/Settings.tsx` with:

```tsx
import { useEffect, useState } from 'react'
import { SourceForm } from '../components/SourceForm'
import type { Source, Category } from '../types'

interface CategoryKeyword { id: number; category_id: number; keyword: string }

export function Settings() {
  const [sources, setSources] = useState<Source[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState('#3b82f6')
  const [isFetching, setIsFetching] = useState(false)
  const [expandedCatId, setExpandedCatId] = useState<number | null>(null)
  const [keywords, setKeywords] = useState<CategoryKeyword[]>([])
  const [newKeyword, setNewKeyword] = useState('')

  async function loadSources() { setSources(await window.api.sources.list()) }
  async function loadCategories() { setCategories(await window.api.categories.list()) }

  useEffect(() => { loadSources(); loadCategories() }, [])

  async function handleAddSource(data: Parameters<typeof window.api.sources.create>[0]) {
    await window.api.sources.create(data)
    loadSources()
  }

  async function handleToggleSource(s: Source) {
    await window.api.sources.update(s.id, { active: s.active === 1 ? 0 : 1 })
    loadSources()
  }

  async function handleDeleteSource(id: number) {
    await window.api.sources.delete(id)
    loadSources()
  }

  async function handleTierChange(id: number, tier: number) {
    await window.api.sources.update(id, { trust_tier: tier as 1 | 2 | 3 })
    loadSources()
  }

  async function handleFetchNow() {
    setIsFetching(true)
    await window.api.sources.fetchNow()
    setIsFetching(false)
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!newCatName.trim()) return
    await window.api.categories.create({ name: newCatName.trim(), color: newCatColor })
    setNewCatName('')
    loadCategories()
  }

  async function handleDeleteCategory(id: number) {
    await window.api.categories.delete(id)
    if (expandedCatId === id) setExpandedCatId(null)
    loadCategories()
  }

  async function handleExpandCategory(catId: number) {
    if (expandedCatId === catId) {
      setExpandedCatId(null)
      return
    }
    setExpandedCatId(catId)
    setNewKeyword('')
    setKeywords(await window.api.categories.listKeywords(catId))
  }

  async function handleRemoveKeyword(keywordId: number) {
    await window.api.categories.removeKeyword(keywordId)
    if (expandedCatId !== null) {
      setKeywords(await window.api.categories.listKeywords(expandedCatId))
    }
  }

  async function handleAddKeyword(e: React.FormEvent) {
    e.preventDefault()
    if (!newKeyword.trim() || expandedCatId === null) return
    await window.api.categories.addKeyword(expandedCatId, newKeyword.trim())
    setNewKeyword('')
    setKeywords(await window.api.categories.listKeywords(expandedCatId))
  }

  const tierLabel: Record<number, string> = {
    1: 'Tier 1 — Trusted',
    2: 'Tier 2 — Unknown',
    3: 'Tier 3 — Flagged',
  }

  return (
    <div className="max-w-2xl mx-auto p-6 flex flex-col gap-8">
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Sources</h2>
          <button
            onClick={handleFetchNow}
            disabled={isFetching}
            className="text-sm bg-green-600 text-white rounded px-3 py-1 hover:bg-green-700 disabled:opacity-50"
          >
            {isFetching ? 'Fetching…' : 'Fetch Now'}
          </button>
        </div>
        <SourceForm onSave={handleAddSource} />
        <ul className="mt-4 flex flex-col gap-2">
          {sources.map(s => (
            <li key={s.id} className="flex items-center justify-between border rounded p-2 text-sm">
              <div>
                <span className="font-medium">{s.name}</span>
                <span className="ml-2 text-gray-500 text-xs">{s.url}</span>
              </div>
              <div className="flex gap-2 items-center">
                <select
                  value={s.trust_tier}
                  onChange={e => handleTierChange(s.id, Number(e.target.value))}
                  className="text-xs border rounded px-1 py-0.5"
                >
                  <option value={1}>{tierLabel[1]}</option>
                  <option value={2}>{tierLabel[2]}</option>
                  <option value={3}>{tierLabel[3]}</option>
                </select>
                <button
                  onClick={() => handleToggleSource(s)}
                  className={`text-xs rounded px-2 py-0.5 ${s.active === 1 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}
                >
                  {s.active === 1 ? 'Active' : 'Paused'}
                </button>
                <button onClick={() => handleDeleteSource(s.id)} className="text-xs text-red-600 hover:underline">
                  Remove
                </button>
              </div>
            </li>
          ))}
          {sources.length === 0 && <p className="text-sm text-gray-400">No sources yet. Add one above.</p>}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">Categories</h2>
        <form onSubmit={handleAddCategory} className="flex gap-2 items-center">
          <input
            className="border rounded px-2 py-1 text-sm flex-1"
            placeholder="Category name"
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
          />
          <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)} className="h-8 w-10 rounded" />
          <button type="submit" className="bg-blue-600 text-white rounded px-3 py-1 text-sm hover:bg-blue-700">Add</button>
        </form>
        <ul className="mt-4 flex flex-col gap-2">
          {categories.map(c => (
            <li key={c.id} className="border rounded text-sm">
              <div className="flex items-center justify-between p-2">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: c.color }} />
                  <span className="font-medium">{c.name}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExpandCategory(c.id)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {expandedCatId === c.id ? 'Hide keywords' : 'Keywords'}
                  </button>
                  <button onClick={() => handleDeleteCategory(c.id)} className="text-xs text-red-600 hover:underline">
                    Remove
                  </button>
                </div>
              </div>
              {expandedCatId === c.id && (
                <div className="border-t px-3 py-2 flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1">
                    {keywords.map(kw => (
                      <span key={kw.id} className="flex items-center gap-1 text-xs bg-gray-100 rounded-full px-2 py-0.5">
                        {kw.keyword}
                        <button
                          onClick={() => handleRemoveKeyword(kw.id)}
                          className="text-gray-400 hover:text-red-600 leading-none"
                          aria-label={`Remove keyword ${kw.keyword}`}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    {keywords.length === 0 && <span className="text-gray-400 text-xs">No keywords yet.</span>}
                  </div>
                  <form onSubmit={handleAddKeyword} className="flex gap-2">
                    <input
                      className="border rounded px-2 py-1 text-xs flex-1"
                      placeholder="Add keyword…"
                      value={newKeyword}
                      onChange={e => setNewKeyword(e.target.value)}
                    />
                    <button type="submit" className="bg-blue-600 text-white rounded px-2 py-1 text-xs hover:bg-blue-700">
                      Add
                    </button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Run type-check**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git -C /Users/izaz/Desktop/content-aggregator add src/renderer/src/pages/Settings.tsx
git -C /Users/izaz/Desktop/content-aggregator commit -m "feat: Settings source trust tier selector and keyword management UI"
```

---

### Task 7: Home Sort-by-Source Fix

**Files:**
- Modify: `src/renderer/src/pages/Home.tsx`

**Interfaces:**
- Consumes: existing `query`, `sortBy`, `setSortBy` state — no new APIs needed

- [ ] **Step 1: Update `Home.tsx` to disable and auto-reset sort-by-source when query is active**

Replace `src/renderer/src/pages/Home.tsx` with:

```tsx
import { useEffect, useState, useCallback } from 'react'
import { SearchBar } from '../components/SearchBar'
import { CategoryToggle } from '../components/CategoryToggle'
import { FeedView } from '../components/FeedView'
import type { ArticleWithMeta, Category, SearchParams } from '../types'

type SortBy = 'date' | 'relevance' | 'source'

export function Home() {
  const [articles, setArticles] = useState<ArticleWithMeta[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('date')
  const [isLoading, setIsLoading] = useState(false)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 30

  const load = useCallback(async () => {
    setIsLoading(true)
    const params: SearchParams = {
      query: query.trim() || undefined,
      category_id: selectedCategory ?? undefined,
      sort_by: sortBy,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }
    const result = query.trim()
      ? await window.api.articles.search(params)
      : await window.api.articles.getFeed(params)
    setArticles(result)
    setIsLoading(false)
  }, [query, selectedCategory, sortBy, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { window.api.categories.list().then(setCategories) }, [])

  function handleQueryChange(q: string) {
    if (q.trim() && sortBy === 'source') setSortBy('date')
    setQuery(q)
    setPage(0)
  }

  function handleCategorySelect(id: number | null) { setSelectedCategory(id); setPage(0) }

  const queryActive = query.trim().length > 0

  return (
    <div className="max-w-2xl mx-auto p-6 flex flex-col gap-4">
      <SearchBar value={query} onChange={handleQueryChange} />
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <CategoryToggle
          categories={categories}
          selectedId={selectedCategory}
          onSelect={handleCategorySelect}
        />
        <select
          className="text-xs border rounded px-2 py-1"
          value={sortBy}
          onChange={e => { setSortBy(e.target.value as SortBy); setPage(0) }}
        >
          <option value="date">Sort: Newest</option>
          <option value="relevance">Sort: Relevance</option>
          <option value="source" disabled={queryActive}>Sort: Source</option>
        </select>
      </div>
      <FeedView articles={articles} isLoading={isLoading} />
      {articles.length === PAGE_SIZE && (
        <button
          onClick={() => setPage(p => p + 1)}
          className="text-sm text-blue-600 hover:underline text-center"
        >
          Load more
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run type-check**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Run all tests**

Run: `npm test && npm run test:renderer`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git -C /Users/izaz/Desktop/content-aggregator add src/renderer/src/pages/Home.tsx
git -C /Users/izaz/Desktop/content-aggregator commit -m "fix: disable sort-by-source and auto-reset to date when search query is active"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| `credibility_scores` table with correct columns | Task 1 |
| `CredibilityScore` interface, `credibility?` on `ArticleWithMeta` | Task 1 |
| `CATEGORIES_ADD/REMOVE/LIST_KEYWORD` in `IPC` const | Task 1 |
| `upsertCredibilityScore` + `getCredibilityScore` | Task 2 |
| `getFeed` + `searchArticles` LEFT JOIN credibility_scores | Task 2 |
| `trusted-sources.json` bundled allowlist with 37 domains | Task 3 |
| `scoreArticle(db, article)` with full 6-cell score matrix | Task 3 |
| URL parse error → score 0.40, flag `parse_error` | Task 3 |
| Wrap `scoreArticle` in try/catch in scheduler | Task 4 |
| `ipc/categories.ts` uses `IPC` const | Task 4 |
| `preload/index.ts` uses `IPC` const | Task 4 |
| `CredibilityBadge` green/yellow/red pill with hover tooltip | Task 5 |
| `ArticleCard` includes `CredibilityBadge` | Task 5 |
| Settings source trust tier `<select>` calls `sources.update` | Task 6 |
| Settings keyword expand, list, add, remove per category | Task 6 |
| Home disables "Sort: Source" when query active | Task 7 |
| Home auto-resets sortBy to 'date' when query typed while on 'source' | Task 7 |

All spec requirements are covered. No gaps found.

### Placeholder scan

No TBD, TODO, or incomplete sections found.

### Type consistency

- `upsertCredibilityScore` parameter type `{ score, tier, flags: string[], explanation }` is consistent across Tasks 2, 3.
- `scoreArticle(db: InstanceType<typeof Database>, article: Article)` — `Article` is imported from `../db/types` in Task 3; the scheduler passes raw DB rows that match this shape.
- `IPC.CATEGORIES_ADD_KEYWORD` etc. defined in Task 1, consumed in Tasks 4 (two files).
- `CredibilityBadge` prop type `ArticleWithMeta['credibility']` is optional — matches Task 1 definition.

### Review Focus coverage

- **Missing credibility row** — tested in Task 2 (`getFeed includes credibility when score exists, undefined when not`).
- **URL parse errors** — tested in Task 3 (`malformed URL → score 0.40, flag parse_error`).
- **Sort-by-source auto-reset** — addressed in Home.tsx `handleQueryChange`; note: no automated test covers this UI behavior because it's a React page without a `window.api` mock setup. Mark as manual-test item: "type a search query while Sort: Source is selected → verify it switches to Sort: Newest."
- **Keyword expand state isolation** — no automated test covers this multi-category isolation; mark as manual-test item: "add two categories, expand one's keywords → verify the other remains collapsed."
- **IPC const mismatch** — all three files updated atomically in Task 4; type-check in Step 4 validates the strings are consistent.
