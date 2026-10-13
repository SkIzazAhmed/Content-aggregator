import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'

let _db: InstanceType<typeof Database> | null = null

export function openDb(dbPath?: string): InstanceType<typeof Database> {
  if (_db) return _db
  const filePath = dbPath ?? path.join(app.getPath('userData'), 'aggregator.db')
  _db = new Database(filePath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  return _db
}

export function closeDb(): void {
  _db?.close()
  _db = null
}
