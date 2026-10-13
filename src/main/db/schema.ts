import type Database from 'better-sqlite3'

export function runMigrations(db: InstanceType<typeof Database>): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id              INTEGER PRIMARY KEY,
      name            TEXT NOT NULL,
      url             TEXT NOT NULL UNIQUE,
      type            TEXT CHECK(type IN ('rss', 'nitter', 'scrape')) NOT NULL,
      trust_tier      INTEGER DEFAULT 2,
      last_fetched_at TEXT,
      active          INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS articles (
      id           INTEGER PRIMARY KEY,
      source_id    INTEGER REFERENCES sources(id) ON DELETE CASCADE,
      url          TEXT NOT NULL UNIQUE,
      title        TEXT,
      body_text    TEXT,
      author       TEXT,
      published_at TEXT,
      fetched_at   TEXT DEFAULT (datetime('now')),
      url_hash     TEXT UNIQUE
    );

    CREATE TABLE IF NOT EXISTS categories (
      id    INTEGER PRIMARY KEY,
      name  TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#6b7280'
    );

    CREATE TABLE IF NOT EXISTS article_categories (
      article_id  INTEGER REFERENCES articles(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
      confidence  REAL DEFAULT 1.0,
      PRIMARY KEY (article_id, category_id)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
      title, body_text, author,
      content=articles, content_rowid=id
    );

    CREATE TRIGGER IF NOT EXISTS articles_fts_insert
    AFTER INSERT ON articles BEGIN
      INSERT INTO articles_fts(rowid, title, body_text, author)
      VALUES (new.id, new.title, new.body_text, new.author);
    END;

    CREATE TRIGGER IF NOT EXISTS articles_fts_delete
    AFTER DELETE ON articles BEGIN
      INSERT INTO articles_fts(articles_fts, rowid, title, body_text, author)
      VALUES ('delete', old.id, old.title, old.body_text, old.author);
    END;

    CREATE TABLE IF NOT EXISTS category_keywords (
      id          INTEGER PRIMARY KEY,
      category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
      keyword     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credibility_scores (
      article_id  INTEGER PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
      score       REAL NOT NULL,
      tier        INTEGER NOT NULL,
      flags       TEXT NOT NULL DEFAULT '[]',
      explanation TEXT NOT NULL,
      checked_at  TEXT DEFAULT (datetime('now'))
    );
  `)
}
