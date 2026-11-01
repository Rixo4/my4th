# Roadmap: HisarKiAawaj News Publishing Platform & Editorial CMS

## Milestones & Phased Execution

```
[Phase 0: Environment & Repository Baseline Verification]
                         |
                         v
[Phase 1: Public Frontend Sanitization & Admin Concealment]
                         |
                         v
[Phase 2: Owner Provisioning, Hardened Authentication & API Authorization]
                         |
                         v
[Phase 3: Article Editorial Lifecycle, Bilingual Storage, Media & Soft-Delete]
                         |
                         v
[Phase 4: Public Feeds, Cache Freshness & Bilingual Reader Layout]
                         |
                         v
[Phase 5: Production Hardening, Consistent Backups & End-to-End Verification]
```

---

## Detailed Phase Specifications

### Phase 0: Environment & Repository Baseline Verification
**Goal**: Verify actual workspace contents, Node runtime environment, and hosting constraints before executing any code changes.
- **Scope & Verification Steps**:
  1. Inspect and log actual repository status (initialize `git` repository if uninitialized).
  2. Pin target Node.js runtime (Node 22 LTS or Node 24) and document `node:sqlite` status (experimental in v22, release-candidate in v24). Document fallback to `better-sqlite3` if compilation toolchains are available.
  3. Validate filesystem storage paths (`data/`, `uploads/`, `src/`) and permissions.
  4. Explicitly document SQLite hosting constraints: single application host, single persistent POSIX local disk, no shared network filesystem (NFS/SMB violates WAL shared-memory guarantees), and no horizontally scaled writers.
  5. Audit existing routes and scripts for baseline operability.
- **Success Criteria**:
  - Environment specification document recorded with verified Node version, git status, and storage paths.
  - Baseline check script passes, confirming SQLite file creation and local disk writability.

---

### Phase 1: Public Frontend Sanitization & Admin Concealment
**Goal**: Completely remove all public-facing admin entrance points, buttons, links, modals, and inspection tools from all public templates.
- **Scope & Tasks**:
  1. Remove "Admin Login" buttons (`.btn-signin-pill`) and "Admin CMS" buttons (`.btn-ad-manager-pill`) from `index.html`.
  2. Remove mobile drawer "Admin Login" link from `index.html`.
  3. Remove floating ad inspector pill and ad management modal from `index.html`.
  4. Remove "Admin Login" and "Admin CMS" buttons from `article.html`, `category.html`, and `search.html`.
  5. Clean public header and navigation bar so ordinary visitors see only bilingual date/time, language toggle, and public news navigation.
  6. Ensure direct URL navigation to `/admin/login.html` remains fully accessible to the owner.
- **Success Criteria**:
  - Automated DOM and grep audit of `index.html`, `article.html`, `category.html`, and `search.html` confirms zero occurrences of admin URLs, classes, or triggers.
  - Public pages load and function cleanly without console errors or missing element references.
  - Direct navigation to `/admin/login.html` loads the private login interface.

---

### Phase 2: Owner Provisioning, Hardened Authentication & API Authorization
**Goal**: Implement single-owner provisioning, hardened cookie session management, asynchronous scrypt hashing, brute-force throttling, CSRF protection, and server-side authorization on all admin routes.
- **Scope & Tasks**:
  1. **Owner Account Provisioning**: Provide an out-of-band CLI tool (`npm run admin:provision` / `node scripts/provision-admin.js`) to set the initial owner credentials. No public registration route. Zero default hardcoded passwords in production.
  2. **Asynchronous Password Hashing**: Refactor password hashing and verification to use asynchronous `crypto.scrypt` with `crypto.timingSafeEqual` to prevent blocking the Node event loop.
  3. **Session Cookie Hardening**: Issue session cookies with `HttpOnly`, `SameSite=Lax`, and conditional `Secure` flag (`NODE_ENV === 'production'`).
  4. **Session Lifecycle & Rotation**:
     - Rotate session ID upon login to prevent session fixation.
     - Enforce server-side idle timeout (30 minutes) and absolute lifetime (24 hours).
     - Persist active sessions in SQLite so server restarts do not force unexpected logouts.
     - Explicit session revocation on logout.
  5. **Brute-Force & Rate Limiting**: Throttle failed login attempts (maximum 5 failed attempts per 15-minute window per IP) with exponential backoff.
  6. **CSRF Protection**: Require custom request header (`X-Requested-With` or `X-CSRF-Token`) for all state-changing endpoints (`POST`, `PUT`, `PATCH`, `DELETE`).
  7. **Independent Server Authorization**: Enforce session verification on every `/api/admin/*` endpoint (CRUD, previews, uploads, categories, status changes). Frontend JavaScript redirects on `dashboard.html` are strictly for UX.
- **Success Criteria**:
  - Owner CLI provisioning script sets credentials without public registration exposure.
  - Brute-force test locks out after 5 consecutive failed attempts.
  - Session ID changes upon successful authentication.
  - Every `/api/admin/*` route returns `401 Unauthorized` without a valid, unexpired session cookie.
  - Requests missing the CSRF protection header are rejected with `403 Forbidden`.
  - Logging out immediately invalidates the session server-side.

---

### Phase 3: Article Editorial Lifecycle, Bilingual Storage, Media Security & Recoverable Deletion
**Goal**: Provide a full-featured editorial CMS for the single owner supporting draft, publish, unpublish, preview, soft-delete/recovery, explicit bilingual tagging, safe rich text rendering, and secure image uploads.
- **Scope & Tasks**:
  1. **Bilingual Data Model**: Add explicit `language` field (`'hi'` | `'en'`) with optional `translation_of_id` foreign key. Titles and slugs handle Hindi (Devanagari Unicode or transliterated ASCII) and English unambiguously.
  2. **Article Status & Lifecycle**:
     - Status states: `'draft'`, `'published'`, and `'trash'` (or `deleted_at` timestamp).
     - **Save Draft**: Saves content with `status = 'draft'` and `published_at = NULL`.
     - **Publish**: Sets `status = 'published'` and assigns `published_at = CURRENT_TIMESTAMP`.
     - **Unpublish**: 1-click toggle setting `status = 'draft'`, immediately removing the article from public feeds.
     - **Republishing Options**: Owner chooses between preserving original publication timestamp or updating to current timestamp.
     - **Recoverable Soft-Delete**: Deleting moves article to Trash (`deleted_at` set). Articles can be restored from Trash or permanently purged.
  3. **Secure Draft Preview**:
     - Create dedicated authenticated preview endpoint (`GET /api/admin/articles/:id/preview` or `GET /api/articles/:slug?preview=true` guarded by admin session).
     - Renders draft within the exact public reader layout (`article.html`) for the logged-in owner while returning `404 Not Found` to unauthenticated visitors.
  4. **Content Sanitization**:
     - Sanitize rich-text HTML on the server before storage to prevent XSS (whitelisting safe semantic markup: `p, h2, h3, blockquote, strong, em, ul, ol, li, a[href], img[src|alt]`, stripping scripts and inline event handlers).
  5. **Media Upload Hardening**:
     - Enforce 5 MB maximum file size.
     - Validate image magic bytes and MIME types (`image/jpeg`, `image/png`, `image/webp`).
     - Generate randomized filenames (`img_<timestamp>_<uuid>.<ext>`) to prevent path traversal and script execution.
  6. **Category Management**:
     - Ensure admin dashboard supports category creation, editing, and listing with slug uniqueness checks.
- **Success Criteria**:
  - Owner can create, edit, draft, publish, unpublish, and soft-delete articles via the admin interface.
  - Trashed articles can be restored or purged.
  - XSS injection payloads in article body are stripped by server-side sanitization.
  - Uploading a non-image or file over 5 MB is rejected with a descriptive error.
  - Authenticated draft preview loads full content; unauthenticated request returns `404`.

---

### Phase 4: Public Feeds, Cache Freshness & Bilingual Reader Layout
**Goal**: Connect all public frontend sections to the backend API, strictly enforcing draft isolation with sub-second data freshness and polished bilingual rendering.
- **Scope & Tasks**:
  1. **Universal Feed Integration**:
     - Homepage featured banner, latest stories, category blocks, trending grids, and breaking news ticker read exclusively from `/api/articles` where `status = 'published' AND published_at <= CURRENT_TIMESTAMP AND deleted_at IS NULL`.
     - Category pages (`category.html`) filter by category slug and published status.
     - Single article page (`article.html`) reads published article by slug.
     - Search page (`search.html`) queries published articles only.
  2. **Cache Freshness & Invalidation**:
     - Public API endpoints set `Cache-Control: no-cache, no-store, must-revalidate` ensuring direct read-after-write consistency from SQLite.
     - Browser receives fresh data on subsequent page loads or explicit navigation without needing WebSocket overhead for v1.
  3. **Bilingual Reader Polish**:
     - Verify typography and line-height for Hindi Devanagari text and English text across desktop, tablet, and mobile.
     - Ensure fallback thumbnails display cleanly when an article has no uploaded image.
- **Success Criteria**:
  - Published articles appear on public homepage within next page load / fetch.
  - Unpublished or soft-deleted articles disappear from all public feeds immediately.
  - All public views (homepage, category, article, search, ticker) load solely published content.
  - Direct URL access to a draft slug by an unauthenticated user returns `404 Not Found`.

---

### Phase 5: Production Hardening, Consistent Backups & End-to-End Verification
**Goal**: Package deployment configuration, implement transactionally consistent SQLite WAL backups, and run automated end-to-end verification.
- **Scope & Tasks**:
  1. **Consistent SQLite Backup Script**:
     - Implement database backup using SQLite's native `VACUUM INTO` command or `.backup` API (avoiding corrupt partial file copies during active WAL mode).
     - Bundle `data/backup_*.db` and `uploads/` into an automated backup archive script (`npm run backup`).
     - Document restore procedure and verify database restores cleanly from backup.
  2. **Environment & Process Management**:
     - Configure production environment variables (`PORT`, `NODE_ENV=production`, `DB_PATH`, `SESSION_SECRET`).
     - Document deployment runbook (systemd service or PM2 process manager with Caddy/Nginx reverse proxy for automated HTTPS).
  3. **End-to-End Test Suite**:
     - Execute verified test suite testing:
       * Public route sanitization (zero admin links).
       * Auth brute-force throttling and session rotation.
       * Admin API authentication guards (401 on missing session, 403 on missing CSRF header).
       * Full article lifecycle: Draft -> Preview -> Publish -> Unpublish -> Soft-delete -> Restore.
       * Public draft shielding (confirmed 404 for drafts on public endpoints).
- **Success Criteria**:
  - `npm run backup` creates a verified, non-corrupted SQLite database snapshot and media archive.
  - Documented restore procedure tested: restores database and verifies article integrity.
  - All test suite assertions pass cleanly.
