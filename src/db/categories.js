import { getDb } from './index.js';

export function listCategories() {
  const db = getDb();
  return db.prepare('SELECT * FROM categories ORDER BY order_index ASC, name ASC').all();
}

export function getCategoryById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

export function getCategoryBySlug(slug) {
  const db = getDb();
  return db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
}

export function createCategory({ name, slug, description = '', orderIndex = 0 }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO categories (name, slug, description, order_index)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(name, slug, description, orderIndex);
  return { id: Number(result.lastInsertRowid), name, slug, description, orderIndex };
}

export function updateCategory(id, { name, slug, description, orderIndex }) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE categories
    SET name = COALESCE(?, name),
        slug = COALESCE(?, slug),
        description = COALESCE(?, description),
        order_index = COALESCE(?, order_index)
    WHERE id = ?
  `);
  stmt.run(name, slug, description, orderIndex, id);
  return getCategoryById(id);
}

export function deleteCategory(id) {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM categories WHERE id = ?');
  return stmt.run(id);
}

