import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../../src/main/db/schema'
import { createSource, createCategory, addKeyword, insertArticle,
         listCategories, assignCategory, getAllKeywordRules } from '../../../src/main/db/queries'
import { categorizeArticle } from '../../../src/main/categorization/keyword-rules'

let db: InstanceType<typeof Database>

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
})
afterEach(() => db.close())

it('assigns matching category when keyword found in title', () => {
  const { id: sourceId } = createSource(db, { name: 'S', url: 'https://s.com/rss', type: 'rss', trust_tier: 1 })
  const { id: catId } = createCategory(db, { name: 'Tech', color: '#000' })
  addKeyword(db, catId, 'typescript')

  insertArticle(db, {
    source_id: sourceId, url: 'https://a.com/1',
    title: 'TypeScript 5.8 released', body_text: 'details here',
    author: '', published_at: '2026-01-01T00:00:00Z', url_hash: 'h1',
  })

  const article = db.prepare('SELECT * FROM articles WHERE url_hash = ?').get('h1') as any
  categorizeArticle(db, article)

  const assigned = db.prepare(
    'SELECT * FROM article_categories WHERE article_id = ? AND category_id = ?'
  ).get(article.id, catId)
  expect(assigned).not.toBeNull()
})

it('does not assign category when keyword is absent', () => {
  const { id: sourceId } = createSource(db, { name: 'S', url: 'https://s.com/rss', type: 'rss', trust_tier: 1 })
  const { id: catId } = createCategory(db, { name: 'Sports', color: '#0f0' })
  addKeyword(db, catId, 'soccer')

  insertArticle(db, {
    source_id: sourceId, url: 'https://a.com/2',
    title: 'TypeScript 5.8 released', body_text: 'no sports here',
    author: '', published_at: '2026-01-01T00:00:00Z', url_hash: 'h2',
  })

  const article = db.prepare('SELECT * FROM articles WHERE url_hash = ?').get('h2') as any
  categorizeArticle(db, article)

  const assigned = db.prepare('SELECT * FROM article_categories WHERE article_id = ?').all(article.id)
  expect(assigned).toHaveLength(0)
})

it('assigns multiple categories when multiple keyword rules match', () => {
  const { id: sourceId } = createSource(db, { name: 'S', url: 'https://s.com/rss', type: 'rss', trust_tier: 1 })
  const { id: cat1 } = createCategory(db, { name: 'AI', color: '#00f' })
  const { id: cat2 } = createCategory(db, { name: 'Tech', color: '#f00' })
  addKeyword(db, cat1, 'llm')
  addKeyword(db, cat2, 'typescript')

  insertArticle(db, {
    source_id: sourceId, url: 'https://a.com/3',
    title: 'Using TypeScript with LLM APIs', body_text: 'content',
    author: '', published_at: '2026-01-01T00:00:00Z', url_hash: 'h3',
  })

  const article = db.prepare('SELECT * FROM articles WHERE url_hash = ?').get('h3') as any
  categorizeArticle(db, article)

  const assigned = db.prepare('SELECT * FROM article_categories WHERE article_id = ?').all(article.id)
  expect(assigned).toHaveLength(2)
})
