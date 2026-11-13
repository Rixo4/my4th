/**
 * HisarKiAawaj — Supabase Client Configuration
 */

(function() {
  const DEFAULT_URL = 'https://dbmzgbdmvobipeobtgxb.supabase.co';
  const DEFAULT_ANON_KEY = 'sb_publishable_kjG3pcRmb3NbxV3YfhuW3w_gXP4l2gL';

  function sanitize(val, fallback) {
    if (!val || typeof val !== 'string') return fallback;
    const clean = val.trim();
    if (!clean || clean.includes('your-project-id') || clean.includes('your-supabase-anon-key')) {
      return fallback;
    }
    return clean;
  }

  let storedUrl = null;
  let storedKey = null;

  try {
    storedUrl = localStorage.getItem('hisarkiaawaj_supabase_url');
    storedKey = localStorage.getItem('hisarkiaawaj_supabase_anon_key');

    // Clean out legacy placeholder keys from localStorage if present
    if (storedUrl && (storedUrl.includes('your-project-id') || storedUrl.trim() === '')) {
      localStorage.removeItem('hisarkiaawaj_supabase_url');
      storedUrl = null;
    }
    if (storedKey && (storedKey.includes('your-supabase-anon-key') || storedKey.trim() === '')) {
      localStorage.removeItem('hisarkiaawaj_supabase_anon_key');
      storedKey = null;
    }
  } catch (e) {}

  window.SUPABASE_CONFIG = {
    url: sanitize(storedUrl, DEFAULT_URL),
    anonKey: sanitize(storedKey, DEFAULT_ANON_KEY)
  };
})();
