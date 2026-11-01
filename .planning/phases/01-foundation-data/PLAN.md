# Plan: Phase 1 — Foundation & Data Architecture

## Phase Metadata
* **Phase**: 1
* **Goal**: Establish the Node.js project environment, configure native SQLite persistence with `node:sqlite`, define tables (`articles`, `admin_users`), and provide automated database verification.
* **Requirements Addressed**: ART-01
* **Mode**: Tracer-first (End-to-end database connectivity and CRUD verification)

---

## Architecture & Directory Structure
```
adiminDrive/
├── package.json
├── .env.example
├── data/                  # SQLite storage directory (.gitignored / persistent)
│   └── news.db
├── src/
│   ├── config.js          # App & database configuration
│   └── db/
│       ├── index.js       # SQLite connection & initialization
│       ├── schema.sql     # DDL definitions for articles & admin_users
│       └── articles.js    # Data access functions (CRUD, status filtering)
└── scripts/
    ├── seed.js            # Initial admin & sample articles
    └── test-db.js         # Automated smoke tests for schema & queries
```

---

## Tasks

### Task 1: Project Scaffolding & Configuration
- Create `package.json` with `"type": "module"` and core scripts (`test:db`, `seed`).
- Set up `.env.example` with default database path and environment flags.
- Create `src/config.js` to resolve database file paths safely across Windows and POSIX.

### Task 2: Native SQLite Database & Schema (Tracer Slice)
- Create `src/db/schema.sql` containing idempotent DDL:
  - `articles` table with `id`, `title`, `slug`, `summary`, `body`, `image_url`, `category`, `tags`, `status`, `published_at`, `created_at`, `updated_at`.
  - Check constraint: `CHECK (status IN ('draft', 'published'))`.
  - Indexes: `idx_articles_status_pub` on `(status, published_at)` and unique `idx_articles_slug`.
  - `admin_users` table for credentials.
- Implement `src/db/index.js` using `node:sqlite`'s `DatabaseSync`:
  - Automatically ensure `data/` folder exists.
  - Enable `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`.
  - Execute schema migration on startup.

### Task 3: Data Access Layer (Repository Pattern)
- Implement `src/db/articles.js` with parameterized queries (protecting against SQL injection):
  - `createArticle({ title, slug, summary, body, imageUrl, category, tags, status, publishedAt })`
  - `getArticleById(id)`
  - `getArticleBySlug(slug)`
  - `listPublishedArticles({ limit, offset, category })`
  - `listAllArticles({ status, search })`
  - `updateArticle(id, fields)`
  - `deleteArticle(id)`

### Task 4: Seeder & Verification Smoke Test
- Create `scripts/seed.js` to seed:
  - Default admin account record (placeholder hash).
  - 2 published articles with full content.
  - 1 draft article for testing isolation.
- Create `scripts/test-db.js` running automated assertions:
  - Database initialization creates file and tables.
  - Inserting a new article succeeds.
  - Querying published articles strictly omits drafts.
  - Updating article status to `published` updates `updated_at` and `published_at`.
  - Deleting an article removes it permanently.

---

## Verification & Acceptance Criteria
1. Running `node scripts/test-db.js` exits with code 0 and reports all assertions passing.
2. `data/news.db` is generated with valid schema and indexes intact.
3. No external native compilation or C++ dependencies are required (relying 100% on built-in `node:sqlite`).

