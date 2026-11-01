import { getDb } from './index.js';

// ---------------------------------------------------------------------------
// VISIBILITY GUARD — used by all public queries
// Excludes: drafts, future-scheduled, trashed (deleted_at set), expired
// ---------------------------------------------------------------------------
const PUBLIC_WHERE = `
  a.status = 'published'
  AND datetime(a.published_at) <= datetime('now')
  AND (a.deleted_at IS NULL)
  AND (a.expires_at IS NULL OR datetime(a.expires_at) > datetime('now'))
`;

export function createArticle(data) {
  const db = getDb();
  const {
    title,
    slug,
    excerpt = '',
    content,
    featuredImage = null,
    categoryId = null,
    authorName = 'HisarKiAawaj Bureau',
    status = 'draft',
    isFeatured = 0,
    seoTitle = null,
    seoDescription = null,
    publishedAt = status === 'published' ? new Date().toISOString() : null,
    language = 'hi',
    translationOfId = null,
    expiresAt = null
  } = data;

  const stmt = db.prepare(`
    INSERT INTO articles (
      title, slug, excerpt, content, featured_image, category_id,
      author_name, status, is_featured, seo_title, seo_description, published_at,
      language, translation_of_id, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    title, slug, excerpt, content, featuredImage, categoryId,
    authorName, status, isFeatured ? 1 : 0, seoTitle, seoDescription, publishedAt,
    language, translationOfId, expiresAt
  );

  return getArticleById(Number(result.lastInsertRowid));
}

export function getArticleById(id) {
  const db = getDb();
  return db.prepare(`
    SELECT a.*, c.name AS category_name, c.slug AS category_slug
    FROM articles a
    LEFT JOIN categories c ON a.category_id = c.id
    WHERE a.id = ?
  `).get(id);
}

export function getArticleBySlug(slug, allowDraft = false) {
  const db = getDb();
  let query = `
    SELECT a.*, c.name AS category_name, c.slug AS category_slug
    FROM articles a
    LEFT JOIN categories c ON a.category_id = c.id
    WHERE a.slug = ?
  `;

  if (!allowDraft) {
    query += ` AND ${PUBLIC_WHERE}`;
  }

  return db.prepare(query).get(slug);
}

export function listPublishedArticles({ limit = 20, offset = 0, categorySlug = null, isFeatured = null } = {}) {
  const db = getDb();
  let query = `
    SELECT a.*, c.name AS category_name, c.slug AS category_slug
    FROM articles a
    LEFT JOIN categories c ON a.category_id = c.id
    WHERE ${PUBLIC_WHERE}
  `;
  const params = [];

  if (categorySlug) {
    query += ` AND c.slug = ?`;
    params.push(categorySlug);
  }

  if (isFeatured !== null) {
    query += ` AND a.is_featured = ?`;
    params.push(isFeatured ? 1 : 0);
  }

  query += ` ORDER BY a.published_at DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));

  return db.prepare(query).all(...params);
}

export function listAllArticles({ status = null, search = null, categoryId = null, limit = 50, offset = 0 } = {}) {
  const db = getDb();
  // Admin list: includes all non-trashed articles (drafts, published, expired)
  let query = `
    SELECT a.*, c.name AS category_name, c.slug AS category_slug
    FROM articles a
    LEFT JOIN categories c ON a.category_id = c.id
    WHERE (a.deleted_at IS NULL)
  `;
  const params = [];

  if (status) {
    query += ` AND a.status = ?`;
    params.push(status);
  }

  if (categoryId) {
    query += ` AND a.category_id = ?`;
    params.push(categoryId);
  }

  if (search) {
    query += ` AND (a.title LIKE ? OR a.excerpt LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));

  return db.prepare(query).all(...params);
}

export function listTrashedArticles() {
  const db = getDb();
  return db.prepare(`
    SELECT a.*, c.name AS category_name, c.slug AS category_slug
    FROM articles a
    LEFT JOIN categories c ON a.category_id = c.id
    WHERE a.deleted_at IS NOT NULL
    ORDER BY a.deleted_at DESC
  `).all();
}

export function updateArticle(id, fields) {
  const db = getDb();
  const existing = getArticleById(id);
  if (!existing) return null;

  const title       = fields.title       !== undefined ? fields.title       : existing.title;
  const slug        = fields.slug        !== undefined ? fields.slug        : existing.slug;
  const excerpt     = fields.excerpt     !== undefined ? fields.excerpt     : existing.excerpt;
  const content     = fields.content     !== undefined ? fields.content     : existing.content;
  const featuredImage = fields.featuredImage !== undefined ? fields.featuredImage : existing.featured_image;
  const categoryId  = fields.categoryId  !== undefined ? fields.categoryId  : existing.category_id;
  const authorName  = fields.authorName  !== undefined ? fields.authorName  : existing.author_name;
  const status      = fields.status      !== undefined ? fields.status      : existing.status;
  const isFeatured  = fields.isFeatured  !== undefined ? (fields.isFeatured ? 1 : 0) : existing.is_featured;
  const seoTitle    = fields.seoTitle    !== undefined ? fields.seoTitle    : existing.seo_title;
  const seoDescription = fields.seoDescription !== undefined ? fields.seoDescription : existing.seo_description;
  const language    = fields.language    !== undefined ? fields.language    : (existing.language || 'hi');
  const translationOfId = fields.translationOfId !== undefined ? fields.translationOfId : existing.translation_of_id;
  // expires_at: explicitly support null (clear) vs undefined (keep existing)
  const expiresAt   = 'expiresAt' in fields ? fields.expiresAt : existing.expires_at;

  let publishedAt = existing.published_at;
  if (fields.publishedAt !== undefined) {
    publishedAt = fields.publishedAt;
  } else if (existing.status !== 'published' && status === 'published' && !existing.published_at) {
    publishedAt = new Date().toISOString();
  }

  db.prepare(`
    UPDATE articles
    SET title = ?, slug = ?, excerpt = ?, content = ?,
        featured_image = ?, category_id = ?, author_name = ?,
        status = ?, is_featured = ?, seo_title = ?, seo_description = ?,
        published_at = ?, language = ?, translation_of_id = ?, expires_at = ?
    WHERE id = ?
  `).run(
    title, slug, excerpt, content,
    featuredImage, categoryId, authorName,
    status, isFeatured, seoTitle, seoDescription,
    publishedAt, language, translationOfId, expiresAt,
    id
  );

  return getArticleById(id);
}

// Soft-delete: move to Trash
export function trashArticle(id) {
  const db = getDb();
  db.prepare(`UPDATE articles SET deleted_at = datetime('now') WHERE id = ?`).run(id);
}

// Restore from Trash
export function restoreArticle(id) {
  const db = getDb();
  db.prepare(`UPDATE articles SET deleted_at = NULL WHERE id = ?`).run(id);
  return getArticleById(id);
}

// Permanent delete (purge)
export function purgeArticle(id) {
  const db = getDb();
  db.prepare('DELETE FROM articles WHERE id = ?').run(id);
}

// Alias for backward compatibility (server.js calls deleteArticle)
export function deleteArticle(id) {
  return trashArticle(id);
}

export function incrementArticleViews(id) {
  const db = getDb();
  db.prepare('UPDATE articles SET views_count = views_count + 1 WHERE id = ?').run(id);
}

export function getDashboardMetrics() {
  const db = getDb();
  const now = "datetime('now')";
  const total     = db.prepare(`SELECT COUNT(*) AS c FROM articles WHERE deleted_at IS NULL`).get().c;
  const published = db.prepare(`SELECT COUNT(*) AS c FROM articles WHERE status='published' AND deleted_at IS NULL`).get().c;
  const draft     = db.prepare(`SELECT COUNT(*) AS c FROM articles WHERE status='draft' AND deleted_at IS NULL`).get().c;
  const trashed   = db.prepare(`SELECT COUNT(*) AS c FROM articles WHERE deleted_at IS NOT NULL`).get().c;
  const expired   = db.prepare(`SELECT COUNT(*) AS c FROM articles WHERE expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now') AND deleted_at IS NULL`).get().c;
  const totalCategories = db.prepare(`SELECT COUNT(*) AS c FROM categories`).get().c;
  const totalAds  = db.prepare(`SELECT COUNT(*) AS c FROM advertisements WHERE is_active = 1`).get().c;

  return {
    totalArticles:     Number(total),
    publishedArticles: Number(published),
    draftArticles:     Number(draft),
    trashedArticles:   Number(trashed),
    expiredArticles:   Number(expired),
    totalCategories:   Number(totalCategories),
    totalAds:          Number(totalAds)
  };
}
