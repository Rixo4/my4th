try { localStorage.removeItem('hisarkiaawaj_custom_ads'); } catch(_) {}
/**
 * HisarKiAawaj (हिसार की आवाज़) — Public Website Application Logic
 * Covers: Homepage, Category Page, Search Page, Article Page
 * Integrates live Supabase PostgreSQL data with graceful fallback.
 */

'use strict';

// ============================================================================
// GLOBAL APP STATE
// ============================================================================
const appState = {
  lang: 'hi',
  visitorCount: 2095309,
  currentEditingSlot: null,
  sidebarCarouselIndex: 1,
  highlightAds: false,
  publishedArticles: [],
  activeAds: [],
  sidebarCarouselAds: [],
  breakingPaused: false,
  breakingIndex: 0,
  breakingItems: [],
};

// i18n labels (extend as needed)
const i18nLabels = {
  hi: {
    search_placeholder: 'समाचार शीर्षक, शहर या विषय दर्ज करें...',
    read_more: 'पूरी खबर ↗',
    home: 'होम',
    loading: 'लोड हो रहा है...',
    no_results: 'कोई समाचार नहीं मिला',
    admin_login: 'Admin Login',
  },
  en: {
    search_placeholder: 'Enter headline, city or topic...',
    read_more: 'Read More ↗',
    home: 'Home',
    loading: 'Loading...',
    no_results: 'No articles found',
    admin_login: 'Admin Login',
  },
};

// Global search function for tag chips and inline search triggers
window.executeSearchWithTerm = function(term) {
  if (term) {
    window.location.href = `search.html?q=${encodeURIComponent(term)}`;
  }
};

// ============================================================================
// ENTRY POINT — detect which page we're on and initialise accordingly
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  const path = window.location.pathname.toLowerCase();
  const page = path.split('/').pop() || 'index.html';

  // Shared across all pages
  setupLiveDateTime();
  setupLanguageSwitcher();
  setupMobileDrawer();
  setupEditionDropdown();
  setupNavbarUtilityButtons();
  setupBreakingNewsTicker();
  setupTrendingCarousel();
  setupVisitorCounter();
  setupBackToTop();

  if (page === '' || page === 'index.html' || page === '/') {
    await initHomePage();
  } else if (page === 'category.html') {
    await initCategoryPage();
  } else if (page === 'search.html') {
    await initSearchPage();
  } else if (page === 'article.html') {
    // article page has its own inline <script> — just share utilities
    await loadBreakingArticles();
  }
});

// ============================================================================
// 1. LIVE IST DATE / TIME
// ============================================================================
function setupLiveDateTime() {
  const el = document.getElementById('liveDateTimeIst');
  if (!el) return;

  const daysHi = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];
  const daysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthsHi = ['जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];

  function tick() {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const dayName = appState.lang === 'hi' ? daysHi[now.getDay()] : daysEn[now.getDay()];
    const month = monthsHi[now.getMonth()];
    const date = now.getDate();
    const year = now.getFullYear();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    el.textContent = `${dayName}, ${date} ${month} ${year} | ${h}:${m} IST`;
  }

  tick();
  setInterval(tick, 30000);
}

// ============================================================================
// 2. LANGUAGE SWITCHER
// ============================================================================
function setupLanguageSwitcher() {
  const btn = document.getElementById('langToggleBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    appState.lang = appState.lang === 'hi' ? 'en' : 'hi';
    btn.textContent = appState.lang === 'hi' ? 'EN / हिंदी' : 'हिंदी / EN';
    showNotification(appState.lang === 'hi' ? '🌐 भाषा: हिंदी' : '🌐 Language: English');
    setupLiveDateTime(); // re-render date in new language
  });
}

// ============================================================================
// 3. MOBILE OFF-CANVAS DRAWER
// ============================================================================
function setupMobileDrawer() {
  const menuBtn = document.getElementById('mobileMenuBtn');
  const backdrop = document.getElementById('mobileNavBackdrop');
  const drawer = document.getElementById('mobileNavDrawer');
  const closeBtn = document.getElementById('mobileDrawerCloseBtn');
  const mobileSearchInput = document.getElementById('mobileSearchInput');

  function openDrawer() {
    backdrop?.classList.add('active');
    drawer?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    backdrop?.classList.remove('active');
    drawer?.classList.remove('active');
    document.body.style.overflow = '';
  }

  menuBtn?.addEventListener('click', openDrawer);
  backdrop?.addEventListener('click', closeDrawer);
  closeBtn?.addEventListener('click', closeDrawer);

  // Mobile search: navigate to search page on Enter
  mobileSearchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = mobileSearchInput.value.trim();
      if (q) window.location.href = `search.html?q=${encodeURIComponent(q)}`;
    }
  });

  // Close drawer on nav link click
  drawer?.querySelectorAll('.mobile-drawer-link, .mobile-district-chip').forEach(link => {
    link.addEventListener('click', closeDrawer);
  });
}

// ============================================================================
// 4. EDITION DROPDOWN
// ============================================================================
function setupEditionDropdown() {
  const chip = document.getElementById('editionSelectChip');
  const menu = document.getElementById('editionDropdownMenu');
  const label = document.getElementById('currentEditionLabel');
  if (!chip || !menu) return;

  const editionNames = {
    hisar: 'हिसार (Hisar)',
    hansi: 'हांसी (Hansi)',
    fatehabad: 'फतेहाबाद (Fatehabad)',
    sirsa: 'सिरसा (Sirsa)',
    bhiwani: 'भिवानी (Bhiwani)',
    rohtak: 'रोहतक (Rohtak)',
    chandigarh: 'चंडीगढ़',
  };

  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('active');
  });

  menu.querySelectorAll('.edition-dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      const edition = item.dataset.edition;
      menu.querySelectorAll('.edition-dropdown-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      if (label) label.textContent = `🇮🇳 ${editionNames[edition] || edition.toUpperCase()} ▾`;
      menu.classList.remove('active');
      showNotification(`📍 संस्करण: ${editionNames[edition] || edition}`);
    });
  });

  document.addEventListener('click', () => menu.classList.remove('active'));
}

// ============================================================================
// 5. NAVBAR UTILITY BUTTONS (Live TV, E-Paper, AQI, Alerts, Search, Ad Desk)
// ============================================================================
function setupNavbarUtilityButtons() {
  // Helper: open/close public modal
  function openModal(id) {
    document.getElementById(id)?.classList.add('active');
  }
  function closeModal(id) {
    document.getElementById(id)?.classList.remove('active');
  }

  // Wire close buttons
  const closeMap = {
    closeLiveTvModal: 'liveTvModal',
    closeEPaperModal: 'ePaperModal',
    closeWeatherModal: 'weatherAqiModal',
    closeNotificationsModal: 'notificationsModal',
    closeSearchModal: 'searchModal',
    closeAdInquiryModal: 'advertiseInquiryModal',
  };
  Object.entries(closeMap).forEach(([btnId, modalId]) => {
    document.getElementById(btnId)?.addEventListener('click', () => closeModal(modalId));
  });

  // Close modal on backdrop click
  document.querySelectorAll('.public-modal-backdrop').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  });

  // Wire open buttons
  document.getElementById('liveTvBtn')?.addEventListener('click', () => openModal('liveTvModal'));
  document.getElementById('ePaperBtn')?.addEventListener('click', () => openModal('ePaperModal'));
  document.getElementById('aqiBtn')?.addEventListener('click', () => openModal('weatherAqiModal'));
  document.getElementById('mastheadWeatherWidget')?.addEventListener('click', () => openModal('weatherAqiModal'));
  document.getElementById('notificationsBtn')?.addEventListener('click', () => openModal('notificationsModal'));
  document.getElementById('headerSearchBtn')?.addEventListener('click', () => {
    openModal('searchModal');
    setTimeout(() => document.getElementById('quickSearchInput')?.focus(), 100);
  });

  // Ad inquiry buttons (public)
  ['btnHeaderPostAd', 'btnFooterAdDesk', 'footerAdRatesLink', 'btnHeaderPostAd2'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', (e) => {
      e.preventDefault();
      openModal('advertiseInquiryModal');
    });
  });

  // Quick search from modal
  const quickSearchInput = document.getElementById('quickSearchInput');
  const quickSearchBtn = document.getElementById('btnQuickSearchSubmit');
  const previewBox = document.getElementById('quickSearchResultsPreview');

  function doQuickSearch() {
    const q = quickSearchInput?.value.trim();
    if (q) window.location.href = `search.html?q=${encodeURIComponent(q)}`;
    else window.location.href = `search.html`;
  }

  quickSearchBtn?.addEventListener('click', doQuickSearch);
  quickSearchInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doQuickSearch(); });

  // Live instant search preview as user types
  let searchDebounceTimer = null;
  quickSearchInput?.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    const q = quickSearchInput.value.trim().toLowerCase();
    if (!previewBox) return;

    if (q.length < 2) {
      previewBox.style.display = 'none';
      previewBox.innerHTML = '';
      return;
    }

    searchDebounceTimer = setTimeout(async () => {
      const pool = (appState.publishedArticles && appState.publishedArticles.length > 0)
        ? appState.publishedArticles
        : FALLBACK_ARTICLES;

      let matches = pool.filter(a =>
        (a.title && a.title.toLowerCase().includes(q)) ||
        (a.excerpt && a.excerpt.toLowerCase().includes(q))
      ).slice(0, 4);

      if (matches.length === 0 && window.HisarKiAawaj?.isSupabaseConfigured()) {
        try {
          const liveResults = await window.HisarKiAawaj.searchPublicArticles(q, { limit: 4 });
          if (liveResults && liveResults.length > 0) matches = liveResults;
        } catch (_) {}
      }

      if (matches.length > 0) {
        previewBox.style.display = 'flex';
        previewBox.innerHTML = `
          <div style="font-size:11px;font-weight:800;color:var(--text-muted);margin-bottom:4px;">त्वरित परिणाम:</div>
          ${matches.map(m => `
            <a href="article.html?slug=${m.slug}" class="instant-search-item">
              <img src="${m.featured_image || 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=100'}"
                   alt="${m.title}" class="instant-search-thumb"
                   onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=100';">
              <div class="instant-search-info">
                <div class="instant-search-title">${m.title}</div>
                <div class="instant-search-meta">
                  <span style="color:var(--brand-red);font-weight:700;">${m.category_name || m.categories?.name || 'समाचार'}</span>
                  <span>•</span>
                  <span>${formatTimeAgo(m.published_at || m.created_at)}</span>
                </div>
              </div>
            </a>
          `).join('')}
          <div style="text-align:right;margin-top:6px;">
            <a href="search.html?q=${encodeURIComponent(q)}" style="font-size:12px;font-weight:800;color:var(--brand-red);text-decoration:none;">
              सभी परिणाम देखें ('${q}') ↗
            </a>
          </div>
        `;
      } else {
        previewBox.style.display = 'block';
        previewBox.innerHTML = `
          <div style="text-align:center;padding:12px;color:var(--text-muted);font-size:12px;">
            कोई परिणाम नहीं मिला। <button onclick="window.location.href='search.html?q=${encodeURIComponent(q)}'" style="color:var(--brand-red);font-weight:700;background:none;border:none;cursor:pointer;text-decoration:underline;">विस्तृत खोज करें ↗</button>
          </div>
        `;
      }
    }, 180);
  });

  // Keyboard: Esc closes any open modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.public-modal-backdrop.active').forEach(m => m.classList.remove('active'));
    }
  });
}

// ============================================================================
// 6. BREAKING NEWS TICKER — rotating clickable headlines
// ============================================================================
async function loadBreakingArticles() {
  if (window.HisarKiAawaj?.isSupabaseConfigured()) {
    try {
      const articles = await window.HisarKiAawaj.getPublicArticles({ limit: 6 });
      if (articles && articles.length > 0) {
        appState.breakingItems = articles.map(a => ({ title: a.title, slug: a.slug }));
        return;
      }
    } catch (_) {}
  }
  appState.breakingItems = (FALLBACK_ARTICLES && FALLBACK_ARTICLES.length > 0)
    ? FALLBACK_ARTICLES.slice(0, 5).map(a => ({ title: a.title, slug: a.slug }))
    : [{ title: 'हिसार की आवाज़ — निष्पक्ष, निडर और सटीक डिजिटल पत्रकारिता', slug: null }];
}

function setupBreakingNewsTicker() {
  const container = document.getElementById('breakingNewsContainer');
  const tickerText = document.getElementById('breakingTickerText');
  const closeBtn = document.getElementById('btnCloseBreaking');
  const pauseBtn = document.getElementById('btnPauseBreaking');
  if (!tickerText) return;

  // Load articles then start ticker
  loadBreakingArticles().then(() => {
    startBreakingRotation();
  });

  function startBreakingRotation() {
    if (appState.breakingItems.length === 0) return;

    function showNext() {
      if (appState.breakingPaused) return;
      const item = appState.breakingItems[appState.breakingIndex];
      tickerText.textContent = item.title;
      tickerText.style.cursor = item.slug ? 'pointer' : 'default';
      tickerText.onclick = item.slug
        ? () => { window.location.href = `article.html?slug=${item.slug}`; }
        : null;
      appState.breakingIndex = (appState.breakingIndex + 1) % appState.breakingItems.length;
    }

    showNext();
    setInterval(showNext, 5000);
  }

  closeBtn?.addEventListener('click', () => {
    container.style.display = 'none';
  });

  pauseBtn?.addEventListener('click', () => {
    appState.breakingPaused = !appState.breakingPaused;
    pauseBtn.textContent = appState.breakingPaused ? '▶' : '⏸';
  });
}

// ============================================================================
// 7. TRENDING PILLS CAROUSEL
// ============================================================================
function setupTrendingCarousel() {
  const prev = document.getElementById('btnTrendPrev');
  const next = document.getElementById('btnTrendNext');
  const row = document.getElementById('trendingPillsRow');
  if (!row) return;

  prev?.addEventListener('click', () => row.scrollBy({ left: -240, behavior: 'smooth' }));
  next?.addEventListener('click', () => row.scrollBy({ left: 240, behavior: 'smooth' }));
}

// ============================================================================
// 8. VISITOR COUNTER (animated)
// ============================================================================
function setupVisitorCounter() {
  const el = document.getElementById('visitorCounterHits');
  if (!el) return;
  setInterval(() => {
    appState.visitorCount += Math.floor(Math.random() * 3) + 1;
    el.textContent = appState.visitorCount.toLocaleString('en-IN') + ' hits';
  }, 4500);
}

// ============================================================================
// 9. BACK TO TOP BUTTON
// ============================================================================
function setupBackToTop() {
  let btn = document.getElementById('backToTopBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'backToTopBtn';
    btn.innerHTML = '↑';
    btn.style.cssText = `
      position:fixed; bottom:28px; right:22px;
      background:var(--brand-red); color:#fff;
      border:none; width:42px; height:42px; border-radius:50%;
      font-size:18px; font-weight:900; cursor:pointer;
      box-shadow:0 4px 14px rgba(197,22,45,.3);
      opacity:0; transition:opacity .3s; z-index:1000;
    `;
    document.body.appendChild(btn);
  }

  window.addEventListener('scroll', () => {
    btn.style.opacity = window.scrollY > 400 ? '1' : '0';
    btn.style.pointerEvents = window.scrollY > 400 ? 'auto' : 'none';
  });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ============================================================================
// 10. HOMEPAGE INIT
// ============================================================================
async function initHomePage() {
  function renderAll(articles) {
    appState.publishedArticles = articles;
    renderSpotlightFromData(articles);
    renderNewsGridFromData(articles);
    renderTrendingPillsFromArticles(articles);

    const notifList = document.getElementById('notificationsList');
    if (notifList) {
      notifList.innerHTML = articles.slice(0, 5).map(art => `
        <a href="article.html?slug=${art.slug}" style="padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; display: block; background: #fff1f2; text-decoration: none; color: inherit;">
          <span style="font-size: 10px; background: var(--brand-red); color: #fff; padding: 2px 6px; border-radius: 3px; font-weight: 800;">ताज़ा अलर्ट</span>
          <h5 style="font-size: 13px; font-weight: 800; margin: 6px 0 2px; color: var(--text-dark);">${art.title}</h5>
          <span style="font-size: 11px; color: var(--text-muted);">${formatTimeAgo(art.published_at || art.created_at)}</span>
        </a>
      `).join('');
    }
  }

  if (window.HisarKiAawaj?.isSupabaseConfigured()) {
    try {
      // Load ads first so carousel can use them
      const ads = await window.HisarKiAawaj.getActiveAdvertisements();
      if (ads && ads.length > 0) {
        appState.activeAds = ads;
        renderAdvertisementsFromData(ads);
      }

      const articles = await window.HisarKiAawaj.getPublicArticles({ limit: 12 });
      if (articles && articles.length > 0) {
        renderAll(articles);
      } else {
        renderAll(FALLBACK_ARTICLES);
      }
    } catch (err) {
      console.warn('Backend load failed, fallback articles active:', err);
      renderAll(FALLBACK_ARTICLES);
    }
  } else {
    renderAll(FALLBACK_ARTICLES);
  }

  // Setup carousel after ads have been loaded
  setupCarousel();
}

// Render Spotlight Hero from Database
function renderSpotlightFromData(articles) {
  const container = document.getElementById('spotlightContainer');
  if (!container) return;

  const spotlight = articles.find(a => a.is_featured) || articles[0];
  if (!spotlight) {
    container.innerHTML = '';
    return;
  }

  const categoryName = spotlight.category_name || spotlight.categories?.name || 'हिसार विशेष';
  const imgUrl = spotlight.featured_image || 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=1200';

  container.innerHTML = `
    <article class="spotlight-news-card" onclick="window.location.href='article.html?slug=${spotlight.slug}'" style="cursor: pointer;">
      <div class="spotlight-image-holder">
        <img src="${imgUrl}"
             alt="${spotlight.title}"
             class="spotlight-img"
             loading="eager"
             decoding="async"
             onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=1200';">
        <div class="spotlight-overlay"></div>
        <span class="spotlight-kicker-tag">${categoryName}</span>
      </div>
      <div class="spotlight-body">
        <h2 class="spotlight-headline">${spotlight.title}</h2>
        <p class="spotlight-excerpt">${spotlight.excerpt || ''}</p>
        <div class="spotlight-meta-footer">
          <span>${spotlight.author_name || 'HisarKiAawaj Bureau'}</span>
          <span>🕒 ${formatTimeAgo(spotlight.published_at || spotlight.created_at)}</span>
        </div>
      </div>
    </article>
  `;
}

// Render 2-Column News Grid from Database
function renderNewsGridFromData(articles) {
  const grid = document.getElementById('hisarNewsGrid');
  if (!grid) return;

  const hero = articles.find(a => a.is_featured) || articles[0];
  const list = articles.filter(a => a.id !== hero?.id);

  if (list.length === 0) {
    grid.innerHTML = '';
    return;
  }

  // Native in-feed ad slot if available
  const infeedAd = appState.activeAds?.find(a => a.placement === 'infeed_card');
  const infeedAdCardHtml = infeedAd ? `
    <div class="infeed-card-ad" id="adSlotInfeedCard">
      <div class="ad-slot-header" style="margin-bottom: 8px;">
        <span class="ad-slot-label" style="color: var(--gold-accent);">⭐ प्रायोजित कार्ड · SPONSORED</span>
      </div>
      <a href="${infeedAd.destination_url || '#'}" class="ad-banner-link" target="_blank" rel="noopener">
        <div class="ad-visual-card" style="padding: 14px; min-height: 140px; background: #fff; border: 1px solid var(--border-color); border-radius: 8px;">
          <h4 class="ad-visual-title" style="font-size: 15px;">${infeedAd.name}</h4>
          <p class="ad-visual-subtitle">${infeedAd.sponsor_title || ''}</p>
          <span class="ad-cta-pill-white" style="margin-top: 8px; display: inline-block;">${infeedAd.cta_text || 'क्लिक करें ↗'}</span>
        </div>
      </a>
    </div>
  ` : '';

  grid.innerHTML = list.map((art, idx) => `
    <article class="regional-news-card" onclick="window.location.href='article.html?slug=${art.slug}'" style="cursor:pointer;">
      <div class="regional-img-box">
        <img src="${art.featured_image || 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=600'}"
             alt="${art.title}"
             loading="lazy"
             decoding="async"
             onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=600';">
        <span class="card-live-pill">${art.category_name || art.categories?.name || 'हिसार विशेष'}</span>
      </div>
      <div class="regional-card-content">
        <span class="regional-category-tag">${art.category_name || art.categories?.name || 'हिसार विशेष'}</span>
        <h3 class="regional-card-title">${art.title}</h3>
        <div class="regional-card-meta">
          <span>${formatDate(art.published_at || art.created_at)}</span>
          <span style="color:var(--brand-red);font-weight:700;">पूरी खबर ↗</span>
        </div>
      </div>
    </article>
    ${idx === 1 && infeedAdCardHtml ? infeedAdCardHtml : ''}
  `).join('');
}

// Clean empty homepage state when no articles are published yet
function renderEmptyHomePageState() {
  const container = document.getElementById('spotlightContainer');
  if (container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 48px 20px; background: #fff; border: 1px solid var(--border-color); border-radius: 12px; margin-bottom: 24px;">
        <div style="font-size: 38px; margin-bottom: 12px;">📰</div>
        <h3 style="font-size: 18px; font-weight: 800; color: var(--text-dark); margin-bottom: 6px;">हिसार की आवाज़ — आपका डिजिटल न्यूज़ पोर्टल</h3>
        <p style="font-size: 13px; color: var(--text-muted); max-width: 500px; margin: 0 auto;">अभी कोई समाचार प्रकाशित नहीं हुआ है। व्यवस्थापक द्वारा नए समाचार प्रकाशित किए जाने पर वे यहां प्रदर्शित होंगे।</p>
      </div>
    `;
  }
  const grid = document.getElementById('hisarNewsGrid');
  if (grid) grid.innerHTML = '';
}

// Populate trending pills with curated news topics and articles
function renderTrendingPillsFromArticles(articles) {
  const row = document.getElementById('trendingPillsRow');
  if (!row) return;

  const curated = [
    { text: '#हिसार विशेष', href: 'category.html?slug=hisar-special' },
    { text: '#हरियाणा Tak', href: 'category.html?slug=haryana' },
    { text: '#मंडी भाव 🔴', href: 'category.html?slug=mandi-rates', color: '#b45309' },
    { text: '#क्राइम व जांच', href: 'category.html?slug=crime' },
    { text: '#शिक्षा व करियर', href: 'category.html?slug=education' },
    { text: '#कारोबार व बाजार', href: 'category.html?slug=business' },
    { text: '#खेलकूद', href: 'category.html?slug=sports' },
    { text: '#लाइफस्टाइल', href: 'category.html?slug=lifestyle' },
  ];

  row.innerHTML = curated.map(c => `
    <a href="${c.href}" class="topic-pill" ${c.color ? `style="color:${c.color};border-color:#fed7aa;"` : ''}>${c.text}</a>
  `).join('');
}

// Render Ads from Database
function renderAdvertisementsFromData(ads) {
  const sidebarAds = [];
  const ourClientAds = [];

  ads.forEach(ad => {
    const map = {
      top_leaderboard: 'adSlotTopLeaderboard',
      infeed_between_hero: 'adSlotBetweenHeroAndGrid',
      infeed_card: 'adSlotInfeedCard',
      infeed_between_rows: 'adSlotBetweenNewsRows',
    };
    if (ad.placement === 'sidebar_carousel') {
      sidebarAds.push(ad);
    } else if (ad.placement === 'our_clients') {
      ourClientAds.push(ad);
    } else {
      const containerId = map[ad.placement];
      if (containerId) applyLiveAdToSlot(containerId, ad);
    }
  });

  // Rebuild sidebar carousel from DB ads only
  if (sidebarAds.length > 0) {
    appState.sidebarCarouselAds = sidebarAds;
  }

  // Render "Our Clients" panel from DB
  renderOurClientsFromAds(ourClientAds);
}

function renderOurClientsFromAds(ads) {
  const panel = document.getElementById('adSlotOurClients');
  const grid = document.getElementById('ourClientsGrid');
  if (!panel) return;
  if (!ads || ads.length === 0) {
    panel.style.display = 'none';
    return;
  }
  if (grid) {
    grid.innerHTML = ads.map(ad => `
      <div class="client-ad-item">
        <a href="${ad.destination_url || '#'}" class="client-ad-link" target="_blank" rel="noopener"
           style="display:block; padding: 10px; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0; text-decoration: none;">
          ${ad.image_url
            ? `<img src="${ad.image_url}" alt="${ad.name}" style="width:100%;height:60px;object-fit:cover;border-radius:6px;margin-bottom:6px;">`
            : ''}
          <div style="font-size: 12px; font-weight: 800; color: var(--text-dark);">${ad.name}</div>
          ${ad.sponsor_title ? `<div style="font-size: 11px; color: #64748b;">${ad.sponsor_title}</div>` : ''}
        </a>
      </div>
    `).join('');
  }
  panel.style.display = 'block';
}

function applyLiveAdToSlot(slotId, ad) {
  const container = document.getElementById(slotId);
  if (!container) return;

  const linkEl = container.querySelector('.ad-banner-link') || container.querySelector('a');
  if (!linkEl) return;

  if (ad.destination_url) linkEl.href = ad.destination_url;
  if (ad.image_url) {
    linkEl.innerHTML = `<img src="${ad.image_url}" alt="${ad.name}" style="width:100%;object-fit:cover;border-radius:8px;max-height:120px;">`;
  }
  // Show the container now that it has a live ad
  container.style.display = '';
}

// ============================================================================
// 11. CATEGORY PAGE INIT
// ============================================================================
const CATEGORY_META = {
  'hisar-special': { name: 'हिसार विशेष', nameEn: 'Hisar Special', desc: 'हिसार शहर और आसपास के जिलों की स्थानीय ताज़ा खबरें' },
  'haryana':       { name: 'हरियाणा',      nameEn: 'Haryana',       desc: 'हरियाणा राज्य स्तरीय विकास, नीतियां और राजनीतिक समाचार' },
  'crime':         { name: 'क्राइम व जांच', nameEn: 'Crime',         desc: 'अपराध, कानून व्यवस्था और पुलिस जांच की विस्तृत रिपोर्ट' },
  'mandi-rates':   { name: 'मंडी भाव',      nameEn: 'Mandi Rates',   desc: 'हिसार व हरियाणा की कृषि अनाज मंडियों के दैनिक भाव बुलेटिन' },
  'education':     { name: 'शिक्षा-करियर',  nameEn: 'Education',     desc: 'विश्वविद्यालय, स्कूल प्रवेश, सरकारी नौकरी और करियर अपडेट' },
  'business':      { name: 'कारोबार',       nameEn: 'Business',      desc: 'व्यापार, उद्योग, स्थानीय बाजार और आर्थिक नीतियां' },
  'sports':        { name: 'खेल',           nameEn: 'Sports',        desc: 'जिला व राज्य स्तरीय खेल प्रतियोगिताएं और खिलाड़ी समाचार' },
  'lifestyle':     { name: 'लाइफस्टाइल',    nameEn: 'Lifestyle',     desc: 'कला, संस्कृति, स्वास्थ्य, मनोरंजन और जनजीवन' },
};

const FALLBACK_ARTICLES = [
  {
    id: 1,
    title: 'हिसार में नई 4-लेन आउटर रिंग रोड व बाईपास परियोजना को मिली अंतिम वित्तीय स्वीकृति',
    slug: 'hisar-new-ring-road-project-approved-2026',
    excerpt: 'हिसार शहर को भारी ट्रैफिक और जाम से मिलेगी बड़ी राहत, 860 करोड़ रुपये की लागत से 4-लेन आउटर रिंग रोड का निर्माण कार्य जल्द होगा शुरू।',
    content: 'हिसार शहर के विकास को नई रफ्तार मिलने जा रही है। शहर में बढ़ रहे ट्रैफिक दबाव और जाम की गंभीर समस्या के समाधान के लिए रिंग रोड परियोजना को केंद्र व राज्य सरकार से अंतिम वित्तीय मंजूरी मिल गई है। इस परियोजना के अंतर्गत हिसार-दिल्ली, हिसार-राजगढ़ और हिसार-सिरसा राष्ट्रीय राजमार्गों को सीधे आपस में जोड़ा जाएगा, जिससे भारी वाहनों को शहर के भीतर प्रवेश किए बिना ही सीधा बाईपास मिलेगा। लोक निर्माण विभाग के अनुसार आगामी माह से निर्माण कार्य की शुरुआत होगी।',
    featured_image: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=1200',
    category_id: 1,
    category_name: 'हिसार विशेष',
    categories: { id: 1, name: 'हिसार विशेष', slug: 'hisar-special' },
    is_featured: true,
    published_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    author_name: 'हिसार ब्यूरो',
  },
  {
    id: 2,
    title: 'हांसी-महम-रोहतक नई रेलवे लाइन पर पैसेंजर ट्रेनों का स्पीड ट्रायल सफल, नियमित संचालन की तैयारी',
    slug: 'hansi-meham-rohtak-new-railway-line-speed-trial-success',
    excerpt: 'उत्तर रेलवे द्वारा 120 किमी/घंटे की गति से ट्रायल पूरा किया गया। हांसी व आसपास के यात्रियों को दिल्ली व रोहतक के लिए मिलेगा सीधा रेल मार्ग।',
    content: 'हांसी और रोहतक के बीच नव-निर्मित रेल मार्ग पर मुख्य संरक्षा आयुक्त की देखरेख में हाई-स्पीड ट्रायल सफलतापूर्वक संपन्न हुआ। इस नई लाइन के शुरू होने से हांसी से दिल्ली की दूरी लगभग 40 किलोमीटर कम हो जाएगी और यात्रा का समय 1 घंटा घट जाएगा। रेलवे अधिकारियों के मुताबिक अगले पखवाड़े से नियमित पैसेंजर ट्रेनों का संचालन शुरू कर दिया जाएगा।',
    featured_image: 'https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=800',
    category_id: 1,
    category_name: 'हिसार विशेष',
    categories: { id: 1, name: 'हिसार विशेष', slug: 'hisar-special' },
    is_featured: false,
    published_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    author_name: 'विशेष संवाददाता, हांसी',
  },
  {
    id: 3,
    title: 'हरियाणा कृषि अनाज मंडियों में सरसों व कपास की बंपर आवक, न्यूनतम समर्थन मूल्य से ऊंचे दामों पर सौदे',
    slug: 'haryana-mandi-bhav-mustard-cotton-arrivals-surge',
    excerpt: 'हिसार, आदमपुर, बरवाला और हांसी अनाज मंडियों में सरसों ₹5,450 व नरमा ₹7,120 प्रति क्विंटल बिका। किसानों के चेहरों पर लौटी रौनक।',
    content: 'हरियाणा की प्रमुख अनाज मंडियों में रबी और खरीफ विपणन सत्र के तहत कृषि जिंसों की आवक में भारी उछाल दर्ज किया गया है। हिसार व आदमपुर मंडी में बेहतरीन गुणवत्ता वाली सरसों की खरीद सरकारी एमएसपी से भी अधिक दामों पर हो रही है। व्यापारियों का कहना है कि खाद्य तेलों की घरेलू मांग मजबूत रहने के कारण दामों में मजबूती बनी हुई है।',
    featured_image: 'https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?w=800',
    category_id: 4,
    category_name: 'मंडी भाव',
    categories: { id: 4, name: 'मंडी भाव', slug: 'mandi-rates' },
    is_featured: false,
    published_at: new Date(Date.now() - 3600000 * 8).toISOString(),
    author_name: 'कृषि डेस्क, हिसार',
  },
  {
    id: 4,
    title: 'हरियाणा सरकार का युवाओं के लिए बड़ा फैसला: ग्रुप-सी व ग्रुप-डी CET भर्ती परीक्षा का नया शेड्यूल जारी',
    slug: 'haryana-cet-group-c-d-exam-schedule-announced-hssc',
    excerpt: 'हरियाणा कर्मचारी चयन आयोग (HSSC) ने 24,000 रिक्त पदों की भर्ती परीक्षा के लिए विस्तृत दिशानिर्देश और तिथियां घोषित कीं।',
    content: 'हरियाणा सरकार ने प्रदेश के लाखों युवाओं के हित में बड़ा निर्णय लेते हुए ग्रुप-सी और डी की विभिन्न श्रेणी की भर्तियों के लिए सीईटी परीक्षा का नया कैलेंडर जारी कर दिया है। आयोग के अनुसार परीक्षा केंद्रों पर तकनीकी सुरक्षा व्यवस्था अनिवार्य की गई है ताकि परीक्षा निष्पक्ष व पारदर्शी तरीके से पूरी हो सके।',
    featured_image: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800',
    category_id: 5,
    category_name: 'शिक्षा-करियर',
    categories: { id: 5, name: 'शिक्षा-करियर', slug: 'education' },
    is_featured: false,
    published_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    author_name: 'चंडीगढ़ ब्यूरो',
  },
  {
    id: 5,
    title: 'हिसार पुलिस की साइबर क्राइम यूनिट का बड़ा एक्शन: फर्जी डिजिटल अरेस्ट करने वाले अंतरराज्यीय गिरोह के 4 आरोपी गिरफ्तार',
    slug: 'hisar-police-cyber-crime-cell-arrests-digital-arrest-gang',
    excerpt: 'सीबीआई और पुलिस अधिकारी बनकर बुजुर्गों और व्यापारियों से ठगी करने वाले गिरोह के कब्जे से 14 मोबाइल व चेकबुक बरामद।',
    content: 'हिसार पुलिस अधीक्षक के दिशा-निर्देशन में साइबर अपराध शाखा ने एक अंतरराज्यीय गिरोह का पर्दाफाश कर चार आरोपियों को गिरफ्तार किया है। आरोपी वरिष्ठ नागरिकों को डिजिटल अरेस्ट का डर दिखाकर पैसे ऐंठते थे। पुलिस ने इनके पास से कई बैंक खाते, सिम कार्ड और लैपटॉप सीज किए हैं।',
    featured_image: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800',
    category_id: 3,
    category_name: 'क्राइम व जांच',
    categories: { id: 3, name: 'क्राइम व जांच', slug: 'crime' },
    is_featured: false,
    published_at: new Date(Date.now() - 3600000 * 16).toISOString(),
    author_name: 'क्राइम टीम, हिसार',
  },
  {
    id: 6,
    title: 'चौधरी चरण सिंह हरियाणा कृषि विश्वविद्यालय (HAU) हिसार में कम पानी में अधिक पैदावार देने वाली गेहूं किस्म विकसित',
    slug: 'hau-hisar-develops-new-high-yield-wheat-variety',
    excerpt: 'कृषि वैज्ञानिकों ने 12 वर्षों के शोध के बाद विकसित की किस्म WH-1402, रोग प्रतिरोधक क्षमता और पोषण में उत्कृष्ट परिणाम।',
    content: 'सीसीएस एचएयू हिसार के कृषि वैज्ञानिकों ने एक और ऐतिहासिक उपलब्धि हासिल की है। विश्वविद्यालय के पौधा प्रजनन एवं अनुवांशिकी विभाग द्वारा विकसित की गई नई गेहूं किस्म सीमित सिंचाई वाले क्षेत्रों के किसानों के लिए वरदान साबित होगी। यह किस्म पीला रतुआ और भूरा रतुआ रोगों के प्रति पूर्णतः प्रतिरोधी है।',
    featured_image: 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=800',
    category_id: 2,
    category_name: 'हरियाणा',
    categories: { id: 2, name: 'हरियाणा', slug: 'haryana' },
    is_featured: false,
    published_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    author_name: 'HAU ब्यूरो',
  },
  {
    id: 7,
    title: 'हिसार इंडस्ट्रियल एरिया में सौर ऊर्जा आधारित नए ग्रीन एमएसएमई पार्क को राज्य कैबिनेट की मंजूरी',
    slug: 'hisar-industrial-area-green-msme-park-cabinet-approval',
    excerpt: 'हिसार में 250 एकड़ भूमि पर 500 नई औद्योगिक इकाइयां लगेंगी, 12,000 से अधिक स्थानीय युवाओं को मिलेंगे प्रत्यक्ष रोजगार अवसर।',
    content: 'मुख्यमंत्री की अध्यक्षता में हुई उच्चस्तरीय कैबिनेट बैठक में हिसार में ग्रीन इंडस्ट्रियल एमएसएमई पार्क की स्थापना को औपचारिक स्वीकृति दे दी गई है। इस पार्क में इंजीनियरिंग, फूड प्रोसेसिंग और ऑटो कंपोनेंट निर्माण इकाइयों को विशेष सब्सिडी और सिंगल विंडो क्लीयरेंस की सुविधा मिलेगी।',
    featured_image: 'https://images.unsplash.com/photo-1509391365360-2e959784a276?w=800',
    category_id: 6,
    category_name: 'कारोबार',
    categories: { id: 6, name: 'कारोबार', slug: 'business' },
    is_featured: false,
    published_at: new Date(Date.now() - 3600000 * 30).toISOString(),
    author_name: 'बिजनेस डेस्क',
  },
  {
    id: 8,
    title: 'हरियाणा स्टेट बॉक्सिंग चैंपियनशिप में हिसार की युवा प्रतिभाओं का दबदबा, 6 स्वर्ण पदक जीतकर बने ओवरऑल चैंपियन',
    slug: 'haryana-state-boxing-championship-hisar-boxers-gold',
    excerpt: 'महाबीर स्टेडियम के मुक्केबाजों ने फाइनल मुकाबलों में शानदार प्रदर्शन कर टीम ट्रॉफी हिसार जिले के नाम की।',
    content: 'रोहतक में आयोजित 36वीं हरियाणा राज्य सीनियर मुक्केबाजी प्रतियोगिता में हिसार के खिलाड़ियों ने अपनी श्रेष्ठता साबित करते हुए ओवरऑल विजेता ट्रॉफी पर कब्जा जमाया। कोच और खेल संघ के पदाधिकारियों ने पदक विजेताओं का हिसार पहुंचने पर भव्य स्वागत किया।',
    featured_image: 'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=800',
    category_id: 7,
    category_name: 'खेल',
    categories: { id: 7, name: 'खेल', slug: 'sports' },
    is_featured: false,
    published_at: new Date(Date.now() - 3600000 * 36).toISOString(),
    author_name: 'स्पोर्ट्स डेस्क',
  }
];

let categoryOffset = 0;
const CATEGORY_PAGE_SIZE = 8;

async function initCategoryPage() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug') || 'hisar-special';
  const meta = CATEGORY_META[slug] || { name: slug, desc: '' };

  // Highlight active nav item
  document.querySelectorAll('.aajtak-nav-item[data-cat]').forEach(a => {
    a.classList.toggle('active', a.dataset.cat === slug);
  });

  // Set page meta
  document.title = `${meta.name} समाचार | HisarKiAawaj`;
  const titleEl = document.getElementById('categoryPageTitle');
  if (titleEl) titleEl.textContent = `${meta.name} समाचार | HisarKiAawaj`;
  document.getElementById('categoryTitle')?.textContent && (document.getElementById('categoryTitle').textContent = meta.name);
  document.getElementById('categoryDesc')?.textContent && (document.getElementById('categoryDesc').textContent = meta.desc);
  document.getElementById('categoryBadge')?.textContent && (document.getElementById('categoryBadge').textContent = (meta.nameEn || meta.name).toUpperCase());
  document.getElementById('breadcrumbCategoryText')?.textContent && (document.getElementById('breadcrumbCategoryText').textContent = meta.name);

  categoryOffset = 0;
  await loadCategoryArticles(slug, false);

  // Load More button
  document.getElementById('btnCategoryLoadMore')?.addEventListener('click', () => {
    loadCategoryArticles(slug, true);
  });

  // Subcategory / district filter pills
  setupSubcatFilterPills();

  const districtParam = params.get('district');
  if (districtParam) {
    setTimeout(() => {
      const pill = document.querySelector(`.subcat-pill[data-filter="${districtParam}"]`);
      if (pill) pill.click();
    }, 150);
  }
}

// Subcategory pill filter — client-side keyword filtering on rendered article cards
function setupSubcatFilterPills() {
  const pillsContainer = document.getElementById('subcatFilterPills');
  if (!pillsContainer) return;

  // Keywords matched against article card headline text
  const districtKeywords = {
    all: null,
    hisar: ['हिसार', 'hisar', 'शहर'],
    hansi: ['हांसी', 'hansi'],
    barwala: ['बरवाला', 'barwala'],
    adampur: ['आदमपुर', 'adampur'],
    agroha: ['अग्रोहा', 'agroha'],
    recent: null,
  };

  pillsContainer.querySelectorAll('.subcat-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      // Update active pill styling
      pillsContainer.querySelectorAll('.subcat-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const filter = pill.dataset.filter || 'all';
      const keywords = districtKeywords[filter];
      const grid = document.getElementById('categoryArticlesGrid');
      if (!grid) return;

      const cards = Array.from(grid.querySelectorAll('article.regional-news-card'));

      if (filter === 'all' || !keywords) {
        // Show all cards
        cards.forEach(card => { card.style.display = ''; });
        return;
      }

      // Filter cards whose headline contains any of the keywords
      cards.forEach(card => {
        const text = (card.querySelector('h3')?.textContent || '').toLowerCase();
        const matches = keywords.some(kw => text.includes(kw.toLowerCase()));
        card.style.display = matches ? '' : 'none';
      });
    });
  });
}

async function loadCategoryArticles(slug, append = false) {
  const grid = document.getElementById('categoryArticlesGrid');
  const heroBox = document.getElementById('categoryHeroBox');
  const emptyBox = document.getElementById('categoryEmptyBox');
  const paginationBar = document.getElementById('categoryPaginationBar');
  const countEl = document.getElementById('categoryArticleCount');
  if (!grid) return;

  if (!append) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">⏳ समाचार लोड हो रहे हैं...</div>`;
  }

  let articles = [];
  let totalCount = 0;

  if (window.HisarKiAawaj?.isSupabaseConfigured()) {
    try {
      const result = await window.HisarKiAawaj.getPublicArticles({
        limit: CATEGORY_PAGE_SIZE,
        categorySlug: slug,
        offset: categoryOffset,
      });
      articles = result || [];
      totalCount = articles.totalCount || articles.length;
    } catch (err) {
      console.warn('Category fetch failed:', err);
    }
  }

  // Fallback
  if (articles.length === 0) {
    articles = FALLBACK_ARTICLES.filter(a => slug === 'hisar-special' || a.categories?.slug === slug);
    if (articles.length === 0) articles = FALLBACK_ARTICLES.slice(0, 4);
    totalCount = articles.length;
  }

  if (countEl) countEl.textContent = totalCount;

  if (articles.length === 0 && !append) {
    grid.style.display = 'none';
    heroBox.style.display = 'none';
    emptyBox.style.display = 'block';
    paginationBar.style.display = 'none';
    return;
  }

  emptyBox.style.display = 'none';
  grid.style.display = 'grid';

  // Render hero (first article, only on initial load)
  if (!append && heroBox && articles.length > 0) {
    const hero = articles[0];
    heroBox.innerHTML = `
      <article class="spotlight-news-card" onclick="window.location.href='article.html?slug=${hero.slug}'" style="cursor:pointer;">
        <div class="spotlight-image-holder">
          <img src="${hero.featured_image || 'https://images.unsplash.com/photo-1577083552431-6e5fd01aa342?w=1200'}"
               alt="${hero.title}"
               class="spotlight-img"
               loading="eager"
               decoding="async"
               onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1577083552431-6e5fd01aa342?w=1200';">
          <div class="spotlight-overlay"></div>
          <span class="spotlight-kicker-tag">${hero.categories?.name || 'हिसार विशेष'}</span>
        </div>
        <div class="spotlight-body">
          <h2 class="spotlight-headline">${hero.title}</h2>
          <p class="spotlight-excerpt">${hero.excerpt || ''}</p>
          <div class="spotlight-meta-footer">
            <span>${hero.author_name || 'HisarKiAawaj Bureau'}</span>
            <span>🕒 ${formatTimeAgo(hero.published_at)}</span>
          </div>
        </div>
      </article>`;
  }

  // Cards (skip first if shown as hero)
  const cardArticles = append ? articles : articles.slice(1);
  const newCards = cardArticles.map(art => `
    <article class="regional-news-card" onclick="window.location.href='article.html?slug=${art.slug}'" style="cursor:pointer;">
      <div class="regional-img-box">
        <img src="${art.featured_image || 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=600'}"
             alt="${art.title}"
             loading="lazy"
             decoding="async"
             onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1544717305-2782549b5136?w=600';">
        <span class="card-live-pill">${art.category_name || art.categories?.name || 'हिसार विशेष'}</span>
      </div>
      <div class="regional-card-content">
        <span class="regional-category-tag">${art.category_name || art.categories?.name || 'हिसार विशेष'}</span>
        <h3 class="regional-card-title">${art.title}</h3>
        <div class="regional-card-meta">
          <span>${formatDate(art.published_at || art.created_at)}</span>
          <span style="color:var(--brand-red);font-weight:700;">पूरी खबर ↗</span>
        </div>
      </div>
    </article>
  `).join('');

  if (append) {
    grid.insertAdjacentHTML('beforeend', newCards);
  } else {
    grid.innerHTML = newCards;
  }

  categoryOffset += articles.length;

  // Show/hide Load More
  const hasMore = categoryOffset < totalCount;
  if (paginationBar) paginationBar.style.display = hasMore ? 'flex' : 'none';
}

// ============================================================================
// 12. SEARCH PAGE INIT
// ============================================================================
async function initSearchPage() {
  const params = new URLSearchParams(window.location.search);
  const query = (params.get('q') || '').trim();

  const mainInput = document.getElementById('mainSearchInput');
  const submitBtn = document.getElementById('btnExecuteSearch');
  const queryTextEl = document.getElementById('searchResultsQueryText');
  const countEl = document.getElementById('searchResultsCountText');
  const listEl = document.getElementById('searchResultsList');
  const emptyBox = document.getElementById('searchNoResultsBox');

  if (mainInput && query) mainInput.value = query;
  if (queryTextEl) queryTextEl.textContent = `"${query || '...'}"`;

  // Wire submit
  function doSearch() {
    const q = mainInput?.value.trim() || query;
    if (q) window.location.href = `search.html?q=${encodeURIComponent(q)}`;
  }
  submitBtn?.addEventListener('click', doSearch);
  mainInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  // Global exposed function for tag chips
  window.executeSearchWithTerm = (term) => {
    window.location.href = `search.html?q=${encodeURIComponent(term)}`;
  };

  if (!query) {
    if (countEl) countEl.textContent = 'कोई खोज शब्द नहीं — ऊपर खोज करें';
    if (listEl) listEl.innerHTML = '';
    emptyBox?.style && (emptyBox.style.display = 'none');
    return;
  }

  if (countEl) countEl.textContent = 'खोज जारी है...';

  let results = [];

  if (window.HisarKiAawaj?.isSupabaseConfigured()) {
    try {
      results = await window.HisarKiAawaj.searchPublicArticles(query, { limit: 20 });
      results = results || [];
    } catch (err) {
      console.warn('Search failed:', err);
    }
  }

  // Fallback: search in local demo articles
  if (results.length === 0) {
    results = FALLBACK_ARTICLES.filter(a =>
      a.title.toLowerCase().includes(query.toLowerCase()) ||
      (a.excerpt || '').toLowerCase().includes(query.toLowerCase())
    );
  }

  if (results.length === 0) {
    if (countEl) countEl.textContent = '0 समाचार मिले';
    if (listEl) listEl.innerHTML = '';
    if (emptyBox) emptyBox.style.display = 'block';
    return;
  }

  if (emptyBox) emptyBox.style.display = 'none';
  if (countEl) countEl.textContent = `${results.length} समाचार मिले`;

  function highlight(text, term) {
    if (!term || !text) return text;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(escaped, 'gi'), m => `<mark class="highlight-match">${m}</mark>`);
  }

  listEl.innerHTML = results.map(art => `
    <div class="search-result-card" onclick="window.location.href='article.html?slug=${art.slug}'" style="cursor:pointer;">
      <img class="search-result-img"
           src="${art.featured_image || 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=400'}"
           alt="${art.title}"
           loading="lazy"
           decoding="async"
           onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1544717305-2782549b5136?w=400';">
      <div>
        <div style="margin-bottom:4px;">
          <span class="regional-category-tag">${art.category_name || art.categories?.name || 'हिसार विशेष'}</span>
          <span style="font-size:11px;color:var(--text-muted);margin-left:8px;">${formatDate(art.published_at)}</span>
        </div>
        <h3 class="search-result-headline">${highlight(art.title, query)}</h3>
        <p class="search-result-excerpt">${highlight(art.excerpt || '', query)}</p>
        <span style="font-size:12px;font-weight:800;color:var(--brand-red);">पूरी खबर पढ़ें ↗</span>
      </div>
    </div>
  `).join('');
}

// ============================================================================
// 13. AD MANAGEMENT: Managed exclusively in Admin Dashboard (/admin/dashboard.html)
window.openAdManagerForSlot = function() {};

// 14. SIDEBAR CAROUSEL — loaded exclusively from admin advertisements DB
// ============================================================================
function setupCarousel() {
  const prevBtn = document.getElementById('sidebarCarouselPrev');
  const nextBtn = document.getElementById('sidebarCarouselNext');
  const counterEl = document.getElementById('sidebarCarouselCounter');
  const bottomLabel = document.getElementById('sidebarCarouselBottomLabel');
  const bannerLink = document.getElementById('sidebarAdBannerLink');
  const carouselCard = document.getElementById('adSlotSidebarCarousel');

  // Use ads already loaded into appState.sidebarCarouselAds (set in renderAdvertisementsFromData)
  // or filter from activeAds
  let carouselAds = (appState.sidebarCarouselAds || []).length > 0
    ? appState.sidebarCarouselAds
    : (appState.activeAds || []).filter(a => a.placement === 'sidebar_carousel');

  if (carouselAds.length === 0) {
    // No ads configured — hide the sidebar carousel card
    if (carouselCard) carouselCard.style.display = 'none';
    return;
  }

  if (carouselCard) carouselCard.style.display = '';

  function update() {
    const ad = carouselAds[appState.sidebarCarouselIndex - 1];
    if (!ad) return;
    const total = carouselAds.length;
    if (counterEl) counterEl.textContent = `${appState.sidebarCarouselIndex}/${total}`;
    if (bottomLabel) bottomLabel.textContent = `विज्ञापन संख्या ${appState.sidebarCarouselIndex}/${total}`;
    if (bannerLink) {
      bannerLink.href = ad.destination_url || '#';
      if (ad.image_url) {
        bannerLink.innerHTML = `<img src="${ad.image_url}" alt="${ad.name}" style="width:100%;border-radius:8px;object-fit:cover;max-height:160px;">`;
      } else {
        bannerLink.innerHTML = `
          <div style="min-height:140px;padding:18px;background:#f8fafc;border-radius:8px;display:flex;flex-direction:column;justify-content:center;">
            <span style="font-size:10px;text-transform:uppercase;color:#94a3b8;font-weight:700;">LOCAL PARTNER</span>
            <h4 style="font-size:15px;font-weight:800;color:var(--text-dark);margin:6px 0 4px;">${ad.name}</h4>
            <p style="font-size:12px;color:#64748b;">${ad.sponsor_title || ad.sponsor_subtitle || ''}</p>
          </div>`;
      }
    }
  }

  prevBtn?.addEventListener('click', () => {
    appState.sidebarCarouselIndex = appState.sidebarCarouselIndex > 1 ? appState.sidebarCarouselIndex - 1 : carouselAds.length;
    update();
  });
  nextBtn?.addEventListener('click', () => {
    appState.sidebarCarouselIndex = appState.sidebarCarouselIndex < carouselAds.length ? appState.sidebarCarouselIndex + 1 : 1;
    update();
  });

  update();

  // Auto-advance every 5 seconds
  setInterval(() => {
    appState.sidebarCarouselIndex = appState.sidebarCarouselIndex < carouselAds.length ? appState.sidebarCarouselIndex + 1 : 1;
    update();
  }, 5000);
}

// ============================================================================
// 15. FLOATING AD TOOL (Admin only)
// ============================================================================
function setupFloatingAdTool() {
  const btn = document.getElementById('floatingAdToolBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    appState.highlightAds = !appState.highlightAds;
    document.body.classList.toggle('highlight-ads-active', appState.highlightAds);
    showNotification(appState.highlightAds ? '🎯 सभी विज्ञापन स्लॉट्स हाइलाइट किए गए' : 'सामान्य व्यू बहाल');
  });
}

// ============================================================================
// 16. UTILITY — date/time formatters & toast notification
// ============================================================================
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('hi-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) { return ''; }
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return 'अभी';
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'अभी';
    if (mins < 60) return `${mins} मिनट पहले`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} घंटे पहले`;
    const days = Math.floor(hours / 24);
    return `${days} दिन पहले`;
  } catch (_) { return 'अभी'; }
}

function showNotification(msg) {
  let toast = document.getElementById('toastNotice');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastNotice';
    toast.style.cssText = `
      position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
      background:#0f141c; color:#fff; padding:10px 22px;
      border-radius:9999px; font-size:13px; font-weight:700;
      box-shadow:0 10px 25px rgba(0,0,0,.3); z-index:9999;
      transition:all .3s; border:1px solid rgba(255,255,255,.15);
      pointer-events:none; opacity:0; white-space:nowrap; max-width:90vw;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  toast.style.transform = 'translate(-50%,-10px)';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%,0)';
  }, 2800);
}

// Expose showNotification globally for inline onclick usage
window.showNotification = showNotification;
window.openAdManagerForSlot = window.openAdManagerForSlot || function(){};
