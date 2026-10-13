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
      // Categorize any articles from this source that have no categories yet
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
