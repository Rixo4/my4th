import { getDb } from './index.js';

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
    publishedAt = status === 'published' ? new Date().toISOString() : null
  } = data;

  const stmt = db.prepare(`
    INSERT INTO articles (
      title, slug, excerpt, content, featured_image, category_id,
      author_name, status, is_featured, seo_title, seo_description, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    title,
    slug,
    excerpt,
    content,
    featuredImage,
    categoryId,
    authorName,
    status,
    isFeatured ? 1 : 0,
    seoTitle,
    seoDescription,
    publishedAt
  );

  return getArticleById(Number(result.lastInsertRowid));
}

export function getArticleById(id) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT a.*, c.name AS category_name, c.slug AS category_slug
    FROM articles a
    LEFT JOIN categories c ON a.category_id = c.id
    WHERE a.id = ?
  `);
  return stmt.get(id);
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
    query += ` AND a.status = 'published' AND datetime(a.published_at) <= datetime('now')`;
  }

  const stmt = db.prepare(query);
  return stmt.get(slug);
}

export function listPublishedArticles({ limit = 20, offset = 0, categorySlug = null, isFeatured = null } = {}) {
  const db = getDb();
  let query = `
    SELECT a.*, c.name AS category_name, c.slug AS category_slug
    FROM articles a
    LEFT JOIN categories c ON a.category_id = c.id
    WHERE a.status = 'published' AND datetime(a.published_at) <= datetime('now')
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

  const stmt = db.prepare(query);
  return stmt.all(...params);
}

export function listAllArticles({ status = null, search = null, categoryId = null, limit = 50, offset = 0 } = {}) {
  const db = getDb();
  let query = `
    SELECT a.*, c.name AS category_name, c.slug AS category_slug
    FROM articles a
    LEFT JOIN categories c ON a.category_id = c.id
    WHERE 1=1
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

  const stmt = db.prepare(query);
  return stmt.all(...params);
}

export function updateArticle(id, fields) {
  const db = getDb();
  const existing = getArticleById(id);
  if (!existing) return null;

  const title = fields.title !== undefined ? fields.title : existing.title;
  const slug = fields.slug !== undefined ? fields.slug : existing.slug;
  const excerpt = fields.excerpt !== undefined ? fields.excerpt : existing.excerpt;
  const content = fields.content !== undefined ? fields.content : existing.content;
  const featuredImage = fields.featuredImage !== undefined ? fields.featuredImage : existing.featured_image;
  const categoryId = fields.categoryId !== undefined ? fields.categoryId : existing.category_id;
  const authorName = fields.authorName !== undefined ? fields.authorName : existing.author_name;
  const status = fields.status !== undefined ? fields.status : existing.status;
  const isFeatured = fields.isFeatured !== undefined ? (fields.isFeatured ? 1 : 0) : existing.is_featured;
  const seoTitle = fields.seoTitle !== undefined ? fields.seoTitle : existing.seo_title;
  const seoDescription = fields.seoDescription !== undefined ? fields.seoDescription : existing.seo_description;

  let publishedAt = existing.published_at;
  if (fields.publishedAt !== undefined) {
    publishedAt = fields.publishedAt;
  } else if (existing.status !== 'published' && status === 'published' && !existing.published_at) {
    publishedAt = new Date().toISOString();
  }

  const stmt = db.prepare(`
    UPDATE articles
    SET title = ?,
        slug = ?,
        excerpt = ?,
        content = ?,
        featured_image = ?,
        category_id = ?,
        author_name = ?,
        status = ?,
        is_featured = ?,
        seo_title = ?,
        seo_description = ?,
        published_at = ?
    WHERE id = ?
  `);

  stmt.run(
    title,
    slug,
    excerpt,
    content,
    featuredImage,
    categoryId,
    authorName,
    status,
    isFeatured,
    seoTitle,
    seoDescription,
    publishedAt,
    id
  );

  return getArticleById(id);
}

export function deleteArticle(id) {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM articles WHERE id = ?');
  return stmt.run(id);
}

export function incrementArticleViews(id) {
  const db = getDb();
  const stmt = db.prepare('UPDATE articles SET views_count = views_count + 1 WHERE id = ?');
  return stmt.run(id);
}

export function getDashboardMetrics() {
  const db = getDb();
  const totalArticles = db.prepare('SELECT COUNT(*) AS count FROM articles').get().count;
  const publishedArticles = db.prepare("SELECT COUNT(*) AS count FROM articles WHERE status = 'published'").get().count;
  const draftArticles = db.prepare("SELECT COUNT(*) AS count FROM articles WHERE status = 'draft'").get().count;
  const scheduledArticles = db.prepare("SELECT COUNT(*) AS count FROM articles WHERE status = 'scheduled'").get().count;
  const totalCategories = db.prepare('SELECT COUNT(*) AS count FROM categories').get().count;
  const totalAds = db.prepare('SELECT COUNT(*) AS count FROM advertisements WHERE is_active = 1').get().count;

  return {
    totalArticles: Number(totalArticles),
    publishedArticles: Number(publishedArticles),
    draftArticles: Number(draftArticles),
    scheduledArticles: Number(scheduledArticles),
    totalCategories: Number(totalCategories),
    totalAds: Number(totalAds)
  };
}
