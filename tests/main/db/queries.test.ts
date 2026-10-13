import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../../src/main/db/schema'
import {
  createSource, listSources, updateSource, deleteSource,
  createCategory, listCategories,
  insertArticle, getArticleByUrlHash, searchArticles,
  upsertCredibilityScore, getCredibilityScore, getFeed
} from '../../../src/main/db/queries'

let db: InstanceType<typeof Database>

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
})

afterEach(() => {
  db.close()
})

describe('sources', () => {
  it('creates and lists a source', () => {
    createSource(db, { name: 'Test Feed', url: 'https://example.com/rss', type: 'rss', trust_tier: 1 })
    const sources = listSources(db)
    expect(sources).toHaveLength(1)
    expect(sources[0].name).toBe('Test Feed')
    expect(sources[0].active).toBe(1)
  })

  it('updates a source active flag', () => {
    const { id } = createSource(db, { name: 'Feed', url: 'https://x.com/rss', type: 'nitter', trust_tier: 2 })
    updateSource(db, id, { active: 0 })
    const sources = listSources(db)
    expect(sources[0].active).toBe(0)
  })

  it('deletes a source', () => {
    const { id } = createSource(db, { name: 'Feed', url: 'https://x.com/rss', type: 'rss', trust_tier: 2 })
    deleteSource(db, id)
    expect(listSources(db)).toHaveLength(0)
  })
})

describe('articles', () => {
  it('inserts an article and deduplicates by url_hash', () => {
    const { id: sourceId } = createSource(db, { name: 'F', url: 'https://f.com/rss', type: 'rss', trust_tier: 1 })
    const article = {
      source_id: sourceId,
      url: 'https://example.com/post/1',
      title: 'Hello World',
      body_text: 'Some content here',
      author: 'Jane',
      published_at: '2026-01-01T00:00:00Z',
      url_hash: 'abc123',
    }
    insertArticle(db, article)
    insertArticle(db, article)  // second insert should be silently ignored
    const found = getArticleByUrlHash(db, 'abc123')
    expect(found).not.toBeNull()
    expect(found!.title).toBe('Hello World')
  })

  it('FTS5 search finds articles by title keyword', () => {
    const { id: sourceId } = createSource(db, { name: 'F', url: 'https://f.com/rss', type: 'rss', trust_tier: 1 })
    insertArticle(db, {
      source_id: sourceId, url: 'https://a.com/1', title: 'TypeScript is great',
      body_text: 'content', author: 'Bob', published_at: '2026-01-01T00:00:00Z', url_hash: 'h1',
    })
    insertArticle(db, {
      source_id: sourceId, url: 'https://a.com/2', title: 'Python news',
      body_text: 'content', author: 'Alice', published_at: '2026-01-02T00:00:00Z', url_hash: 'h2',
    })
    const results = searchArticles(db, { query: 'TypeScript', sort_by: 'relevance', limit: 10, offset: 0 })
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('TypeScript is great')
  })
})

describe('categories', () => {
  it('creates and lists categories', () => {
    createCategory(db, { name: 'Tech', color: '#3b82f6' })
    const cats = listCategories(db)
    expect(cats).toHaveLength(1)
    expect(cats[0].name).toBe('Tech')
  })
})

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
