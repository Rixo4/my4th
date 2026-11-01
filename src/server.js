import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { getDb } from './db/index.js';
import { findAdminByUsername, verifyPasswordAsync } from './db/auth.js';
import {
  createArticle,
  getArticleById,
  getArticleBySlug,
  listPublishedArticles,
  listAllArticles,
  listTrashedArticles,
  updateArticle,
  deleteArticle,
  trashArticle,
  restoreArticle,
  purgeArticle,
  getDashboardMetrics
} from './db/articles.js';
import {
  listCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
} from './db/categories.js';

// MIME types dictionary for static file serving
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

// ============================================================================
// SESSION PERSISTENCE (SQLite-backed)
// ============================================================================
function ensureSessionsTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      idle_expires_at INTEGER NOT NULL
    )
  `);
}

function persistSession(token, session) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO sessions
      (token, user_id, username, full_name, role, created_at, expires_at, idle_expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    token,
    session.userId,
    session.username,
    session.fullName,
    session.role,
    session.createdAt,
    session.expiresAt,
    session.idleExpiresAt
  );
}

function deletePersistedSession(token) {
  try {
    getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
  } catch { /* ignore if table doesn't exist yet */ }
}

function loadSessionsFromDb() {
  try {
    const rows = getDb().prepare('SELECT * FROM sessions WHERE expires_at > ? AND idle_expires_at > ?').all(Date.now(), Date.now());
    for (const row of rows) {
      sessions.set(row.token, {
        userId: row.user_id,
        username: row.username,
        fullName: row.full_name,
        role: row.role,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        idleExpiresAt: row.idle_expires_at
      });
    }
  } catch { /* fresh DB, no sessions table yet */ }
}

// ============================================================================
// BRUTE-FORCE TRACKING
// ============================================================================
const loginAttempts = new Map(); // ip -> { count, lockedUntil }
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

function isLockedOut(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) return true;
  if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
    loginAttempts.delete(ip);
    return false;
  }
  return false;
}

function recordFailedLogin(ip) {
  const entry = loginAttempts.get(ip) || { count: 0, lockedUntil: null };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCK_WINDOW_MS;
  }
  loginAttempts.set(ip, entry);
}

function clearLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================
const sessions = new Map();

function buildCookie(token) {
  const maxAge = 24 * 60 * 60; // 24 hours
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `hisar_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const session = {
    userId: user.id,
    username: user.username,
    fullName: user.full_name || 'Administrator',
    role: user.role || 'admin',
    createdAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000,      // 24 hours absolute
    idleExpiresAt: now + 30 * 60 * 1000          // 30 min idle
  };
  sessions.set(token, session);
  persistSession(token, session);
  return token;
}

function getSessionCookieToken(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    })
  );
  return cookies['hisar_session'] || null;
}

function getSessionFromRequest(req) {
  const token = getSessionCookieToken(req);
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;

  const now = Date.now();
  if (now > session.expiresAt || now > session.idleExpiresAt) {
    sessions.delete(token);
    deletePersistedSession(token);
    return null;
  }

  // Refresh idle timeout
  session.idleExpiresAt = now + 30 * 60 * 1000;
  persistSession(token, session);

  return { token, ...session };
}

function deleteSession(token) {
  sessions.delete(token);
  deletePersistedSession(token);
}

// ============================================================================
// HELPERS
// ============================================================================
function formatArticle(a) {
  if (!a) return null;
  return {
    id: a.id,
    title: a.title,
    slug: a.slug,
    excerpt: a.excerpt || '',
    content: a.content || '',
    featured_image: a.featured_image || null,
    author_name: a.author_name || 'HisarKiAawaj Bureau',
    status: a.status,
    is_featured: Boolean(a.is_featured),
    views_count: Number(a.views_count || 0),
    seo_title: a.seo_title || null,
    seo_description: a.seo_description || null,
    published_at: a.published_at || null,
    language: a.language || 'hi',
    translation_of_id: a.translation_of_id || null,
    deleted_at: a.deleted_at || null,
    expires_at: a.expires_at || null,
    created_at: a.created_at,
    updated_at: a.updated_at,
    category_id: a.category_id || null,
    categories: a.category_id ? {
      id: a.category_id,
      name: a.category_name || 'General',
      slug: a.category_slug || 'general'
    } : null
  };
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        // 10MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    ...headers
  });
  res.end(JSON.stringify(data));
}

// ============================================================================
// HTML SANITIZER (Phase 3 - defined here for use in article routes)
// ============================================================================
function sanitizeHtml(html) {
  if (!html) return '';
  // Strip dangerous tags and their contents
  let out = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
                .replace(/<object[\s\S]*?<\/object>/gi, '')
                .replace(/<embed[^>]*>/gi, '')
                .replace(/<form[\s\S]*?<\/form>/gi, '')
                .replace(/<style[\s\S]*?<\/style>/gi, '');
  // Strip all event handlers (on*)
  out = out.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  // Strip javascript: hrefs
  out = out.replace(/href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, '');
  return out;
}

// ============================================================================
// REQUEST HANDLER
// ============================================================================
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Credentials': 'true'
    });
    return res.end();
  }

  // ==========================================================================
  // API ROUTES
  // ==========================================================================
  if (pathname.startsWith('/api/')) {
    try {
      // 1. AUTH: Login
      if (pathname === '/api/auth/login' && method === 'POST') {
        const ip = getClientIp(req);

        if (isLockedOut(ip)) {
          return sendJson(res, 429, { error: 'Too many failed login attempts. Please try again in 15 minutes.' });
        }

        const { email, username, password } = await parseJsonBody(req);
        const loginUser = username || email;
        const user = findAdminByUsername(loginUser);

        const valid = user ? await verifyPasswordAsync(password, user.password_hash) : false;

        if (!user || !valid) {
          recordFailedLogin(ip);
          return sendJson(res, 401, { error: 'Invalid username or password' });
        }

        clearLoginAttempts(ip);

        // Session ID rotation: delete old session if present
        const oldToken = getSessionCookieToken(req);
        if (oldToken) deleteSession(oldToken);

        const token = createSession(user);
        const cookie = buildCookie(token);

        return sendJson(res, 200, {
          success: true,
          user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role }
        }, { 'Set-Cookie': cookie });
      }

      // 2. AUTH: Logout
      if (pathname === '/api/auth/logout' && method === 'POST') {
        const token = getSessionCookieToken(req);
        if (token) deleteSession(token);
        const cookie = `hisar_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
        return sendJson(res, 200, { success: true }, { 'Set-Cookie': cookie });
      }

      // 3. AUTH: Check current session (/api/auth/me)
      if (pathname === '/api/auth/me' && method === 'GET') {
        const session = getSessionFromRequest(req);
        if (!session) {
          return sendJson(res, 401, { authenticated: false });
        }
        return sendJson(res, 200, {
          authenticated: true,
          user: {
            id: session.userId,
            username: session.username,
            full_name: session.fullName,
            role: session.role
          }
        });
      }

      // 4. PUBLIC: Get published articles
      if (pathname === '/api/articles' && method === 'GET') {
        const limit = parseInt(parsedUrl.searchParams.get('limit') || '20', 10);
        const offset = parseInt(parsedUrl.searchParams.get('offset') || '0', 10);
        const categorySlug = parsedUrl.searchParams.get('category');
        const isFeatured = parsedUrl.searchParams.has('featured')
          ? parsedUrl.searchParams.get('featured') === 'true'
          : null;

        const articles = listPublishedArticles({ limit, offset, categorySlug, isFeatured }).map(formatArticle);
        return sendJson(res, 200, articles, { 'Cache-Control': 'no-cache, no-store, must-revalidate' });
      }

      // 5. PUBLIC: Get single published article by slug
      if (pathname.startsWith('/api/articles/') && method === 'GET') {
        const slug = decodeURIComponent(pathname.replace('/api/articles/', ''));
        const article = getArticleBySlug(slug, false);

        if (!article) {
          return sendJson(res, 404, { error: 'Article not found or not published' });
        }
        return sendJson(res, 200, formatArticle(article), { 'Cache-Control': 'no-cache, no-store, must-revalidate' });
      }

      // 6. PUBLIC: Get categories
      if (pathname === '/api/categories' && method === 'GET') {
        const categories = listCategories();
        return sendJson(res, 200, categories);
      }

      // 7. PUBLIC: Get active advertisements
      if (pathname === '/api/ads' && method === 'GET') {
        const db = getDb();
        const ads = db.prepare('SELECT * FROM advertisements WHERE is_active = 1 ORDER BY order_index ASC').all();
        return sendJson(res, 200, ads);
      }

      // ======================================================================
      // PROTECTED ADMIN ROUTES (Require Admin Session)
      // ======================================================================
      if (pathname.startsWith('/api/admin/')) {
        // CSRF protection: state-changing methods require X-Requested-With header
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
          const xrw = req.headers['x-requested-with'];
          if (!xrw || xrw.toLowerCase() !== 'xmlhttprequest') {
            return sendJson(res, 403, { error: 'Forbidden: Missing X-Requested-With header' });
          }
        }

        const session = getSessionFromRequest(req);
        if (!session || session.role !== 'admin') {
          return sendJson(res, 401, { error: 'Unauthorized: Admin authentication required' });
        }

        // Admin: Metrics
        if (pathname === '/api/admin/metrics' && method === 'GET') {
          const metrics = getDashboardMetrics();
          return sendJson(res, 200, metrics);
        }

        // Admin: List trashed articles (MUST be before /api/admin/articles/:id)
        if (pathname === '/api/admin/articles/trash' && method === 'GET') {
          const trashed = listTrashedArticles().map(formatArticle);
          return sendJson(res, 200, trashed);
        }

        // Admin: List all articles (including drafts & scheduled)
        if (pathname === '/api/admin/articles' && method === 'GET') {
          const status = parsedUrl.searchParams.get('status') || null;
          const search = parsedUrl.searchParams.get('search') || null;
          const limit = parseInt(parsedUrl.searchParams.get('limit') || '100', 10);
          const offset = parseInt(parsedUrl.searchParams.get('offset') || '0', 10);

          const rawArticles = listAllArticles({ status, search, limit, offset });
          const articles = rawArticles.map(formatArticle);
          const totalCount = getDb().prepare('SELECT COUNT(*) as count FROM articles WHERE deleted_at IS NULL').get().count;
          return sendJson(res, 200, { articles, totalCount: Number(totalCount) });
        }

        // Admin: Create article
        if (pathname === '/api/admin/articles' && method === 'POST') {
          const body = await parseJsonBody(req);
          if (!body.title || !body.content) {
            return sendJson(res, 400, { error: 'Title and content are required' });
          }

          let slug = body.slug;
          if (!slug) {
            slug = body.title
              .toLowerCase()
              .replace(/[^a-z0-9\u0900-\u097F]+/g, '-')
              .replace(/(^-|-$)/g, '') || `post-${Date.now()}`;
          }

          const created = createArticle({
            title: body.title,
            slug,
            excerpt: body.excerpt || '',
            content: sanitizeHtml(body.content),
            featuredImage: body.featured_image || body.featuredImage || null,
            categoryId: body.category_id || body.categoryId || null,
            authorName: body.author_name || session.fullName,
            status: body.status || 'draft',
            isFeatured: body.is_featured ? 1 : 0,
            seoTitle: body.seo_title || null,
            seoDescription: body.seo_description || null,
            publishedAt: body.status === 'published' ? (body.published_at || new Date().toISOString()) : null,
            language: body.language || 'hi',
            translationOfId: body.translation_of_id || null,
            expiresAt: body.expires_at || null
          });

          return sendJson(res, 201, created);
        }

        // Admin: Restore article from trash
        if (pathname.match(/^\/api\/admin\/articles\/(\d+)\/restore$/) && method === 'POST') {
          const id = parseInt(pathname.match(/^\/api\/admin\/articles\/(\d+)\/restore$/)[1], 10);
          const restored = restoreArticle(id);
          if (!restored) return sendJson(res, 404, { error: 'Article not found' });
          return sendJson(res, 200, formatArticle(restored));
        }

        // Admin: Purge article permanently
        if (pathname.match(/^\/api\/admin\/articles\/(\d+)\/purge$/) && method === 'DELETE') {
          const id = parseInt(pathname.match(/^\/api\/admin\/articles\/(\d+)\/purge$/)[1], 10);
          purgeArticle(id);
          return sendJson(res, 200, { success: true });
        }

        // Admin: Toggle publish status
        if (pathname.match(/^\/api\/admin\/articles\/(\d+)\/toggle-publish$/) && method === 'PATCH') {
          const id = parseInt(pathname.match(/^\/api\/admin\/articles\/(\d+)\/toggle-publish$/)[1], 10);
          const existing = getArticleById(id);
          if (!existing) return sendJson(res, 404, { error: 'Article not found' });
          const newStatus = existing.status === 'published' ? 'draft' : 'published';
          const updated = updateArticle(id, {
            status: newStatus,
            publishedAt: newStatus === 'published' ? new Date().toISOString() : existing.published_at
          });
          return sendJson(res, 200, formatArticle(updated));
        }

        // Admin: Get single article for edit or draft preview
        if (pathname.startsWith('/api/admin/articles/') && method === 'GET') {
          const id = parseInt(pathname.replace('/api/admin/articles/', ''), 10);
          const article = getArticleById(id);
          if (!article) return sendJson(res, 404, { error: 'Article not found' });
          return sendJson(res, 200, formatArticle(article));
        }

        // Admin: Update article (PUT)
        if (pathname.startsWith('/api/admin/articles/') && method === 'PUT') {
          const id = parseInt(pathname.replace('/api/admin/articles/', ''), 10);
          const body = await parseJsonBody(req);
          const updated = updateArticle(id, {
            title: body.title,
            slug: body.slug,
            excerpt: body.excerpt,
            content: body.content !== undefined ? sanitizeHtml(body.content) : undefined,
            featuredImage: body.featured_image || body.featuredImage,
            categoryId: body.category_id || body.categoryId,
            authorName: body.author_name,
            status: body.status,
            isFeatured: body.is_featured,
            seoTitle: body.seo_title,
            seoDescription: body.seo_description,
            publishedAt: body.published_at,
            language: body.language,
            translationOfId: body.translation_of_id,
            expiresAt: 'expires_at' in body ? body.expires_at : undefined
          });
          if (!updated) return sendJson(res, 404, { error: 'Article not found' });
          return sendJson(res, 200, formatArticle(updated));
        }

        // Admin: PATCH article (toggle publish / status update)
        if (pathname.startsWith('/api/admin/articles/') && method === 'PATCH') {
          const id = parseInt(pathname.replace('/api/admin/articles/', ''), 10);
          const body = await parseJsonBody(req);
          const existing = getArticleById(id);
          if (!existing) return sendJson(res, 404, { error: 'Article not found' });
          const newStatus = body.status || (existing.status === 'published' ? 'draft' : 'published');
          const updated = updateArticle(id, {
            status: newStatus,
            publishedAt: newStatus === 'published' ? (body.published_at || new Date().toISOString()) : existing.published_at
          });
          return sendJson(res, 200, formatArticle(updated));
        }

        // Admin: Delete article (soft delete / trash)
        if (pathname.startsWith('/api/admin/articles/') && method === 'DELETE') {
          const id = parseInt(pathname.replace('/api/admin/articles/', ''), 10);
          deleteArticle(id); // alias to trashArticle in Phase 3
          return sendJson(res, 200, { success: true });
        }

        // Admin: Save / Create Category
        if (pathname === '/api/admin/categories' && method === 'POST') {
          const body = await parseJsonBody(req);
          if (!body.name || !body.slug) {
            return sendJson(res, 400, { error: 'Name and slug are required' });
          }
          if (body.id) {
            const updated = updateCategory(body.id, body);
            return sendJson(res, 200, updated);
          } else {
            const created = createCategory(body);
            return sendJson(res, 201, created);
          }
        }

        // Admin: Delete Category
        if (pathname.startsWith('/api/admin/categories/') && method === 'DELETE') {
          const id = parseInt(pathname.replace('/api/admin/categories/', ''), 10);
          deleteCategory(id);
          return sendJson(res, 200, { success: true });
        }

        // Admin: Save / Update Advertisement
        if (pathname === '/api/admin/ads' && method === 'POST') {
          const body = await parseJsonBody(req);
          const db = getDb();
          if (body.id) {
            db.prepare(`
              UPDATE advertisements
              SET name = ?, placement = ?, image_url = ?, destination_url = ?,
                  sponsor_title = ?, sponsor_subtitle = ?, cta_text = ?, is_active = ?, order_index = ?
              WHERE id = ?
            `).run(
              body.name, body.placement, body.image_url, body.destination_url || '#',
              body.sponsor_title, body.sponsor_subtitle, body.cta_text || 'क्लिक करें ↗',
              body.is_active ? 1 : 0, body.order_index || 0, body.id
            );
            const updated = db.prepare('SELECT * FROM advertisements WHERE id = ?').get(body.id);
            return sendJson(res, 200, updated);
          } else {
            const result = db.prepare(`
              INSERT INTO advertisements (name, placement, image_url, destination_url, sponsor_title, sponsor_subtitle, cta_text, is_active, order_index)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              body.name, body.placement, body.image_url, body.destination_url || '#',
              body.sponsor_title, body.sponsor_subtitle, body.cta_text || 'क्लिक करें ↗',
              body.is_active ? 1 : 0, body.order_index || 0
            );
            const created = db.prepare('SELECT * FROM advertisements WHERE id = ?').get(Number(result.lastInsertRowid));
            return sendJson(res, 201, created);
          }
        }

        // Admin: Delete Advertisement
        if (pathname.startsWith('/api/admin/ads/') && method === 'DELETE') {
          const id = parseInt(pathname.replace('/api/admin/ads/', ''), 10);
          const db = getDb();
          db.prepare('DELETE FROM advertisements WHERE id = ?').run(id);
          return sendJson(res, 200, { success: true });
        }

        // Admin: Upload image
        if (pathname === '/api/admin/upload' && method === 'POST') {
          const body = await parseJsonBody(req);
          if (!body.dataBase64 || !body.fileName) {
            return sendJson(res, 400, { error: 'dataBase64 and fileName required' });
          }

          const ext = (path.extname(body.fileName) || '').toLowerCase();
          const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
          if (!allowedExts.includes(ext)) {
            return sendJson(res, 400, { error: 'Only .jpg, .jpeg, .png, .webp files are allowed' });
          }

          const base64Data = body.dataBase64.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');

          // Enforce 5 MB max
          if (buffer.length > 5 * 1024 * 1024) {
            return sendJson(res, 400, { error: 'File too large. Maximum size is 5 MB.' });
          }

          // Validate magic bytes
          const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
          const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
          const isWebp = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
          if (!isJpeg && !isPng && !isWebp) {
            return sendJson(res, 400, { error: 'Invalid image file. Content does not match declared type.' });
          }

          const safeName = `img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
          const targetPath = path.join(config.uploadDir, safeName);
          fs.writeFileSync(targetPath, buffer);

          const publicUrl = `/uploads/${safeName}`;
          return sendJson(res, 200, { url: publicUrl, fileName: safeName }, {
            'X-Content-Type-Options': 'nosniff'
          });
        }
      }

      return sendJson(res, 404, { error: 'API route not found' });
    } catch (err) {
      console.error('API Error:', err);
      return sendJson(res, 500, { error: 'Internal Server Error', details: err.message });
    }
  }

  // ==========================================================================
  // STATIC FILE SERVING
  // ==========================================================================
  let relativeFilePath = pathname === '/' ? '/index.html' : pathname;
  let fullPath = path.join(config.rootDir, relativeFilePath);

  // If pointing to a directory, append index.html
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
    fullPath = path.join(fullPath, 'index.html');
  }

  // Prevent path traversal
  if (!fullPath.startsWith(config.rootDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Access Denied');
  }

  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(fullPath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404 Not Found</h1><p>The requested file does not exist.</p>');
  }
});

// Start listening
server.listen(config.port, () => {
  // Initialize sessions table and load persisted sessions
  ensureSessionsTable();
  loadSessionsFromDb();

  console.log(`\n======================================================`);
  console.log(`🚀 HisarKiAawaj Web Server is LIVE!`);
  console.log(`📡 Public News Portal : http://localhost:${config.port}`);
  console.log(`🔑 Admin Login Portal : http://localhost:${config.port}/admin/login.html`);
  console.log(`📊 Admin Dashboard    : http://localhost:${config.port}/admin/dashboard.html`);
  console.log(`📁 Local Database     : ${config.dbPath}`);
  console.log(`======================================================\n`);
});

export { ensureSessionsTable, loadSessionsFromDb, sanitizeHtml };
export default server;
