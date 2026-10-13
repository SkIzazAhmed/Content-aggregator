import Parser from 'rss-parser'
import crypto from 'crypto'
import type Database from 'better-sqlite3'
import { insertArticle, updateSource, getArticleByUrlHash } from '../db/queries'
import type { Source } from '../db/types'

export async function fetchSource(
  db: InstanceType<typeof Database>,
  source: Source
): Promise<{ inserted: number; skipped: number }> {
  const parser = new Parser({ timeout: 10_000 })

  const feed = await parser.parseURL(source.url)
  let inserted = 0
  let skipped = 0

  for (const item of feed.items) {
    const url = item.link ?? ''
    if (!url) { skipped++; continue }
    const hash = crypto.createHash('sha256').update(url).digest('hex')

    if (getArticleByUrlHash(db, hash)) { skipped++; continue }

    insertArticle(db, {
      source_id: source.id,
      url,
      title: item.title ?? '(no title)',
      body_text: item.contentSnippet ?? item.content ?? '',
      author: item.creator ?? item.author ?? '',
      published_at: item.pubDate
        ? new Date(item.pubDate).toISOString()
        : new Date().toISOString(),
      url_hash: hash,
    })
    inserted++
  }

  updateSource(db, source.id, { last_fetched_at: new Date().toISOString() })
  return { inserted, skipped }
}
