# Requirements: News Website Admin & Publishing Backend (v1)

## Requirement Matrix

### 1. Authentication & Security (AUTH)
- [ ] **AUTH-01 (Single-User Login)**: The system must provide a login interface that authenticates the single site owner via a secure password.
- [ ] **AUTH-02 (Session Management)**: Authenticated sessions must be stored securely using HTTP-only, SameSite cookies.
- [ ] **AUTH-03 (Route Protection)**: Any attempt to access `/api/admin/*` or the admin UI without a valid session must redirect to the login page or return `401 Unauthorized`.
- [ ] **AUTH-04 (Logout)**: The site owner can log out, which invalidates the session cookie immediately.

### 2. Article & Content Management (ART)
- [ ] **ART-01 (Article Schema)**: Each article must support:
  - `title` (string, required)
  - `slug` (unique URL-friendly string, required)
  - `summary` / excerpt (string, required)
  - `body` (rich text / markdown, required)
  - `image_url` (featured image, optional)
  - `category` / `tags` (string or array, optional)
  - `status` (`draft` | `published`)
  - `published_at` (datetime, nullable)
  - `created_at` / `updated_at` (datetime)
- [ ] **ART-02 (Create Article)**: Admin can create a new article as either a draft or published immediately.
- [ ] **ART-03 (Edit Article)**: Admin can update any field of an existing article.
- [ ] **ART-04 (Delete Article)**: Admin can permanently delete an article with confirmation.
- [ ] **ART-05 (Automatic Slug Generation)**: Slug is generated automatically from the title with fallback collision handling.

### 3. Publishing Workflow (PUB)
- [ ] **PUB-01 (Draft Saving)**: Site owner can save changes as a draft without making them visible on the public website.
- [ ] **PUB-02 (Article Preview)**: Site owner can preview an unpublished draft in the exact visual format as the public site before publishing.
- [ ] **PUB-03 (Publish Action)**: Site owner can publish a draft with one click, timestamping `published_at` and setting status to `published`.
- [ ] **PUB-04 (Unpublish Action)**: Site owner can unpublish a currently published article, returning it to `draft` status and immediately removing it from the public feed.

### 4. Admin Management Dashboard (ADM)
- [ ] **ADM-01 (Article Table)**: Clean list view displaying all articles with title, category, status (Draft/Published badge), and last updated date.
- [ ] **ADM-02 (Search & Filtering)**: Ability to filter articles by status (`All`, `Published`, `Drafts`) and search by title.
- [ ] **ADM-03 (Quick Actions)**: Direct row-level action triggers to Edit, Preview, Toggle Publish/Unpublish, and Delete.

### 5. Public API & Frontend Integration (API)
- [ ] **API-01 (Public Article Feed)**: `GET /api/articles` returns paginated list of published articles only, ordered by `published_at` descending.
- [ ] **API-02 (Public Article Detail)**: `GET /api/articles/:slug` returns full article details if published; returns `404 Not Found` if draft or non-existent.
- [ ] **API-03 (Draft Isolation Guarantee)**: Public endpoints must strictly exclude any records where `status != 'published'` under all conditions.
- [ ] **API-04 (CORS / Static Integration)**: API supports CORS or reverse-proxy serving for seamless connection to the existing public frontend.

---

## Out of Scope for v1
- Multiple users, contributor roles, or approval hierarchies.
- Scheduled publishing (auto-publishing at future date).
- Comment sections, view analytics, newsletter subscriptions.
- Revision history / audit logs.
- Redesigning the existing public frontend.

