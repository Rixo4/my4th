/**
 * Phase 3 migration — adds language, translation_of_id, deleted_at, expires_at columns.
 * Idempotent: checks existing columns before each ALTER TABLE.
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'news.db');

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

const existing = db.prepare('PRAGMA table_info(articles)').all().map(r => r.name);
let added = 0;

const migrations = [
  { col: 'language',          sql: `ALTER TABLE articles ADD COLUMN language TEXT NOT NULL DEFAULT 'hi'` },
  { col: 'translation_of_id', sql: `ALTER TABLE articles ADD COLUMN translation_of_id INTEGER REFERENCES articles(id) ON DELETE SET NULL` },
  { col: 'deleted_at',        sql: `ALTER TABLE articles ADD COLUMN deleted_at DATETIME DEFAULT NULL` },
  { col: 'expires_at',        sql: `ALTER TABLE articles ADD COLUMN expires_at DATETIME DEFAULT NULL` },
];

for (const { col, sql } of migrations) {
  if (!existing.includes(col)) {
    db.exec(sql);
    console.log(`  ✅ Added column: ${col}`);
    added++;
  } else {
    console.log(`  ℹ️  Column already exists: ${col}`);
  }
}

// Add index for expiry queries
db.exec(`CREATE INDEX IF NOT EXISTS idx_articles_expires ON articles(expires_at)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_articles_deleted ON articles(deleted_at)`);

db.close();
console.log(`\nPhase 3 migration complete. Columns added: ${added}\n`);

