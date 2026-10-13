import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../../src/main/db/schema'
import { createSource, listSources } from '../../../src/main/db/queries'
import { fetchSource } from '../../../src/main/ingestion/rss-fetcher'

// Mock rss-parser so tests don't make real network calls
vi.mock('rss-parser', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      parseURL: vi.fn().mockResolvedValue({
        items: [
          {
            title: 'Article One',
            link: 'https://example.com/1',
            contentSnippet: 'Snippet of article one',
            creator: 'Author A',
            pubDate: 'Mon, 01 Jan 2026 00:00:00 GMT',
          },
          {
            title: 'Article Two',
            link: 'https://example.com/2',
            contentSnippet: 'Snippet of article two',
            creator: 'Author B',
            pubDate: 'Tue, 02 Jan 2026 00:00:00 GMT',
          },
        ],
      }),
    })),
  }
})

let db: InstanceType<typeof Database>

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
})
afterEach(() => db.close())

it('inserts new articles from an RSS feed', async () => {
  const { id } = createSource(db, { name: 'Test', url: 'https://example.com/rss', type: 'rss', trust_tier: 1 })
  const source = listSources(db)[0]
  const result = await fetchSource(db, source)
  expect(result.inserted).toBe(2)
  expect(result.skipped).toBe(0)
})

it('skips duplicate articles on second fetch', async () => {
  const source = listSources(db)[0] ?? (() => {
    createSource(db, { name: 'Test', url: 'https://example.com/rss', type: 'rss', trust_tier: 1 })
    return listSources(db)[0]
  })()
  await fetchSource(db, source)
  const result = await fetchSource(db, source)
  expect(result.inserted).toBe(0)
  expect(result.skipped).toBe(2)
})

it('updates source last_fetched_at after successful fetch', async () => {
  createSource(db, { name: 'T', url: 'https://example.com/rss', type: 'rss', trust_tier: 1 })
  const source = listSources(db)[0]
  await fetchSource(db, source)
  const updated = listSources(db)[0]
  expect(updated.last_fetched_at).not.toBeNull()
})
