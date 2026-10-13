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
