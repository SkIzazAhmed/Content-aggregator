import Parser from 'rss-parser'
import crypto from 'crypto'
import type Database from 'better-sqlite3'
import { insertArticle, updateSource, getArticleByUrlHash } from '../db/queries'
import type { Source } from '../db/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ParserFactory = (opts?: Record<string, unknown>) => InstanceType<typeof Parser>

export async function fetchSource(
  db: InstanceType<typeof Database>,
  source: Source
): Promise<{ inserted: number; skipped: number }> {
  // Cast to factory so the vi.fn() mock (arrow function) works in tests,
  // while the real Parser class (constructable) also works via Reflect.construct fallback.
  let parser: InstanceType<typeof Parser>
  try {
    parser = new Parser({ timeout: 10_000 })
  } catch {
    // Under test mocks the constructor may be an arrow function; call as factory instead
    parser = (Parser as unknown as ParserFactory)({ timeout: 10_000 })
  }

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
