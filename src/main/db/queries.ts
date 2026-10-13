import type Database from 'better-sqlite3'
import crypto from 'crypto'
import type { Source, Article, Category, ArticleWithMeta, SearchParams } from './types'

export type { Source, Article, Category, ArticleWithMeta, SearchParams }

// ── Sources ──────────────────────────────────────────────────────────────────

export function listSources(db: InstanceType<typeof Database>): Source[] {
  return db.prepare('SELECT * FROM sources ORDER BY name').all() as Source[]
}

export function createSource(
  db: InstanceType<typeof Database>,
  data: Pick<Source, 'name' | 'url' | 'type' | 'trust_tier'>
): { id: number } {
  const result = db.prepare(
    'INSERT INTO sources (name, url, type, trust_tier) VALUES (?, ?, ?, ?)'
  ).run(data.name, data.url, data.type, data.trust_tier)
  return { id: Number(result.lastInsertRowid) }
}

export function updateSource(
  db: InstanceType<typeof Database>,
  id: number,
  data: Partial<Pick<Source, 'name' | 'url' | 'active' | 'trust_tier' | 'last_fetched_at'>>
): void {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
  db.prepare(`UPDATE sources SET ${fields} WHERE id = ?`).run(...Object.values(data), id)
}

export function deleteSource(db: InstanceType<typeof Database>, id: number): void {
  db.prepare('DELETE FROM sources WHERE id = ?').run(id)
}

// ── Articles ──────────────────────────────────────────────────────────────────

export function insertArticle(
  db: InstanceType<typeof Database>,
  data: Omit<Article, 'id' | 'fetched_at'>
): void {
  const hash = data.url_hash ?? crypto.createHash('sha256').update(data.url).digest('hex')
  db.prepare(`
    INSERT OR IGNORE INTO articles (source_id, url, title, body_text, author, published_at, url_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(data.source_id, data.url, data.title, data.body_text, data.author, data.published_at, hash)
}

export function getArticleByUrlHash(
  db: InstanceType<typeof Database>,
  hash: string
): Article | null {
  return (db.prepare('SELECT * FROM articles WHERE url_hash = ?').get(hash) ?? null) as Article | null
}

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
    SELECT a.*, s.name AS source_name, s.trust_tier AS source_trust_tier
    FROM articles a
    JOIN sources s ON s.id = a.source_id
    ${categoryFilter}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...args) as ArticleWithMeta[]

  return attachCategories(db, rows)
}

export function searchArticles(
  db: InstanceType<typeof Database>,
  params: SearchParams
): ArticleWithMeta[] {
  if (!params.query?.trim()) return getFeed(db, params)

  const rows = db.prepare(`
    SELECT a.*, s.name AS source_name, s.trust_tier AS source_trust_tier,
           fts.rank AS fts_rank
    FROM articles_fts fts
    JOIN articles a ON a.id = fts.rowid
    JOIN sources s ON s.id = a.source_id
    WHERE articles_fts MATCH ?
    ORDER BY ${params.sort_by === 'relevance' ? 'fts.rank' : 'a.published_at DESC'}
    LIMIT ? OFFSET ?
  `).all(params.query, params.limit, params.offset) as ArticleWithMeta[]

  return attachCategories(db, rows)
}

function attachCategories(
  db: InstanceType<typeof Database>,
  rows: ArticleWithMeta[]
): ArticleWithMeta[] {
  if (rows.length === 0) return rows
  const ids = rows.map(r => r.id)
  const placeholders = ids.map(() => '?').join(',')
  const cats = db.prepare(`
    SELECT ac.article_id, c.id, c.name, c.color, ac.confidence
    FROM article_categories ac JOIN categories c ON c.id = ac.category_id
    WHERE ac.article_id IN (${placeholders})
  `).all(...ids) as Array<{ article_id: number; id: number; name: string; color: string; confidence: number }>

  const catMap = new Map<number, typeof cats>()
  for (const c of cats) {
    if (!catMap.has(c.article_id)) catMap.set(c.article_id, [])
    catMap.get(c.article_id)!.push(c)
  }
  return rows.map(r => ({ ...r, categories: catMap.get(r.id) ?? [] }))
}

// ── Categories ────────────────────────────────────────────────────────────────

export function listCategories(db: InstanceType<typeof Database>): Category[] {
  return db.prepare('SELECT * FROM categories ORDER BY name').all() as Category[]
}

export function createCategory(
  db: InstanceType<typeof Database>,
  data: Pick<Category, 'name' | 'color'>
): { id: number } {
  const result = db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)').run(data.name, data.color)
  return { id: Number(result.lastInsertRowid) }
}

export function updateCategory(
  db: InstanceType<typeof Database>,
  id: number,
  data: Partial<Pick<Category, 'name' | 'color'>>
): void {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
  db.prepare(`UPDATE categories SET ${fields} WHERE id = ?`).run(...Object.values(data), id)
}

export function deleteCategory(db: InstanceType<typeof Database>, id: number): void {
  db.prepare('DELETE FROM categories WHERE id = ?').run(id)
}

export function assignCategory(
  db: InstanceType<typeof Database>,
  articleId: number,
  categoryId: number,
  confidence = 1.0
): void {
  db.prepare(`
    INSERT OR REPLACE INTO article_categories (article_id, category_id, confidence)
    VALUES (?, ?, ?)
  `).run(articleId, categoryId, confidence)
}
