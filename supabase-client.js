/**
 * HisarKiAawaj — Data Client & Service Layer
 * Supports both:
 * 1. Self-Hosted Local Node.js + SQLite REST Backend (Active Default)
 * 2. Cloud Supabase (when configured via window.SUPABASE_CONFIG)
 */

'use strict';

function isCloudSupabaseConfigured() {
  const config = window.SUPABASE_CONFIG || {};
  return Boolean(config.url && config.anonKey && !config.url.includes('your-project-id'));
}

function isLocalBackend() {
  return window.location.protocol.startsWith('http');
}

function isSupabaseConfigured() {
  return isLocalBackend() || isCloudSupabaseConfigured();
}

function getSupabase() {
  if (!isCloudSupabaseConfigured()) return null;
  if (typeof window.supabase === 'undefined' || !window.supabase.createClient) return null;
  return window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
}

// ============================================================================
// AUTHENTICATION & ADMIN ROLE VERIFICATION
// ============================================================================

async function signInAdmin(email, password) {
  if (isLocalBackend()) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Invalid credentials');
    return {
      user: data.user,
      profile: {
        id: data.user.id,
        email: data.user.username,
        full_name: data.user.full_name,
        role: data.user.role
      }
    };
  }

  throw new Error('Backend not reachable');
}

async function signOutAdmin() {
  if (isLocalBackend()) {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  }
}

async function checkAdminSession() {
  if (isLocalBackend()) {
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.authenticated || !data.user) return null;
      return {
        user: data.user,
        profile: {
          id: data.user.id,
          email: data.user.username,
          full_name: data.user.full_name,
          role: data.user.role
        }
      };
    } catch (err) {
      return null;
    }
  }
  return null;
}

async function requireAdminAuth(loginRedirectUrl = 'login.html') {
  const adminSession = await checkAdminSession();
  if (!adminSession) {
    window.location.href = loginRedirectUrl;
    return null;
  }
  return adminSession;
}

// ============================================================================
// IMAGE & MEDIA STORAGE
// ============================================================================

async function uploadMediaFile(file) {
  if (!file) throw new Error('No file provided');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch('/api/admin/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            dataBase64: reader.result
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        resolve(data.url);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// ARTICLES API
// ============================================================================

async function getPublicArticles({ limit = 20, categorySlug = null, featuredOnly = false, offset = 0 } = {}) {
  let url = `/api/articles?limit=${limit}&offset=${offset}`;
  if (categorySlug) url += `&category=${encodeURIComponent(categorySlug)}`;
  if (featuredOnly) url += `&featured=true`;

  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  data.totalCount = data.length;
  return data;
}

async function searchPublicArticles(searchTerm, { limit = 20 } = {}) {
  const clean = (searchTerm || '').trim().toLowerCase();
  const res = await fetch(`/api/articles?limit=${limit}`);
  if (!res.ok) return [];
  const data = await res.json();
  if (!clean) return data;
  return data.filter(a =>
    (a.title && a.title.toLowerCase().includes(clean)) ||
    (a.excerpt && a.excerpt.toLowerCase().includes(clean)) ||
    (a.content && a.content.toLowerCase().includes(clean))
  );
}

async function getArticleBySlug(slug) {
  const res = await fetch(`/api/articles/${encodeURIComponent(slug)}`);
  if (!res.ok) return null;
  return await res.json();
}

async function getAdminArticles({ page = 1, pageSize = 20, status = '', search = '', categoryId = '' } = {}) {
  const offset = (page - 1) * pageSize;
  let url = `/api/admin/articles?limit=${pageSize}&offset=${offset}`;
  if (status) url += `&status=${encodeURIComponent(status)}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  if (categoryId) url += `&categoryId=${encodeURIComponent(categoryId)}`;

  const res = await fetch(url);
  if (!res.ok) return { articles: [], totalCount: 0 };
  return await res.json();
}

async function getAdminArticleById(id) {
  const res = await fetch(`/api/admin/articles/${id}`);
  if (!res.ok) return null;
  return await res.json();
}

async function saveArticle(articleData) {
  const isUpdate = Boolean(articleData.id);
  const url = isUpdate ? `/api/admin/articles/${articleData.id}` : '/api/admin/articles';
  const method = isUpdate ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(articleData)
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save article');
  return data;
}

async function deleteArticle(id) {
  const res = await fetch(`/api/admin/articles/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete article');
  return true;
}

// ============================================================================
// CATEGORIES API
// ============================================================================

async function getCategories() {
  const res = await fetch('/api/categories');
  if (!res.ok) return [];
  return await res.json();
}

async function saveCategory(categoryData) {
  const res = await fetch('/api/admin/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(categoryData)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save category');
  return data;
}

async function deleteCategory(id) {
  const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete category');
  return true;
}

// ============================================================================
// ADVERTISEMENTS API
// ============================================================================

async function getActiveAdvertisements() {
  const res = await fetch('/api/ads');
  if (!res.ok) return [];
  return await res.json();
}

async function getAdminAdvertisements() {
  const res = await fetch('/api/ads');
  if (!res.ok) return [];
  return await res.json();
}

async function saveAdvertisement(adData) {
  const res = await fetch('/api/admin/ads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(adData)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save advertisement');
  return data;
}

async function deleteAdvertisement(id) {
  const res = await fetch(`/api/admin/ads/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete advertisement');
  return true;
}

// Export functions to window
window.HisarKiAawaj = {
  getSupabase,
  isSupabaseConfigured,
  signInAdmin,
  signOutAdmin,
  checkAdminSession,
  requireAdminAuth,
  uploadMediaFile,
  getPublicArticles,
  searchPublicArticles,
  getArticleBySlug,
  getAdminArticles,
  getAdminArticleById,
  saveArticle,
  deleteArticle,
  getCategories,
  saveCategory,
  deleteCategory,
  getActiveAdvertisements,
  getAdminAdvertisements,
  saveAdvertisement,
  deleteAdvertisement
};
