import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../../src/main/db/schema'
import {
  createSource, listSources, updateSource, deleteSource,
  createCategory, listCategories,
  insertArticle, getArticleByUrlHash, searchArticles
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
