# Codebase Quality & Standards: HisarKiAawaj

## 1. Code Style & Architecture Quality
* **JavaScript**: Modern ES6+ JavaScript using `async/await`, structured into single-responsibility functions.
* **Separation of Concerns**:
  * Presentation: Clean semantic HTML5 and vanilla CSS with modular design tokens (`:root` variables).
  * Data Access: Centralized in `supabase-client.js`. Neither `app.js` nor `admin.js` write raw network payloads directly; they consume helper methods (`fetchArticles()`, `createArticle()`, `signInAdmin()`).
  * Fallbacks: Both public and admin views handle offline/unconfigured state gracefully (demo banners, setup pills, fallback articles).

## 2. Security Patterns
* **Role-Based Access Control**:
  * Admin authorization does not rely solely on user authentication: it explicitly verifies that `profiles.role === 'admin'`.
  * In `schema.sql`, PostgreSQL Row Level Security (RLS) is defined for every table to enforce server-side security even if client logic is bypassed.
* **Draft Isolation**:
  * RLS policies strictly filter:
    `WHERE status = 'published' AND published_at <= timezone('utc'::text, now())`

## 3. Testing & Verification Gaps
* Currently, no automated unit or integration tests exist in the frontend repository.
* Testing is currently manual (browser verification).

