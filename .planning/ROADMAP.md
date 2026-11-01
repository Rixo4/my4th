# Roadmap: HisarKiAawaj News Publishing Platform & Editorial CMS

## Milestones & Phased Execution

```
[Phase 0: Environment & Repository Baseline Verification]  ✅ COMPLETE
                         |
                         v
[Phase 1: Public Frontend Sanitization & Admin Concealment]  ✅ COMPLETE
                         |
                         v
[Phase 2: Owner Provisioning, Hardened Authentication & API Authorization]  ✅ COMPLETE
                         |
                         v
[Phase 3: Article Editorial Lifecycle — Soft-Delete, Expiry, Bilingual Storage & Content Security]  ✅ COMPLETE
                         |
                         v
[Phase 4: Public Feeds, Cache Freshness & Bilingual Reader Layout]  ✅ COMPLETE
                         |
                         v
[Phase 5: Production Hardening, Consistent Backups & End-to-End Verification]  ✅ COMPLETE
```

---

## Detailed Phase Specifications

### Phase 0: Environment & Repository Baseline Verification ✅ COMPLETE
**Goal**: Verify actual workspace contents, Node runtime environment, and hosting constraints.
- **Status**: Committed. Git initialized, Node v26.13.0 verified, SQLite WAL confirmed, `HOSTING.md` constraints documented.
- **Test**: `npm run test:baseline` → 100% PASS.

---

### Phase 1: Public Frontend Sanitization & Admin Concealment ✅ COMPLETE
**Goal**: Completely remove all public-facing admin entrance points from all public templates.
- **Status**: Committed. All admin buttons, mobile drawer links, floating inspector pill, and ad manager modal removed from `index.html`, `article.html`, `category.html`, `search.html`. Admin URLs remain directly accessible.
- **Test**: `npm run test:phase1` → 100% PASS.

---

### Phase 2: Owner Provisioning, Hardened Authentication & API Authorization ✅ COMPLETE
**Goal**: Implement single-owner provisioning, hardened cookie session management, asynchronous scrypt hashing, brute-force throttling, CSRF protection, and server-side authorization on all admin routes.
- **Status**: Complete. CLI provisioning tool, async scrypt, session rotation, 30m idle/24h absolute SQLite session persistence, 5-attempt/15m brute force protection, CSRF `X-Requested-With` header requirement on mutating routes, and server-side authorization verification.
- **Test**: `npm run test:phase2` → 100% PASS (8/8).

---

### Phase 3: Article Editorial Lifecycle — Soft-Delete, Expiry, Bilingual Storage & Content Security ✅ COMPLETE
**Goal**: Give the owner full editorial control with proper trash/restore, optional article expiry, bilingual tagging, server-side HTML sanitization, and secure image uploads. All lifecycle state changes are reflected on public feeds within the defined freshness window.
- **Status**: Complete. Schema migrated with `language`, `translation_of_id`, `deleted_at`, `expires_at`. Public endpoints query with `PUBLIC_WHERE` visibility filter. Soft-delete, restore, permanent purge implemented. Admin UI updated with Trash Bin, Expiry date/time with IST handling, language selector, and status badges. Server-side HTML sanitization and upload magic byte validation active.
- **Test**: `npm run test:phase3` → 100% PASS (30/30).
  1. **Owner Account Provisioning**: CLI tool (`npm run admin:provision`) to set the initial owner credentials. No public registration route. Zero default hardcoded passwords in production.
  2. **Asynchronous Password Hashing**: Add async `verifyPasswordAsync` using `crypto.scrypt` callback form. Login route awaits it. `hashPassword` (used only once at provisioning) may remain synchronous.
  3. **Session Cookie Hardening**: `HttpOnly`, `SameSite=Lax`, and conditional `Secure` flag (`NODE_ENV === 'production'`).
  4. **Session Lifecycle & Rotation**:
     - Rotate session ID upon login (invalidate any existing session for that token).
     - Server-side idle timeout: 30 minutes (refreshed on each authenticated request).
     - Absolute session lifetime: 24 hours.
     - Persist active sessions in SQLite `sessions` table so server restarts do not force unexpected logouts.
     - Explicit revocation on logout: remove session from both Map and SQLite.
  5. **Brute-Force Rate Limiting**: Maximum 5 failed login attempts per IP per 15-minute window. 6th attempt returns `429 Too Many Requests` for the remainder of the window.
  6. **CSRF Protection**: All state-changing endpoints under `/api/admin/` require `X-Requested-With: XMLHttpRequest` header. Missing header returns `403 Forbidden`. Auth routes (`/api/auth/login`, `/api/auth/logout`, `/api/auth/me`) are exempt.
  7. **Independent Server Authorization**: Every `/api/admin/*` endpoint independently verifies session. Frontend redirect on `dashboard.html` is UX only.
  8. **Client-Side CSRF Header**: Add `X-Requested-With: XMLHttpRequest` to all mutating fetch calls in `admin/admin.js` and `supabase-client.js`.
- **Exit Verification** (`npm run test:phase2`):
  - [ ] Correct credentials → 200 with session cookie set.
  - [ ] 5 consecutive bad attempts from same IP → 6th returns 429.
  - [ ] Session ID rotates upon login.
  - [ ] All `/api/admin/*` routes return 401 with no session.
  - [ ] State-changing admin routes return 403 without `X-Requested-With` header.
  - [ ] Logout invalidates session server-side (subsequent `/api/auth/me` returns 401).

---

### Phase 3: Article Editorial Lifecycle — Soft-Delete, Expiry, Bilingual Storage & Content Security
**Goal**: Give the owner full editorial control with proper trash/restore, optional article expiry, bilingual tagging, server-side HTML sanitization, and secure image uploads. All lifecycle state changes are reflected on public feeds within the defined freshness window.

#### 3.1 Schema Changes (additive migrations on live DB + updated `schema.sql`)
New columns on the `articles` table:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `language` | `TEXT NOT NULL DEFAULT 'hi'` | `'hi'` | Explicit bilingual tag: `'hi'` or `'en'` |
| `translation_of_id` | `INTEGER REFERENCES articles(id) ON DELETE SET NULL` | `NULL` | Links a translation to its source article |
| `deleted_at` | `DATETIME DEFAULT NULL` | `NULL` | Soft-delete timestamp; NULL = active |
| `expires_at` | `DATETIME DEFAULT NULL` | `NULL` | Optional expiry; NULL = never expires. Stored as UTC ISO 8601 |

Migration is applied via `npm run migrate` (`scripts/migrate-phase3.js`), which checks `PRAGMA table_info(articles)` before each `ALTER TABLE` to be idempotent.

#### 3.2 Article Visibility Rules (server-enforced, not client-enforced)

All public endpoints (`GET /api/articles`, `GET /api/articles/:slug`) apply this combined WHERE clause:

```sql
WHERE a.status = 'published'
  AND a.published_at <= datetime('now')
  AND (a.deleted_at IS NULL)
  AND (a.expires_at IS NULL OR a.expires_at > datetime('now'))
```

- `deleted_at IS NOT NULL` → article is in Trash → excluded from all public feeds and direct article URL (returns `404 Not Found`).
- `expires_at <= datetime('now')` → article is expired → excluded from all public feeds and direct article URL (returns `404 Not Found`, not `410 Gone`, to prevent content scraping confirmation).

Both checks are applied in the **SQLite query layer** (`src/db/articles.js`), not in application code, so they cannot be bypassed.

#### 3.3 Soft-Delete, Restore & Permanent Purge
**Lifecycle**:
```
Active (draft/published) → [Owner: Delete] → Trash (deleted_at set)
Trash → [Owner: Restore] → Active (deleted_at cleared)
Trash → [Owner: Permanently Delete + Confirm] → Purged (row deleted from DB)
```

**API Routes** (all require valid admin session + `X-Requested-With` header):
| Method | Path | Action |
|---|---|---|
| `DELETE /api/admin/articles/:id` | Soft-delete (move to Trash, set `deleted_at`) |
| `GET /api/admin/articles/trash` | List all trashed articles |
| `POST /api/admin/articles/:id/restore` | Restore from Trash (clear `deleted_at`) |
| `DELETE /api/admin/articles/:id/purge` | Permanently delete (destructive, no recovery) |

**Admin UI**:
- "Delete" button on article rows triggers a **two-step confirmation modal**: "Move to Trash?" → confirm → soft-delete.
- Trash view accessible from admin sidebar: lists trashed articles with "Restore" and "Permanently Delete" buttons.
- "Permanently Delete" triggers a **second confirmation modal**: "This cannot be undone. Permanently delete this article?" → confirm → purge.
- Unauthenticated or non-admin requests to delete, restore, or purge routes return `401 Unauthorized`.

#### 3.4 Article Expiry
**Storage**:
- `expires_at` is stored in the database as a UTC ISO 8601 datetime string (e.g., `2026-11-15T18:30:00Z`).
- All comparisons use SQLite's `datetime('now')` which operates in UTC, ensuring timezone-safe evaluation.

**Display**:
- The admin dashboard displays `expires_at` converted to IST (UTC+5:30) in a human-readable format using the browser's `Intl.DateTimeFormat` with `timeZone: 'Asia/Kolkata'`.
- The datetime-local input in the editor must likewise be converted from IST to UTC before saving and from UTC to IST when populating the form.

**Admin UI Controls**:
- "Expiry Date & Time" field in the article editor: an optional `<input type="datetime-local">`.
- Tooltip/label: "Article will automatically hide from public when this time passes (IST). Leave blank for no expiry."
- "Clear Expiry" button sets `expires_at = NULL`.
- Expiry status badge on the article list: `ACTIVE`, `EXPIRES SOON` (within 24 h), `EXPIRED` (past expiry, still in admin).

**Behavior**:
- Expired articles remain fully visible and editable in the admin panel.
- Expired articles' `expires_at` can be extended or cleared to re-publish them without any status change.
- Expired articles are excluded from all public feeds and direct article URLs automatically.

#### 3.5 Cache & Freshness Behavior
- Public API dynamic routes (`/api/articles`, `/api/articles/:slug`) return `Cache-Control: no-cache, no-store, must-revalidate`.
- SQLite evaluates `expires_at > datetime('now')` at query time on every request, so expiry takes effect immediately on the next request after the expiry timestamp passes — **no scheduled job or cache flush needed**.
- **Defined freshness window**: Expiry or deletion takes effect within **one HTTP request latency** of the expiry or deletion event (i.e., the very next fetch from a browser). There is no background polling or server-push mechanism in v1.

#### 3.6 Content Security
**HTML Sanitization** (server-side, before storage):
- Strip `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<style>` tags and their contents.
- Strip all `on*` event handler attributes (`onclick`, `onerror`, `onload`, etc.).
- Strip `href="javascript:..."` and `src="javascript:..."` values.
- Applied to `content` field on both POST (create) and PUT (update) routes before writing to DB.

**Media Upload Hardening**:
- Maximum 5 MB per upload (reject with `413 Payload Too Large`).
- Validate image magic bytes after base64 decode: JPEG (`FF D8 FF`), PNG (`89 50 4E 47`), WebP (`52 49 46 46 ... 57 45 42 50`).
- Accept only extensions: `.jpg`, `.jpeg`, `.png`, `.webp`.
- Generate randomized safe filenames (`img_<timestamp>_<random_hex>.<ext>`).
- Serve with `X-Content-Type-Options: nosniff`.

#### 3.7 Authorization Checks (Exhaustive)
Every admin action verifies session independently on the server:

| Operation | Route | Auth Required | CSRF Header Required |
|---|---|---|---|
| List all articles (incl. drafts) | `GET /api/admin/articles` | ✅ | — |
| Get single article for edit | `GET /api/admin/articles/:id` | ✅ | — |
| Create article | `POST /api/admin/articles` | ✅ | ✅ |
| Update article | `PUT /api/admin/articles/:id` | ✅ | ✅ |
| Toggle publish/unpublish | `PATCH /api/admin/articles/:id` | ✅ | ✅ |
| Soft-delete (Trash) | `DELETE /api/admin/articles/:id` | ✅ | ✅ |
| List trash | `GET /api/admin/articles/trash` | ✅ | — |
| Restore from Trash | `POST /api/admin/articles/:id/restore` | ✅ | ✅ |
| Permanent purge | `DELETE /api/admin/articles/:id/purge` | ✅ | ✅ |
| Set/clear expiry | `PUT /api/admin/articles/:id` (via `expires_at` field) | ✅ | ✅ |
| Upload media | `POST /api/admin/upload` | ✅ | ✅ |

- **Exit Verification** (`npm run test:phase3`):
  - [ ] Soft-delete removes article from `GET /api/articles` and direct URL returns `404`.
  - [ ] Trashed article appears in `GET /api/admin/articles/trash`.
  - [ ] Restore returns article to active feed.
  - [ ] Permanent purge removes row from DB; subsequent restore attempt returns `404`.
  - [ ] Article with `expires_at` in the past returns `404` on public URL.
  - [ ] Extending/clearing `expires_at` re-enables public access immediately.
  - [ ] HTML sanitization strips `<script>` before storage.
  - [ ] Upload of >5 MB payload returns `413`.
  - [ ] All admin routes return `401` without session, `403` without CSRF header.

#### Required User-Facing Acceptance Criteria
- [ ] The public customer pages contain no deleted or expired articles.
- [ ] An expired article's direct public URL no longer displays its content (returns `404 Not Found`).
- [ ] The article remains visible in admin with its expiry state and can be extended or republished without changing status.
- [ ] An owner can restore an article from trash; permanent deletion requires a second confirmation.
- [ ] Unauthenticated requests cannot delete, restore, preview, publish, or change expiry.
- [ ] Changing expiry or deleting an article is reflected across public feeds and cached pages within one HTTP request (immediate read-after-write from SQLite, no cache layer to flush).

---

### Phase 4: Public Feeds, Cache Freshness & Bilingual Reader Layout ✅ COMPLETE
**Goal**: Connect all public frontend sections to the backend API, strictly enforcing all visibility rules (draft, deleted, expired) with immediate freshness and polished bilingual rendering.
- **Status**: Complete. Universal visibility rules enforced in SQLite query layer (`status='published' AND published_at <= NOW() AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`). HTTP `Cache-Control: no-cache, no-store, must-revalidate` set on feeds. Fallback bypass fixed in `article.html`.
- **Test**: `npm run test:phase4` → 100% PASS (25/25).

---

### Phase 5: Production Hardening, Consistent Backups & End-to-End Verification ✅ COMPLETE
**Goal**: Package deployment, implement WAL-safe backups, and run full regression across all six phases.
- **Status**: Complete. Online `VACUUM INTO` backup script (`npm run backup`) and restore script (`npm run restore`) created and verified with `PRAGMA integrity_check`. Full regression suite created and passing.
- **Test**: `npm run test:phase5` → 100% PASS (8/8).
  1. **Universal Feed Integration** — All public views apply the full visibility WHERE clause:
     ```
     status = 'published' AND published_at <= NOW()
     AND deleted_at IS NULL
     AND (expires_at IS NULL OR expires_at > NOW())
     ```
     Applied to: homepage featured banner, breaking ticker, latest news, category cards, trending grids, category pages, single article page, search page.
  2. **Cache Freshness**: Dynamic API routes return `Cache-Control: no-cache, no-store, must-revalidate`.
  3. **Bilingual Reader Polish**: Verify Devanagari Hindi and English typography across desktop, tablet, mobile. Graceful image fallback placeholders.
- **Exit Verification** (`npm run test:phase4`):
  - [ ] Published article visible on homepage after next request.
  - [ ] Trashed or expired article absent from all public sections immediately.
  - [ ] Direct expired-article URL returns `404`.
  - [ ] All public views (homepage, category, article, search, ticker) load only qualifying published content.

---

### Phase 5: Production Hardening, Consistent Backups & End-to-End Verification
**Goal**: Package deployment, implement WAL-safe backups, and run full regression across all six phases.
- **Scope & Tasks**:
  1. **Consistent Backup** (`npm run backup`): `VACUUM INTO 'data/backup_<timestamp>.db'` + `uploads/` archive. Document and test restore procedure (`npm run restore`).
  2. **Production Config**: `NODE_ENV=production` cookie `Secure` flag, environment variables, PM2/systemd runbook.
  3. **Full Regression Test Suite**:
     - Public sanitization (zero admin links on public pages).
     - Auth: brute-force lockout, session rotation, CSRF enforcement, 401/403 guards.
     - Article lifecycle: Draft → Publish → Unpublish → Trash → Restore → Expiry → Extend.
     - All six user-facing acceptance criteria verified end-to-end.
- **Exit Verification**:
  - [ ] `npm run backup` produces a verified, non-corrupt SQLite snapshot.
  - [ ] `npm run restore` restores DB integrity verified by test-db script.
  - [ ] All acceptance criteria from all phases pass.
