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
