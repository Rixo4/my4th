# Phase 1 Research: Foundation & Data Architecture

## 1. Stack Selection & Principles
* **Runtime**: Node.js v26.13.0 (ES Modules).
* **Database Driver**: Native `node:sqlite` (`DatabaseSync`).
  * *Why*: Built directly into Node.js (v22.5+). No `npm install`, zero native C++ build tool dependencies (`node-gyp`, Python, Visual C++), zero runtime binary incompatibilities on Windows.
  * *Concurrency & Durability*: WAL (Write-Ahead Logging) mode enabled (`PRAGMA journal_mode = WAL;`) allowing concurrent reads while writing.
* **Schema Migration Strategy**:
  * Idempotent initialization script (`initDb()`) executing `CREATE TABLE IF NOT EXISTS` with indexed query targets.

## 2. Database Schema
### Table: `articles`
```sql
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  image_url TEXT,
  category TEXT DEFAULT 'General',
  tags TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_articles_status_pub ON articles(status, published_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
```

### Table: `admin_users`
```sql
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## 3. Seed & Verification Patterns
* Seed script creates sample records:
  - 1 initial admin record with hashed password.
  - 2 published articles (demonstrating feed readiness).
  - 1 draft article (demonstrating draft privacy testing).
* Automated verification script runs in Phase 1 to prove CRUD operations and index creation without requiring the web server.

