/**
 * HisarKiAawaj — Supabase Client Configuration
 */

window.SUPABASE_CONFIG = {
  // Supabase Project URL:
  url: localStorage.getItem('hisarkiaawaj_supabase_url') || 'https://bccftedwljqihfbrcijw.supabase.co',
  
  // Supabase Publishable / Anon Key:
  anonKey: localStorage.getItem('hisarkiaawaj_supabase_anon_key') || 'sb_publishable_q00sDcQicqHWX0B9ytBH6w_AXQ80_S4'
};
