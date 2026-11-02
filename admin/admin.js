/**
 * HisarKiAawaj — Admin Dashboard Application Logic
 * Powers News CMS, Rich Text Editor, Category Manager, Ad Manager, and Supabase integration
 */

// State
const adminState = {
  currentView: 'viewDashboard',
  categories: [],
  articles: [],
  advertisements: [],
  activeAdmin: null,
  deleteTarget: null // { type: 'article' | 'category' | 'ad', id: string, name: string }
};

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', async () => {
  await initAdminSession();
  setupSidebarNav();
  setupStatusIndicator();
  setupArticleEditor();
  setupCategoryModal();
  setupAdModal();
  setupDeleteModal();
  setupSettingsView();

  // Load initial data
  await loadCategories();
  await loadDashboardMetrics();
  await loadManageNews();
  await loadAdvertisements();
});

// ============================================================================
// 1. AUTHENTICATION & SESSION CHECK
// ============================================================================
async function initAdminSession() {
  const isConfigured = window.HisarKiAawaj?.isSupabaseConfigured();
  
  if (!isConfigured) {
    // Demonstration Mode with warning pill
    adminState.activeAdmin = { email: 'admin@hisarkiaawaj.com', role: 'admin', full_name: 'Administrator (Demo Mode)' };
    document.getElementById('sidebarAdminName').textContent = 'Admin (Setup Mode)';
    return;
  }

  const sessionData = await window.HisarKiAawaj.requireAdminAuth('login.html');
  if (sessionData && sessionData.profile) {
    adminState.activeAdmin = sessionData.profile;
    document.getElementById('sidebarAdminName').textContent = sessionData.profile.full_name || sessionData.profile.email;
  }

  // Logout handler
  document.getElementById('btnAdminLogout')?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to sign out from the Admin Portal?')) {
      await window.HisarKiAawaj.signOutAdmin();
      window.location.href = 'login.html';
    }
  });
}

function setupStatusIndicator() {
  const pill = document.getElementById('supabaseStatusPill');
  const text = document.getElementById('supabaseStatusText');
  const isConfigured = window.HisarKiAawaj?.isSupabaseConfigured();

  if (isConfigured) {
    pill.className = 'connection-status-pill connected';
    text.textContent = 'Database Connected (Live)';
  } else {
    pill.className = 'connection-status-pill';
    text.textContent = 'Demo Mode (Keys Needed)';
  }
}

// ============================================================================
// 2. VIEW NAVIGATION
// ============================================================================
function setupSidebarNav() {
  const navBtns = document.querySelectorAll('.sidebar-nav-btn[data-view]');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetView = btn.getAttribute('data-view');
      switchToView(targetView);
    });
  });
}

window.switchToView = function(viewId) {
  adminState.currentView = viewId;

  // Update sidebar active buttons
  document.querySelectorAll('.sidebar-nav-btn[data-view]').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-view') === viewId);
  });

  // Show target view panel
  document.querySelectorAll('.admin-view-panel').forEach(panel => {
    panel.style.display = panel.id === viewId ? 'block' : 'none';
  });

  // Update Page Title
  const titles = {
    viewDashboard: 'Editorial Dashboard',
    viewManageNews: 'Manage Articles',
    viewArticleEditor: 'Article Editor',
    viewCategories: 'Manage Categories',
    viewAdvertisements: 'Manage Advertisements',
    viewSettings: 'Settings & Supabase',
    viewTrash: 'Trash Bin & Recovery'
  };
  document.getElementById('pageTitleText').textContent = titles[viewId] || 'Admin Portal';

  // Trigger view data refresh
  if (viewId === 'viewDashboard') loadDashboardMetrics();
  if (viewId === 'viewManageNews') loadManageNews();
  if (viewId === 'viewArticleEditor') {
    const catSelect = document.getElementById('editorCategorySelect');
    if (!catSelect || catSelect.children.length === 0) loadCategories();
  }
  if (viewId === 'viewCategories') loadCategoriesTable();
  if (viewId === 'viewAdvertisements') loadAdvertisementsTable();
  if (viewId === 'viewTrash') loadTrashView();
};

// ============================================================================
// 3. DASHBOARD METRICS & RECENT ARTICLES
// ============================================================================
async function loadDashboardMetrics() {
  let articles = [];
  let ads = [];

  if (window.HisarKiAawaj?.isSupabaseConfigured()) {
    const res = await window.HisarKiAawaj.getAdminArticles({ pageSize: 50 });
    articles = res?.articles || [];
    ads = await window.HisarKiAawaj.getAdminAdvertisements() || [];
  }
  // No fallback demo data — show empty state if backend unavailable

  adminState.articles = articles;
  adminState.advertisements = ads;

  const total = articles.length;
  const published = articles.filter(a => a.status === 'published').length;
  const draft = articles.filter(a => a.status === 'draft').length;
  const scheduled = articles.filter(a => a.status === 'scheduled').length;
  const activeAds = ads.filter(a => a.is_active).length;

  document.getElementById('metricTotalArticles').textContent = total;
  document.getElementById('metricPublishedArticles').textContent = published;
  document.getElementById('metricDraftArticles').textContent = draft;
  document.getElementById('metricScheduledArticles').textContent = scheduled;
  document.getElementById('metricActiveAds').textContent = activeAds;

  // Render recent 5 articles in dashboard table
  const tbody = document.getElementById('dashboardRecentTbody');
  if (tbody) {
    if (articles.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 20px;">No articles created yet. Click "+ Add New Article" to start.</td></tr>`;
      return;
    }

    tbody.innerHTML = articles.slice(0, 5).map(art => `
      <tr>
        <td>
          <div class="table-article-title-cell">
            <img src="${art.featured_image || 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=100'}" class="table-thumb" alt="thumb">
            <div>
              <div class="table-title-text">${art.title}</div>
              ${art.is_featured ? '<span class="badge-featured-star">★ FEATURED HERO</span>' : ''}
            </div>
          </div>
        </td>
        <td><span style="font-weight: 700; font-size: 12px;">${art.categories?.name || 'General'}</span></td>
        <td><span class="status-pill ${art.status}">${art.status}</span></td>
        <td style="color: #64748b; font-size: 12px;">${formatDate(art.published_at || art.created_at)}</td>
        <td>
          <div class="action-buttons-group">
            <button class="btn-table-action" title="Edit Article" onclick="editArticle('${art.id}')">✏️</button>
            <a href="../article.html?slug=${art.slug}" target="_blank" class="btn-table-action" title="View Public Article">👁️</a>
          </div>
        </td>
      </tr>
    `).join('');
  }
}

// ============================================================================
// 4. MANAGE NEWS (Search, Filter, Table)
// ============================================================================
async function loadManageNews() {
  const searchInput = document.getElementById('newsSearchInput');
  const statusFilter = document.getElementById('newsStatusFilter');
  const catFilter = document.getElementById('newsCategoryFilter');

  const search = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const status = statusFilter ? statusFilter.value : '';
  const categoryId = catFilter ? catFilter.value : '';

  let articles = [];
  if (window.HisarKiAawaj?.isSupabaseConfigured()) {
    const res = await window.HisarKiAawaj.getAdminArticles({ status, search, categoryId, pageSize: 50 });
    articles = res?.articles || [];
  }
  // No demo fallback — only real DB articles shown

  const tbody = document.getElementById('manageNewsTbody');
  if (!tbody) return;

  if (articles.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 24px;">No matching articles found.</td></tr>`;
    return;
  }

  tbody.innerHTML = articles.map(art => {
    let expiryBadge = '';
    if (art.expires_at) {
      const expTime = new Date(art.expires_at).getTime();
      const now = Date.now();
      if (now >= expTime) {
        expiryBadge = ' <span class="status-pill" style="background:#fee2e2;color:#dc2626;font-size:10px;margin-left:4px;">EXPIRED</span>';
      } else if (expTime - now < 24 * 60 * 60 * 1000) {
        expiryBadge = ' <span class="status-pill" style="background:#fef3c7;color:#b45309;font-size:10px;margin-left:4px;">EXPIRES SOON</span>';
      }
    }
    const langBadge = art.language === 'en'
      ? '<span style="font-size:10px;background:#e0f2fe;color:#0369a1;padding:2px 5px;border-radius:4px;font-weight:700;margin-left:4px;">EN</span>'
      : '<span style="font-size:10px;background:#fef3c7;color:#b45309;padding:2px 5px;border-radius:4px;font-weight:700;margin-left:4px;">HI</span>';

    return `
    <tr>
      <td>
        <div class="table-article-title-cell">
          <img src="${art.featured_image || 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=100'}" class="table-thumb" alt="thumb">
          <div>
            <div class="table-title-text">${art.title} ${langBadge}</div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">/${art.slug}</div>
            ${art.is_featured ? '<span class="badge-featured-star">★ FEATURED SPOTLIGHT</span>' : ''}
          </div>
        </div>
      </td>
      <td><span style="font-weight: 700; font-size: 12px;">${art.categories?.name || 'General'}</span></td>
      <td><span class="status-pill ${art.status}">${art.status}</span>${expiryBadge}</td>
      <td style="color: #64748b; font-size: 12px;">${formatDate(art.published_at || art.created_at)}</td>
      <td style="font-weight: 700; font-size: 12px; color: #475569;">${(art.views_count || 0).toLocaleString()}</td>
      <td style="text-align: right;">
        <div class="action-buttons-group" style="justify-content: flex-end;">
          <a href="../article.html?slug=${art.slug}" target="_blank" class="btn-table-action" title="View Public Post">👁️</a>
          <button class="btn-table-action" title="Edit Article" onclick="editArticle('${art.id}')">✏️</button>
          <button class="btn-table-action delete" title="Move to Trash" onclick="promptDelete('article', '${art.id}', '${escapeQuotes(art.title)}')">🗑️</button>
        </div>
      </td>
    </tr>
  `;
  }).join('');

  // Setup search & filter listener
  if (searchInput && !searchInput.dataset.listening) {
    searchInput.dataset.listening = 'true';
    searchInput.addEventListener('input', debounce(() => loadManageNews(), 300));
  }
  if (statusFilter && !statusFilter.dataset.listening) {
    statusFilter.dataset.listening = 'true';
    statusFilter.addEventListener('change', () => loadManageNews());
  }
  if (catFilter && !catFilter.dataset.listening) {
    catFilter.dataset.listening = 'true';
    catFilter.addEventListener('change', () => loadManageNews());
  }
}

// ============================================================================
// 5. ARTICLE EDITOR (Create & Edit)
// ============================================================================
function setupArticleEditor() {
  const form = document.getElementById('articleEditorForm');
  const titleInput = document.getElementById('editorTitle');
  const slugInput = document.getElementById('editorSlug');
  const fileInput = document.getElementById('featuredFileInput');
  const imgUrlInput = document.getElementById('editorFeaturedImgUrl');
  const previewImg = document.getElementById('featuredImgPreview');
  const previewHolder = document.getElementById('featuredImgPreviewHolder');
  const statusSelect = document.getElementById('editorStatusSelect');
  const dateGroup = document.getElementById('editorPublishDateGroup');
  const dateInput = document.getElementById('editorPublishDate');

  // Auto-generate slug from title
  titleInput?.addEventListener('input', () => {
    if (!slugInput.dataset.manual) {
      slugInput.value = generateSlug(titleInput.value);
    }
  });

  slugInput?.addEventListener('input', () => {
    slugInput.dataset.manual = slugInput.value.length > 0 ? 'true' : '';
  });

  // Handle Featured Image file upload to Supabase Storage
  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = (evt) => {
      previewImg.src = evt.target.result;
      previewHolder.style.display = 'block';
    };
    reader.readAsDataURL(file);

    if (window.HisarKiAawaj?.isSupabaseConfigured()) {
      showAdminToast('Uploading image...');
      try {
        const publicUrl = await window.HisarKiAawaj.uploadMediaFile(file, 'featured');
        imgUrlInput.value = publicUrl;
        showAdminToast('✅ Featured image uploaded successfully!');
      } catch (err) {
        alert('Image upload failed: ' + err.message);
      }
    } else {
      // Demo fallback: use data URL
      reader.onload = (evt) => {
        imgUrlInput.value = evt.target.result;
        previewImg.src = evt.target.result;
        previewHolder.style.display = 'block';
      };
    }
  });

  imgUrlInput?.addEventListener('input', () => {
    if (imgUrlInput.value.trim()) {
      previewImg.src = imgUrlInput.value.trim();
      previewHolder.style.display = 'block';
    } else {
      previewHolder.style.display = 'none';
    }
  });

  // Clear expiry date button
  document.getElementById('btnClearExpiresAt')?.addEventListener('click', () => {
    const exp = document.getElementById('editorExpiresAt');
    if (exp) exp.value = '';
  });

  // Toggle Scheduled date picker
  statusSelect?.addEventListener('change', () => {
    if (statusSelect.value === 'scheduled' && !dateInput.value) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      dateInput.value = tomorrow.toISOString().slice(0, 16);
    }
  });

  // Save Article Submit
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('btnSaveArticleSubmit');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving Article...';

    try {
      const id = document.getElementById('editorArticleId').value || null;
      const title = titleInput.value.trim();
      let slug = slugInput.value.trim() || generateSlug(title);
      const excerpt = document.getElementById('editorExcerpt').value.trim();
      const content = document.getElementById('editorContentCanvas').innerHTML.trim();
      const category_id = document.getElementById('editorCategorySelect').value || null;
      const author_name = document.getElementById('editorAuthorName').value.trim() || 'HisarKiAawaj Bureau';
      const featured_image = imgUrlInput.value.trim() || 'https://images.unsplash.com/photo-1577083552431-6e5fd01aa342?auto=format&fit=crop&w=1200&q=80';
      const status = statusSelect.value;
      const is_featured = document.getElementById('editorIsFeatured').checked;
      const seo_title = document.getElementById('editorSeoTitle').value.trim();
      const seo_description = document.getElementById('editorSeoDesc').value.trim();
      const language = document.getElementById('editorLanguage')?.value || 'hi';
      const expiresInput = document.getElementById('editorExpiresAt');
      let expires_at = null;
      if (expiresInput && expiresInput.value) {
        expires_at = new Date(expiresInput.value).toISOString();
      }
      
      let published_at = dateInput.value ? new Date(dateInput.value).toISOString() : null;
      if (status === 'published' && !published_at) {
        published_at = new Date().toISOString();
      }

      if (!content || content === '<br>') {
        alert('Please enter article content body.');
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Save & Publish Article';
        return;
      }

      const articleData = {
        id,
        title,
        slug,
        excerpt,
        content,
        category_id,
        author_name,
        featured_image,
        status,
        is_featured,
        seo_title,
        seo_description,
        published_at,
        language,
        expires_at
      };

      if (window.HisarKiAawaj?.isSupabaseConfigured()) {
        await window.HisarKiAawaj.saveArticle(articleData);
        showAdminToast('✅ Article saved successfully in database!');
      } else {
        // Demo fallback update in memory/local
        saveFallbackArticle(articleData);
        showAdminToast('✅ Article saved in demo memory!');
      }

      setTimeout(() => {
        switchToView('viewManageNews');
      }, 700);

    } catch (err) {
      alert('Error saving article: ' + err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Save & Publish Article';
    }
  });
}

// Reset Editor for adding new article
window.resetArticleEditor = function() {
  document.getElementById('editorArticleId').value = '';
  document.getElementById('editorTitle').value = '';
  document.getElementById('editorSlug').value = '';
  document.getElementById('editorSlug').dataset.manual = '';
  document.getElementById('editorExcerpt').value = '';
  document.getElementById('editorContentCanvas').innerHTML = '';
  document.getElementById('editorFeaturedImgUrl').value = '';
  document.getElementById('featuredImgPreviewHolder').style.display = 'none';
  document.getElementById('editorStatusSelect').value = 'published';
  document.getElementById('editorIsFeatured').checked = false;
  document.getElementById('editorSeoTitle').value = '';
  document.getElementById('editorSeoDesc').value = '';
  if (document.getElementById('editorLanguage')) document.getElementById('editorLanguage').value = 'hi';
  if (document.getElementById('editorExpiresAt')) document.getElementById('editorExpiresAt').value = '';
  
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('editorPublishDate').value = now.toISOString().slice(0, 16);
};

// Edit existing article
window.editArticle = async function(id) {
  let art = null;
  if (window.HisarKiAawaj?.isSupabaseConfigured()) {
    art = await window.HisarKiAawaj.getAdminArticleById(id);
  }

  if (!art) {
    alert('Article not found.');
    return;
  }

  switchToView('viewArticleEditor');

  document.getElementById('editorArticleId').value = art.id;
  document.getElementById('editorTitle').value = art.title;
  document.getElementById('editorSlug').value = art.slug;
  document.getElementById('editorSlug').dataset.manual = 'true';
  document.getElementById('editorExcerpt').value = art.excerpt || '';
  document.getElementById('editorContentCanvas').innerHTML = art.content || '';
  document.getElementById('editorCategorySelect').value = art.category_id || '';
  document.getElementById('editorAuthorName').value = art.author_name || 'HisarKiAawaj Bureau';
  document.getElementById('editorFeaturedImgUrl').value = art.featured_image || '';
  document.getElementById('editorStatusSelect').value = art.status;
  document.getElementById('editorIsFeatured').checked = !!art.is_featured;
  document.getElementById('editorSeoTitle').value = art.seo_title || '';
  document.getElementById('editorSeoDesc').value = art.seo_description || '';
  if (document.getElementById('editorLanguage')) document.getElementById('editorLanguage').value = art.language || 'hi';
  if (document.getElementById('editorExpiresAt')) {
    if (art.expires_at) {
      const expDate = new Date(art.expires_at);
      expDate.setMinutes(expDate.getMinutes() - expDate.getTimezoneOffset());
      document.getElementById('editorExpiresAt').value = expDate.toISOString().slice(0, 16);
    } else {
      document.getElementById('editorExpiresAt').value = '';
    }
  }

  if (art.featured_image) {
    document.getElementById('featuredImgPreview').src = art.featured_image;
    document.getElementById('featuredImgPreviewHolder').style.display = 'block';
  } else {
    document.getElementById('featuredImgPreviewHolder').style.display = 'none';
  }

  if (art.published_at) {
    const pubDate = new Date(art.published_at);
    pubDate.setMinutes(pubDate.getMinutes() - pubDate.getTimezoneOffset());
    document.getElementById('editorPublishDate').value = pubDate.toISOString().slice(0, 16);
  }
};

// Rich Editor Toolbar commands
window.execEditorCommand = function(cmd, val = null) {
  document.execCommand(cmd, false, val);
  document.getElementById('editorContentCanvas').focus();
};

window.insertEditorLink = function() {
  const url = prompt('Enter link URL (e.g. https://...):');
  if (url) {
    document.execCommand('createLink', false, url);
  }
};

window.insertInlineImagePrompt = function() {
  const url = prompt('Enter image URL:');
  if (url) {
    document.execCommand('insertImage', false, url);
  }
};

// ============================================================================
// 6. CATEGORIES MANAGER
// ============================================================================
async function loadCategories() {
  let categories = [];
  try {
    if (window.HisarKiAawaj?.isSupabaseConfigured()) {
      categories = await window.HisarKiAawaj.getCategories() || [];
    }
  } catch (err) {
    console.warn('Could not fetch categories from backend:', err);
  }

  // If no categories in DB yet, use standard fallback categories
  if (!categories || categories.length === 0) {
    categories = getFallbackCategories();
  }
  adminState.categories = categories;

  // Populate category dropdowns
  const editorCatSelect = document.getElementById('editorCategorySelect');
  const filterCatSelect = document.getElementById('newsCategoryFilter');

  if (editorCatSelect) {
    editorCatSelect.innerHTML = categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  if (filterCatSelect) {
    filterCatSelect.innerHTML = `<option value="">All Categories</option>` +
      categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }
}

async function loadCategoriesTable() {
  await loadCategories();
  const tbody = document.getElementById('categoriesTbody');
  if (!tbody) return;

  if (adminState.categories.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 20px;">No categories found. Click "+ Add New Category" to create one.</td></tr>`;
    return;
  }

  tbody.innerHTML = adminState.categories.map(c => `
    <tr>
      <td style="font-weight: 800; color: var(--text-dark);">${c.name}</td>
      <td><code>${c.slug}</code></td>
      <td style="color: #64748b; font-size: 12px;">${c.description || '—'}</td>
      <td style="text-align: right;">
        <div class="action-buttons-group" style="justify-content: flex-end;">
          <button class="btn-table-action" title="Edit Category" onclick="editCategory('${c.id}')">✏️</button>
          <button class="btn-table-action delete" title="Delete Category" onclick="promptDelete('category', '${c.id}', '${c.name}')">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function setupCategoryModal() {
  const modal = document.getElementById('categoryEditorModal');
  const form = document.getElementById('categoryEditorForm');

  window.openAddCategoryModal = function() {
    document.getElementById('categoryId').value = '';
    document.getElementById('categoryName').value = '';
    document.getElementById('categorySlug').value = '';
    document.getElementById('categoryDescription').value = '';
    document.getElementById('categoryModalTitle').textContent = 'Add Category';
    modal.classList.add('active');
  };

  window.editCategory = function(id) {
    const c = adminState.categories.find(x => x.id === id);
    if (!c) return;
    document.getElementById('categoryId').value = c.id;
    document.getElementById('categoryName').value = c.name;
    document.getElementById('categorySlug').value = c.slug;
    document.getElementById('categoryDescription').value = c.description || '';
    document.getElementById('categoryModalTitle').textContent = 'Edit Category';
    modal.classList.add('active');
  };

  window.closeCategoryModal = function() {
    modal.classList.remove('active');
  };

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('categoryId').value || null;
    const name = document.getElementById('categoryName').value.trim();
    const slug = document.getElementById('categorySlug').value.trim() || generateSlug(name);
    const description = document.getElementById('categoryDescription').value.trim();

    try {
      if (window.HisarKiAawaj?.isSupabaseConfigured()) {
        await window.HisarKiAawaj.saveCategory({ id, name, slug, description });
        showAdminToast('Category saved successfully!');
      } else {
        if (id) {
          const item = adminState.categories.find(x => x.id === id);
          if (item) { item.name = name; item.slug = slug; item.description = description; }
        } else {
          adminState.categories.push({ id: 'cat_' + Date.now(), name, slug, description });
        }
        showAdminToast('Category saved in demo mode!');
      }
      closeCategoryModal();
      loadCategoriesTable();
    } catch (err) {
      alert('Error saving category: ' + err.message);
    }
  });
}

// ============================================================================
// 7. ADVERTISEMENTS MANAGER
// ============================================================================
async function loadAdvertisements() {
  let ads = [];
  if (window.HisarKiAawaj?.isSupabaseConfigured()) {
    ads = await window.HisarKiAawaj.getAdminAdvertisements() || [];
  } else {
    ads = getFallbackAds();
  }
  adminState.advertisements = ads;
}

async function loadAdvertisementsTable() {
  await loadAdvertisements();
  const tbody = document.getElementById('advertisementsTbody');
  if (!tbody) return;

  const placementLabels = {
    top_leaderboard: 'Top Leaderboard (970x90)',
    infeed_between_hero: 'In-Feed 1 (Between Spotlight & Grid)',
    infeed_card: 'In-Feed Native Card (Inside Grid)',
    infeed_between_rows: 'In-Feed 2 (Between Post Rows)',
    sidebar_carousel: 'Sidebar Carousel (3/6)',
    our_clients: 'Our Clients Showcase',
    in_article: 'In-Article Sponsored Unit'
  };

  if (adminState.advertisements.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 24px;">No advertisements configured. Click "+ Add New Advertisement".</td></tr>`;
    return;
  }

  tbody.innerHTML = adminState.advertisements.map(ad => `
    <tr>
      <td>
        <img src="${ad.image_url}" style="width: 70px; height: 36px; object-fit: cover; border-radius: 4px;" alt="banner">
      </td>
      <td>
        <span style="font-weight: 700; font-size: 12px; color: var(--text-dark);">
          ${placementLabels[ad.placement] || ad.placement}
        </span>
      </td>
      <td>
        <div style="font-weight: 700; font-size: 13px;">${ad.sponsor_title || ad.name}</div>
        <div style="font-size: 11px; color: #64748b;">${ad.destination_url || '#'}</div>
      </td>
      <td>
        <span class="status-pill ${ad.is_active ? 'active' : 'inactive'}">
          ${ad.is_active ? '● Active' : '○ Inactive'}
        </span>
      </td>
      <td style="font-size: 11px; color: #64748b;">
        ${ad.starts_at ? formatDate(ad.starts_at) : 'Always'} &rarr; ${ad.ends_at ? formatDate(ad.ends_at) : 'Forever'}
      </td>
      <td style="text-align: right;">
        <div class="action-buttons-group" style="justify-content: flex-end;">
          <button class="btn-table-action" title="Toggle Active Status" onclick="toggleAdStatus('${ad.id}')">
            ${ad.is_active ? '⏸️' : '▶️'}
          </button>
          <button class="btn-table-action" title="Edit Advertisement" onclick="editAd('${ad.id}')">✏️</button>
          <button class="btn-table-action delete" title="Delete Advertisement" onclick="promptDelete('ad', '${ad.id}', '${escapeQuotes(ad.name)}')">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function setupAdModal() {
  const modal = document.getElementById('adEditorModal');
  const form = document.getElementById('adEditorForm');
  const fileInput = document.getElementById('adImageFileInput');
  const urlInput = document.getElementById('adImageUrl');
  const preview = document.getElementById('adImagePreview');
  const previewBox = document.getElementById('adImagePreviewBox');

  // Handle image upload to Supabase Storage
  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      preview.src = evt.target.result;
      previewBox.style.display = 'block';
    };
    reader.readAsDataURL(file);

    if (window.HisarKiAawaj?.isSupabaseConfigured()) {
      showAdminToast('Uploading banner image...');
      try {
        const publicUrl = await window.HisarKiAawaj.uploadMediaFile(file, 'ads');
        urlInput.value = publicUrl;
        showAdminToast('✅ Banner image uploaded successfully!');
      } catch (err) {
        alert('Upload failed: ' + err.message);
      }
    } else {
      reader.onload = (evt) => {
        urlInput.value = evt.target.result;
        preview.src = evt.target.result;
        previewBox.style.display = 'block';
      };
    }
  });

  urlInput?.addEventListener('input', () => {
    if (urlInput.value.trim()) {
      preview.src = urlInput.value.trim();
      previewBox.style.display = 'block';
    } else {
      previewBox.style.display = 'none';
    }
  });

  window.openAddAdModal = function() {
    document.getElementById('adId').value = '';
    document.getElementById('adName').value = '';
    document.getElementById('adPlacement').value = 'top_leaderboard';
    document.getElementById('adImageUrl').value = '';
    document.getElementById('adDestinationUrl').value = '';
    document.getElementById('adSponsorTitle').value = '';
    document.getElementById('adCtaText').value = 'परामर्श लें ↗';
    document.getElementById('adIsActive').checked = true;
    previewBox.style.display = 'none';
    document.getElementById('adModalTitle').textContent = 'Add Advertisement';
    modal.classList.add('active');
  };

  window.editAd = function(id) {
    const ad = adminState.advertisements.find(a => a.id === id);
    if (!ad) return;

    document.getElementById('adId').value = ad.id;
    document.getElementById('adName').value = ad.name;
    document.getElementById('adPlacement').value = ad.placement;
    document.getElementById('adImageUrl').value = ad.image_url;
    document.getElementById('adDestinationUrl').value = ad.destination_url || '';
    document.getElementById('adSponsorTitle').value = ad.sponsor_title || '';
    document.getElementById('adCtaText').value = ad.cta_text || 'क्लिक करें ↗';
    document.getElementById('adIsActive').checked = !!ad.is_active;

    if (ad.image_url) {
      preview.src = ad.image_url;
      previewBox.style.display = 'block';
    } else {
      previewBox.style.display = 'none';
    }

    document.getElementById('adModalTitle').textContent = 'Edit Advertisement';
    modal.classList.add('active');
  };

  window.closeAdModal = function() {
    modal.classList.remove('active');
  };

  window.toggleAdStatus = async function(id) {
    const ad = adminState.advertisements.find(a => a.id === id);
    if (!ad) return;

    ad.is_active = !ad.is_active;
    if (window.HisarKiAawaj?.isSupabaseConfigured()) {
      await window.HisarKiAawaj.saveAdvertisement(ad);
    }
    showAdminToast(ad.is_active ? 'Advertisement activated!' : 'Advertisement paused.');
    loadAdvertisementsTable();
  };

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('adId').value || null;
    const name = document.getElementById('adName').value.trim();
    const placement = document.getElementById('adPlacement').value;
    const image_url = urlInput.value.trim();
    const destination_url = document.getElementById('adDestinationUrl').value.trim() || '#';
    const sponsor_title = document.getElementById('adSponsorTitle').value.trim();
    const cta_text = document.getElementById('adCtaText').value.trim() || 'क्लिक करें ↗';
    const is_active = document.getElementById('adIsActive').checked;

    if (!image_url) {
      alert('Please upload an image banner or provide an image URL.');
      return;
    }

    const adData = {
      id,
      name,
      placement,
      image_url,
      destination_url,
      sponsor_title,
      cta_text,
      is_active
    };

    try {
      if (window.HisarKiAawaj?.isSupabaseConfigured()) {
        await window.HisarKiAawaj.saveAdvertisement(adData);
        showAdminToast('✅ Advertisement saved successfully!');
      } else {
        if (id) {
          const item = adminState.advertisements.find(a => a.id === id);
          if (item) Object.assign(item, adData);
        } else {
          adminState.advertisements.push({ ...adData, id: 'ad_' + Date.now() });
        }
        showAdminToast('Advertisement saved in demo mode!');
      }

      closeAdModal();
      loadAdvertisementsTable();
    } catch (err) {
      alert('Error saving ad: ' + err.message);
    }
  });
}

// ============================================================================
// 8. DELETION & TRASH MANAGEMENT
// ============================================================================
function setupDeleteModal() {
  const modal = document.getElementById('deleteConfirmModal');
  const msgEl = document.getElementById('deleteModalMessage');
  const confirmBtn = document.getElementById('btnConfirmDelete');

  window.promptDelete = function(type, id, name) {
    adminState.deleteTarget = { type, id, name };
    if (type === 'article') {
      msgEl.textContent = `Move "${name}" to Trash? It will be removed from all public pages immediately and can be recovered later from the Trash Bin.`;
      confirmBtn.textContent = 'Move to Trash';
    } else {
      msgEl.textContent = `Are you sure you want to permanently delete "${name}"? This action cannot be reversed.`;
      confirmBtn.textContent = 'Delete Record';
    }
    modal.classList.add('active');
  };

  window.promptPurgeArticle = function(id, name) {
    adminState.deleteTarget = { type: 'purge-article', id, name };
    msgEl.textContent = `PERMANENTLY DELETE "${name}"? This will physically erase the story from the database. This action CANNOT be undone.`;
    confirmBtn.textContent = 'Permanently Delete';
    modal.classList.add('active');
  };

  window.closeDeleteModal = function() {
    modal.classList.remove('active');
    adminState.deleteTarget = null;
  };

  confirmBtn?.addEventListener('click', async () => {
    if (!adminState.deleteTarget) return;
    const { type, id } = adminState.deleteTarget;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Processing...';

    try {
      if (type === 'purge-article') {
        if (window.HisarKiAawaj?.isSupabaseConfigured()) {
          await window.HisarKiAawaj.purgeArticle(id);
        }
        showAdminToast('Article permanently deleted from database.');
        closeDeleteModal();
        loadTrashView();
        loadDashboardMetrics();
        return;
      }

      if (window.HisarKiAawaj?.isSupabaseConfigured()) {
        if (type === 'article') await window.HisarKiAawaj.deleteArticle(id);
        if (type === 'category') await window.HisarKiAawaj.deleteCategory(id);
        if (type === 'ad') await window.HisarKiAawaj.deleteAdvertisement(id);
      } else {
        if (type === 'article') adminState.articles = adminState.articles.filter(a => a.id !== id);
        if (type === 'category') adminState.categories = adminState.categories.filter(c => c.id !== id);
        if (type === 'ad') adminState.advertisements = adminState.advertisements.filter(a => a.id !== id);
      }

      showAdminToast(type === 'article' ? 'Article moved to Trash.' : 'Record deleted successfully.');
      closeDeleteModal();

      if (type === 'article') { loadManageNews(); loadDashboardMetrics(); }
      if (type === 'category') loadCategoriesTable();
      if (type === 'ad') loadAdvertisementsTable();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm';
    }
  });
}

// Trash Bin View loader
window.loadTrashView = async function() {
  const tbody = document.getElementById('trashTbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 24px;">Loading trashed articles...</td></tr>`;

  try {
    let trashed = [];
    if (window.HisarKiAawaj?.isSupabaseConfigured()) {
      trashed = await window.HisarKiAawaj.getTrashedArticles();
    }

    if (!trashed || trashed.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 32px;">Trash is empty. No deleted articles.</td></tr>`;
      return;
    }

    tbody.innerHTML = trashed.map(art => `
      <tr>
        <td>
          <div class="table-article-title-cell">
            <img src="${art.featured_image || 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=100'}" class="table-thumb" alt="thumb">
            <div>
              <div class="table-title-text">${art.title}</div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">/${art.slug}</div>
            </div>
          </div>
        </td>
        <td><span style="font-weight: 700; font-size: 12px;">${(art.language || 'hi').toUpperCase()}</span></td>
        <td style="color: #ef4444; font-size: 12px; font-weight: 600;">${formatDate(art.deleted_at || art.created_at)}</td>
        <td style="text-align: right;">
          <div class="action-buttons-group" style="justify-content: flex-end;">
            <button class="btn-table-action" style="color: #059669; font-weight: 700;" title="Restore Article" onclick="restoreTrashedArticle('${art.id}')">🔄 Restore</button>
            <button class="btn-table-action delete" style="color: #dc2626;" title="Permanently Delete" onclick="promptPurgeArticle('${art.id}', '${escapeQuotes(art.title)}')">❌ Permanent Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #dc2626; padding: 24px;">Error loading trash: ${err.message}</td></tr>`;
  }
};

window.restoreTrashedArticle = async function(id) {
  try {
    if (window.HisarKiAawaj?.isSupabaseConfigured()) {
      await window.HisarKiAawaj.restoreArticle(id);
    }
    showAdminToast('✅ Article restored successfully!');
    loadTrashView();
    loadDashboardMetrics();
  } catch (err) {
    alert('Restore failed: ' + err.message);
  }
};

// ============================================================================
// 9. SETTINGS VIEW
// ============================================================================
function setupSettingsView() {
  const urlInput = document.getElementById('settingsSupabaseUrl');
  const keyInput = document.getElementById('settingsSupabaseKey');
  const saveBtn = document.getElementById('btnSaveSettingsKeys');
  const testBtn = document.getElementById('btnTestSupabaseConnection');

  urlInput.value = window.SUPABASE_CONFIG?.url || '';
  keyInput.value = window.SUPABASE_CONFIG?.anonKey || '';

  saveBtn?.addEventListener('click', () => {
    const url = urlInput.value.trim();
    const key = keyInput.value.trim();
    if (url && key) {
      localStorage.setItem('hisarkiaawaj_supabase_url', url);
      localStorage.setItem('hisarkiaawaj_supabase_anon_key', key);
      showAdminToast('✅ Configuration saved. Reloading page...');
      setTimeout(() => window.location.reload(), 800);
    }
  });

  testBtn?.addEventListener('click', async () => {
    testBtn.disabled = true;
    testBtn.textContent = 'Testing connection...';
    try {
      const sb = window.HisarKiAawaj?.getSupabase();
      if (!sb) throw new Error('Supabase client could not be initialized.');

      const { data, error } = await sb.from('categories').select('count', { count: 'exact', head: true });
      if (error) throw error;

      alert('🎉 Connection Successful! Your Supabase database is connected and responding.');
    } catch (err) {
      alert('Connection Test Failed: ' + err.message + '\n\nPlease ensure schema.sql has been executed in your Supabase SQL editor.');
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = 'Test Live Connection';
    }
  });
}

// ============================================================================
// UTILITIES & FALLBACK DATA (For instant setup & preview)
// ============================================================================
function generateSlug(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '') + '-' + Date.now().toString(36);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('hi-IN', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeQuotes(str) {
  return (str || '').replace(/'/g, "\\'");
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function showAdminToast(msg) {
  let toast = document.getElementById('adminToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'adminToast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #0f172a;
      color: #ffffff;
      padding: 12px 22px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 700;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      z-index: 9999;
      transition: all 0.25s;
      border: 1px solid rgba(255,255,255,0.1);
      opacity: 0;
    `;
    document.body.appendChild(toast);
  }

  toast.textContent = msg;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(-10px)';

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(0)';
  }, 2800);
}

// Fallback items for seamless demonstration before keys are entered
function getFallbackCategories() {
  return [
    { id: 'cat-1', name: 'हिसार विशेष', slug: 'hisar-special', description: 'हिसार शहर की स्थानीय खबरें' },
    { id: 'cat-2', name: 'हरियाणा', slug: 'haryana', description: 'राज्य स्तरीय नीतियां' },
    { id: 'cat-3', name: 'क्राइम व जांच', slug: 'crime', description: 'पुलिस व कानून व्यवस्था' },
    { id: 'cat-4', name: 'मंडी भाव', slug: 'mandi-rates', description: 'अनाज मंडी दैनिक दरें' },
    { id: 'cat-5', name: 'शिक्षा-करियर', slug: 'education', description: 'युवा, कॉलेज व भर्ती' },
    { id: 'cat-6', name: 'कारोबार', slug: 'business', description: 'व्यापार व उद्योग' }
  ];
}

function getFallbackArticles() {
  return [];
}

function saveFallbackArticle(art) {
  // no-op
}

function getFallbackAds() {
  return [];
}
