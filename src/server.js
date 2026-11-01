import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { getDb } from './db/index.js';
import { findAdminByUsername, verifyPassword } from './db/auth.js';
import {
  createArticle,
  getArticleById,
  getArticleBySlug,
  listPublishedArticles,
  listAllArticles,
  updateArticle,
  deleteArticle,
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
const sessions = new Map();

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const session = {
    userId: user.id,
    username: user.username,
    fullName: user.full_name || 'Administrator',
    role: user.role || 'admin',
    createdAt: Date.now(),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
  };
  sessions.set(token, session);
  return token;
}

function getSessionFromRequest(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    })
  );

  const token = cookies['hisar_session'];
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  return { token, ...session };
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

// Request Handler
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
        const { email, username, password } = await parseJsonBody(req);
        const loginUser = username || email;
        const user = findAdminByUsername(loginUser);

        if (!user || !verifyPassword(password, user.password_hash)) {
          return sendJson(res, 401, { error: 'Invalid username or password' });
        }

        const token = createSession(user);
        const cookie = `hisar_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 86400}`;

        return sendJson(res, 200, {
          success: true,
          user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role }
        }, { 'Set-Cookie': cookie });
      }

      // 2. AUTH: Logout
      if (pathname === '/api/auth/logout' && method === 'POST') {
        const session = getSessionFromRequest(req);
        if (session) sessions.delete(session.token);
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
        return sendJson(res, 200, articles);
      }

      // 5. PUBLIC: Get single published article by slug
      if (pathname.startsWith('/api/articles/') && method === 'GET') {
        const slug = decodeURIComponent(pathname.replace('/api/articles/', ''));
        const article = getArticleBySlug(slug, false);

        if (!article) {
          return sendJson(res, 404, { error: 'Article not found or not published' });
        }
        return sendJson(res, 200, formatArticle(article));
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
        const session = getSessionFromRequest(req);
        if (!session || session.role !== 'admin') {
          return sendJson(res, 401, { error: 'Unauthorized: Admin authentication required' });
        }

        // Admin: Metrics
        if (pathname === '/api/admin/metrics' && method === 'GET') {
          const metrics = getDashboardMetrics();
          return sendJson(res, 200, metrics);
        }

        // Admin: List all articles (including drafts & scheduled)
        if (pathname === '/api/admin/articles' && method === 'GET') {
          const status = parsedUrl.searchParams.get('status') || null;
          const search = parsedUrl.searchParams.get('search') || null;
          const limit = parseInt(parsedUrl.searchParams.get('limit') || '100', 10);
          const offset = parseInt(parsedUrl.searchParams.get('offset') || '0', 10);

          const rawArticles = listAllArticles({ status, search, limit, offset });
          const articles = rawArticles.map(formatArticle);
          const totalCount = getDb().prepare('SELECT COUNT(*) as count FROM articles').get().count;
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
            content: body.content,
            featuredImage: body.featured_image || body.featuredImage || null,
            categoryId: body.category_id || body.categoryId || null,
            authorName: body.author_name || session.fullName,
            status: body.status || 'draft',
            isFeatured: body.is_featured ? 1 : 0,
            seoTitle: body.seo_title || null,
            seoDescription: body.seo_description || null,
            publishedAt: body.status === 'published' ? (body.published_at || new Date().toISOString()) : null
          });

          return sendJson(res, 201, created);
        }

        // Admin: Get single article for edit or draft preview
        if (pathname.startsWith('/api/admin/articles/') && method === 'GET') {
          const id = parseInt(pathname.replace('/api/admin/articles/', ''), 10);
          const article = getArticleById(id);
          if (!article) return sendJson(res, 404, { error: 'Article not found' });
          return sendJson(res, 200, formatArticle(article));
        }

        // Admin: Update article
        if (pathname.startsWith('/api/admin/articles/') && method === 'PUT') {
          const id = parseInt(pathname.replace('/api/admin/articles/', ''), 10);
          const body = await parseJsonBody(req);
          const updated = updateArticle(id, {
            title: body.title,
            slug: body.slug,
            excerpt: body.excerpt,
            content: body.content,
            featuredImage: body.featured_image || body.featuredImage,
            categoryId: body.category_id || body.categoryId,
            authorName: body.author_name,
            status: body.status,
            isFeatured: body.is_featured,
            seoTitle: body.seo_title,
            seoDescription: body.seo_description,
            publishedAt: body.published_at
          });
          if (!updated) return sendJson(res, 404, { error: 'Article not found' });
          return sendJson(res, 200, formatArticle(updated));
        }

        // Admin: Delete article
        if (pathname.startsWith('/api/admin/articles/') && method === 'DELETE') {
          const id = parseInt(pathname.replace('/api/admin/articles/', ''), 10);
          deleteArticle(id);
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

          const ext = path.extname(body.fileName) || '.jpg';
          const safeName = `img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
          const targetPath = path.join(config.uploadDir, safeName);

          const buffer = Buffer.from(body.dataBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
          fs.writeFileSync(targetPath, buffer);

          const publicUrl = `/uploads/${safeName}`;
          return sendJson(res, 200, { url: publicUrl, fileName: safeName });
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
  console.log(`\n======================================================`);
  console.log(`🚀 HisarKiAawaj Web Server is LIVE!`);
  console.log(`📡 Public News Portal : http://localhost:${config.port}`);
  console.log(`🔑 Admin Login Portal : http://localhost:${config.port}/admin/login.html`);
  console.log(`📊 Admin Dashboard    : http://localhost:${config.port}/admin/dashboard.html`);
  console.log(`📁 Local Database     : ${config.dbPath}`);
  console.log(`======================================================\n`);
});

export default server;
