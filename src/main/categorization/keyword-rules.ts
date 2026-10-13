import type Database from 'better-sqlite3'
import { getAllKeywordRules, assignCategory } from '../db/queries'
import type { Article } from '../db/types'

export function categorizeArticle(db: InstanceType<typeof Database>, article: Article): void {
  const rules = getAllKeywordRules(db)
  const searchText = `${article.title} ${article.body_text}`.toLowerCase()
  const matched = new Set<number>()

  for (const rule of rules) {
    if (!matched.has(rule.category_id) && searchText.includes(rule.keyword)) {
      assignCategory(db, article.id, rule.category_id, 1.0)
      matched.add(rule.category_id)
    }
  }
}
