-- HisarKiAawaj SQLite Database Schema
-- Optimized for native node:sqlite (DatabaseSync)

-- 1. ADMIN USERS
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT DEFAULT 'Administrator',
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'editor')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. ARTICLES
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  featured_image TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  author_name TEXT DEFAULT 'HisarKiAawaj Bureau',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'scheduled')),
  is_featured INTEGER NOT NULL DEFAULT 0,
  views_count INTEGER NOT NULL DEFAULT 0,
  seo_title TEXT,
  seo_description TEXT,
  published_at DATETIME,
  language TEXT NOT NULL DEFAULT 'hi',
  translation_of_id INTEGER REFERENCES articles(id) ON DELETE SET NULL,
  deleted_at DATETIME DEFAULT NULL,
  expires_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. SESSIONS (persistent across restarts, enforces idle & absolute expiry server-side)
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at INTEGER NOT NULL,        -- Unix ms timestamp
  expires_at INTEGER NOT NULL,        -- Absolute expiry (Unix ms, 24 h)
  idle_expires_at INTEGER NOT NULL    -- Idle expiry (Unix ms, 30 min, refreshed on use)
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- 5. ADVERTISEMENTS
CREATE TABLE IF NOT EXISTS advertisements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  placement TEXT NOT NULL CHECK (placement IN (
    'top_leaderboard',
    'infeed_between_hero',
    'infeed_card',
    'infeed_between_rows',
    'sidebar_carousel',
    'our_clients',
    'in_article'
  )),
  image_url TEXT NOT NULL,
  destination_url TEXT DEFAULT '#',
  sponsor_title TEXT,
  sponsor_subtitle TEXT,
  cta_text TEXT DEFAULT 'क्लिक करें ↗',
  is_active INTEGER NOT NULL DEFAULT 1,
  order_index INTEGER DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. PERFORMANCE & ISOLATION INDEXES
CREATE INDEX IF NOT EXISTS idx_articles_status_pub ON articles(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category_id);
CREATE INDEX IF NOT EXISTS idx_articles_featured ON articles(is_featured);
CREATE INDEX IF NOT EXISTS idx_articles_expires ON articles(expires_at);
CREATE INDEX IF NOT EXISTS idx_articles_deleted ON articles(deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_ads_placement ON advertisements(placement, is_active);

-- 6. AUTOMATIC UPDATED_AT TRIGGER
CREATE TRIGGER IF NOT EXISTS trigger_articles_updated_at
AFTER UPDATE ON articles
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE articles SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

