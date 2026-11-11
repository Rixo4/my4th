/**
 * HisarKiAawaj — Data Client & Service Layer
 * Supports both:
 * 1. Cloud Supabase (when configured via window.SUPABASE_CONFIG or localStorage)
 * 2. Self-Hosted Local Node.js + SQLite REST Backend (Fallback when running on localhost)
 */

'use strict';

const API_BASE = (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) ? '' : 'http://localhost:3000';

function isLocalBackend() {
  // On localhost, always use the local Node.js backend (Supabase is for production only)
  return typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );
}

function isCloudSupabaseConfigured() {
  // Only use Supabase Cloud when NOT on localhost
  if (isLocalBackend()) return false;
  const config = window.SUPABASE_CONFIG || {};
  return Boolean(config.url && config.anonKey && !config.url.includes('your-project-id') && !config.anonKey.includes('your-supabase-anon-key'));
}

function isSupabaseConfigured() {
  return isCloudSupabaseConfigured() || isLocalBackend();
}

function getSupabase() {
  if (!isCloudSupabaseConfigured()) return null;
  if (typeof window.supabase === 'undefined' || !window.supabase.createClient) return null;
  if (!window._supabaseInstance) {
    window._supabaseInstance = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
  }
  return window._supabaseInstance;
}

// ============================================================================
// AUTHENTICATION & ADMIN ROLE VERIFICATION
// ============================================================================

async function signInAdmin(email, password) {
  if (isCloudSupabaseConfigured()) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase SDK not loaded');

    const { data, error } = await sb.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: password
    });
    if (error) {
      console.error('[Supabase Auth Error]', error.status, error.message, JSON.stringify(error));
      throw new Error(error.message || 'Invalid credentials');
    }

    const { data: profile, error: profErr } = await sb
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profErr || !profile || profile.role !== 'admin') {
      await sb.auth.signOut();
      throw new Error('Access denied. Administrator privileges required.');
    }

    return {
      user: data.user,
      profile: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name || 'Admin',
        role: profile.role
      }
    };
  }

  if (isLocalBackend()) {
    const res = await fetch(API_BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      throw new Error(`Local backend returned non-JSON response (${res.status}). Please check your server or Supabase configuration.`);
    }
    if (!res.ok) throw new Error(data?.error || 'Invalid credentials');
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

  throw new Error('Backend not configured or unreachable');
}

async function signOutAdmin() {
  if (isCloudSupabaseConfigured()) {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    return;
  }

  if (isLocalBackend()) {
    await fetch(API_BASE + '/api/auth/logout', {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    }).catch(() => {});
  }
}

async function checkAdminSession() {
  if (isCloudSupabaseConfigured()) {
    const sb = getSupabase();
    if (!sb) return null;
    const { data: { session }, error } = await sb.auth.getSession();
    if (error || !session || !session.user) return null;

    const { data: profile, error: profErr } = await sb
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (profErr || !profile || profile.role !== 'admin') return null;
    return {
      user: session.user,
      profile: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name || 'Admin',
        role: profile.role
      }
    };
  }

  if (isLocalBackend()) {
    try {
      const res = await fetch(API_BASE + '/api/auth/me');
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

async function uploadMediaFile(file, folder = 'uploads') {
  if (!file) throw new Error('No file provided');

  if (isCloudSupabaseConfigured()) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase client not initialized');

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const cleanName = `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const filePath = `${folder}/${cleanName}`;

    const { error: uploadError } = await sb.storage
      .from('news-media')
      .upload(filePath, file, { cacheControl: '3600', upsert: false });

    if (uploadError) throw new Error(uploadError.message || 'Failed to upload image');

    const { data } = sb.storage.from('news-media').getPublicUrl(filePath);
    return data.publicUrl;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch(API_BASE + '/api/admin/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
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
  if (isCloudSupabaseConfigured()) {
    const sb = getSupabase();
    let query = sb
      .from('articles')
      .select('*, categories:category_id(id, name, slug)')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (featuredOnly) query = query.eq('is_featured', true);

    const { data, error } = await query;
    if (error) {
      console.error('Supabase getPublicArticles error:', error);
      return [];
    }

    const now = new Date();
    let list = (data || []).filter(a => !a.published_at || new Date(a.published_at) <= now);

    if (categorySlug) {
      list = list.filter(a => a.categories?.slug === categorySlug);
    }

    list.forEach(a => {
      if (a.categories) {
        a.category_name = a.categories.name;
        a.category_slug = a.categories.slug;
      }
    });

    list.totalCount = list.length;
    return list;
  }

  let url = `/api/articles?limit=${limit}&offset=${offset}`;
  if (categorySlug) url += `&category=${encodeURIComponent(categorySlug)}`;
  if (featuredOnly) url += `&featured=true`;

  const res = await fetch(url.startsWith('http') ? url : API_BASE + url);
  if (!res.ok) return [];
  const data = await res.json();
  data.totalCount = data.length;
  return data;
}

async function searchPublicArticles(searchTerm, { limit = 20 } = {}) {
  const clean = (searchTerm || '').trim();

  if (isCloudSupabaseConfigured()) {
    const sb = getSupabase();
    let query = sb
      .from('articles')
      .select('*, categories:category_id(id, name, slug)')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(limit);

    if (clean) {
      query = query.or(`title.ilike.%${clean}%,excerpt.ilike.%${clean}%,content.ilike.%${clean}%`);
    }

    const { data, error } = await query;
    if (error) return [];
    const now = new Date();
    const list = (data || []).filter(a => !a.published_at || new Date(a.published_at) <= now);
    list.forEach(a => {
      if (a.categories) {
        a.category_name = a.categories.name;
        a.category_slug = a.categories.slug;
      }
    });
    return list;
  }

  const res = await fetch(`${API_BASE}/api/articles?limit=${limit}`);
  if (!res.ok) return [];
  const data = await res.json();
  if (!clean) return data;
  const lower = clean.toLowerCase();
  return data.filter(a =>
    (a.title && a.title.toLowerCase().includes(lower)) ||
    (a.excerpt && a.excerpt.toLowerCase().includes(lower)) ||
    (a.content && a.content.toLowerCase().includes(lower))
  );
}

async function getArticleBySlug(slug) {
  if (isCloudSupabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('articles')
      .select('*, categories:category_id(id, name, slug)')
      .eq('slug', slug)
      .single();

    if (error || !data) return null;
    if (data.categories) {
      data.category_name = data.categories.name;
      data.category_slug = data.categories.slug;
    }
    return data;
  }

  const res = await fetch(`${API_BASE}/api/articles/${encodeURIComponent(slug)}`);
  if (!res.ok) return null;
  return await res.json();
}

async function getAdminArticles({ page = 1, pageSize = 20, status = '', search = '', categoryId = '' } = {}) {
  if (isCloudSupabaseConfigured()) {
    const sb = getSupabase();
    const offset = (page - 1) * pageSize;
    let query = sb
      .from('articles')
      .select('*, categories:category_id(id, name, slug)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (status) query = query.eq('status', status);
    if (categoryId) query = query.eq('category_id', categoryId);
    if (search) query = query.or(`title.ilike.%${search}%,excerpt.ilike.%${search}%`);

    const { data, count, error } = await query;
    if (error) return { articles: [], totalCount: 0 };
    (data || []).forEach(a => {
      if (a.categories) {
        a.category_name = a.categories.name;
        a.category_slug = a.categories.slug;
      }
    });
    return { articles: data || [], totalCount: count || 0 };
  }

  const offset = (page - 1) * pageSize;
  let url = `/api/admin/articles?limit=${pageSize}&offset=${offset}`;
  if (status) url += `&status=${encodeURIComponent(status)}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  if (categoryId) url += `&categoryId=${encodeURIComponent(categoryId)}`;

  const res = await fetch(url.startsWith('http') ? url : API_BASE + url);
  if (!res.ok) return { articles: [], totalCount: 0 };
  return await res.json();
}

async function getAdminArticleById(id) {
  if (isCloudSupabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('articles')
      .select('*, categories:category_id(id, name, slug)')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    if (data.categories) {
      data.category_name = data.categories.name;
      data.category_slug = data.categories.slug;
    }
    return data;
  }

  const res = await fetch(`${API_BASE}/api/admin/articles/${id}`);
  if (!res.ok) return null;
  return await res.json();
}

async function saveArticle(articleData) {
  if (isCloudSupabaseConfigured()) {
    const sb = getSupabase();
    const payload = {
      title: articleData.title,
      slug: articleData.slug,
      excerpt: articleData.excerpt || null,
      content: articleData.content,
      featured_image: articleData.featured_image || null,
      category_id: articleData.category_id || null,
      status: articleData.status || 'draft',
      is_featured: Boolean(articleData.is_featured),
      seo_title: articleData.seo_title || null,
      seo_description: articleData.seo_description || null,
      published_at: articleData.published_at || (articleData.status === 'published' ? new Date().toISOString() : null)
    };

    if (articleData.id) {
      const { data, error } = await sb
        .from('articles')
        .update(payload)
        .eq('id', articleData.id)
        .select()
        .single();
      if (error) throw new Error(error.message || 'Failed to update article');
      return data;
    } else {
      const { data, error } = await sb
        .from('articles')
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(error.message || 'Failed to create article');
      return data;
    }
  }

  const isUpdate = Boolean(articleData.id);
  const url = isUpdate ? `/api/admin/articles/${articleData.id}` : '/api/admin/articles';
  const method = isUpdate ? 'PUT' : 'POST';

  const res = await fetch(url.startsWith('http') ? url : API_BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify(articleData)
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save article');
  return data;
}

async function deleteArticle(id) {
  if (isCloudSupabaseConfigured()) {
    const sb = getSupabase();
    const { error } = await sb.from('articles').delete().eq('id', id);
    if (error) throw new Error(error.message || 'Failed to delete article');
    return true;
  }

  const res = await fetch(`${API_BASE}/api/admin/articles/${id}`, {
    method: 'DELETE',
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete article');
  return true;
}

async function getTrashedArticles() {
  if (isCloudSupabaseConfigured()) {
    return [];
  }

  const res = await fetch(API_BASE + '/api/admin/articles/trash');
  if (!res.ok) return [];
  return await res.json();
}

async function restoreArticle(id) {
  if (isCloudSupabaseConfigured()) return null;

  const res = await fetch(`${API_BASE}/api/admin/articles/${id}/restore`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to restore article');
  return data;
}

async function togglePublishArticle(id) {
  if (isCloudSupabaseConfigured()) {
    const sb = getSupabase();
    const { data: current, error: curErr } = await sb.from('articles').select('status').eq('id', id).single();
    if (curErr) throw new Error(curErr.message);
    const newStatus = current?.status === 'published' ? 'draft' : 'published';
    const { data, error } = await sb
      .from('articles')
      .update({
        status: newStatus,
        published_at: newStatus === 'published' ? new Date().toISOString() : null
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message || 'Failed to toggle status');
    return data;
  }

  const res = await fetch(`${API_BASE}/api/admin/articles/${id}/toggle-publish`, {
    method: 'PATCH',
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to toggle publish status');
  return data;
}

async function purgeArticle(id) {
  if (isCloudSupabaseConfigured()) {
    return await deleteArticle(id);
  }

  const res = await fetch(`${API_BASE}/api/admin/articles/${id}/purge`, {
    method: 'DELETE',
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to purge article');
  return true;
}

// ============================================================================
// CATEGORIES API
// ============================================================================

async function getCategories() {
  if (isCloudSupabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('categories')
      .select('*')
      .order('order_index', { ascending: true });
    if (error) return [];
    return data || [];
  }

  const res = await fetch(API_BASE + '/api/categories');
  if (!res.ok) return [];
  return await res.json();
}

async function saveCategory(categoryData) {
  if (isCloudSupabaseConfigured()) {
    const sb = getSupabase();
    const payload = {
      name: categoryData.name,
      slug: categoryData.slug,
      description: categoryData.description || null
    };

    if (categoryData.id) {
      const { data, error } = await sb
        .from('categories')
        .update(payload)
        .eq('id', categoryData.id)
        .select()
        .single();
      if (error) throw new Error(error.message || 'Failed to update category');
      return data;
    } else {
      const { data, error } = await sb
        .from('categories')
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(error.message || 'Failed to create category');
      return data;
    }
  }

  const res = await fetch(API_BASE + '/api/admin/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify(categoryData)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save category');
  return data;
}

async function deleteCategory(id) {
  if (isCloudSupabaseConfigured()) {
    const sb = getSupabase();
    const { error } = await sb.from('categories').delete().eq('id', id);
    if (error) throw new Error(error.message || 'Failed to delete category');
    return true;
  }

  const res = await fetch(`${API_BASE}/api/admin/categories/${id}`, {
    method: 'DELETE',
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete category');
  return true;
}

// ============================================================================
// ADVERTISEMENTS API
// ============================================================================

async function getActiveAdvertisements() {
  if (isCloudSupabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('advertisements')
      .select('*')
      .eq('is_active', true)
      .order('order_index', { ascending: true });
    if (error) return [];
    return data || [];
  }

  const res = await fetch(API_BASE + '/api/ads');
  if (!res.ok) return [];
  return await res.json();
}

async function getAdminAdvertisements() {
  if (isCloudSupabaseConfigured()) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('advertisements')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return [];
    return data || [];
  }

  const res = await fetch(API_BASE + '/api/ads');
  if (!res.ok) return [];
  return await res.json();
}

async function saveAdvertisement(adData) {
  if (isCloudSupabaseConfigured()) {
    const sb = getSupabase();
    const payload = {
      name: adData.name,
      placement: adData.placement,
      image_url: adData.image_url,
      destination_url: adData.destination_url || '#',
      sponsor_title: adData.sponsor_title || null,
      sponsor_subtitle: adData.sponsor_subtitle || null,
      cta_text: adData.cta_text || 'क्लिक करें ↗',
      is_active: adData.is_active !== undefined ? Boolean(adData.is_active) : true,
      starts_at: adData.starts_at || null,
      ends_at: adData.ends_at || null,
      order_index: adData.order_index || 0
    };

    if (adData.id) {
      const { data, error } = await sb
        .from('advertisements')
        .update(payload)
        .eq('id', adData.id)
        .select()
        .single();
      if (error) throw new Error(error.message || 'Failed to update advertisement');
      return data;
    } else {
      const { data, error } = await sb
        .from('advertisements')
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(error.message || 'Failed to create advertisement');
      return data;
    }
  }

  const res = await fetch(API_BASE + '/api/admin/ads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify(adData)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save advertisement');
  return data;
}

async function deleteAdvertisement(id) {
  if (isCloudSupabaseConfigured()) {
    const sb = getSupabase();
    const { error } = await sb.from('advertisements').delete().eq('id', id);
    if (error) throw new Error(error.message || 'Failed to delete advertisement');
    return true;
  }

  const res = await fetch(`${API_BASE}/api/admin/ads/${id}`, {
    method: 'DELETE',
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete advertisement');
  return true;
}

// Export functions to window
window.HisarKiAawaj = {
  getSupabase,
  isCloudSupabaseConfigured,
  isLocalBackend,
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
  getTrashedArticles,
  restoreArticle,
  togglePublishArticle,
  purgeArticle,
  getCategories,
  saveCategory,
  deleteCategory,
  getActiveAdvertisements,
  getAdminAdvertisements,
  saveAdvertisement,
  deleteAdvertisement
};
