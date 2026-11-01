import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

let _db = null;

export function getDb() {
  if (_db) return _db;

  // Ensure data directory exists
  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Initialize SQLite database connection
  _db = new DatabaseSync(config.dbPath);

  // High performance & integrity pragmas
  _db.exec('PRAGMA journal_mode = WAL;');
  _db.exec('PRAGMA foreign_keys = ON;');
  _db.exec('PRAGMA synchronous = NORMAL;');

  // Run schema initialization
  initSchema(_db);

  return _db;
}

function initSchema(db) {
  const schemaPath = path.join(path.dirname(config.dbPath), '..', 'src', 'db', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(sql);
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

