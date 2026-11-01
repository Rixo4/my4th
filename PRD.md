# Product Requirements Document (PRD)
## HisarKiAawaj — News Portal & Editorial Admin CMS

### 1. Vision
HisarKiAawaj (हिसार की आवाज़) is a modern news publishing platform providing real-time local news, category feeds (City, Crime, Politics, Mandi Rates, Lifestyle, Sports), and a secure editorial content management dashboard for the site owner.

### 2. Architecture: Option A (Self-Hosted Node.js + SQLite)
- **Runtime**: Node.js ES Modules.
- **Database**: SQLite (`data/news.db`) via native `node:sqlite` (`DatabaseSync`).
- **Server**: Clean REST API (`src/server.js`) serving public feeds, admin CRUD, authentication, and static assets.
- **Draft Isolation Guarantee**: Public endpoints (`/api/articles`) enforce `status = 'published'` and `published_at <= CURRENT_TIMESTAMP`. Drafts are physically excluded from public queries.
- **Admin Security**: Single-user password authentication via `scrypt` hashing with secure HTTP-only cookies.

### 3. Core Features
- [x] **Public News Feed**: Homepage, single article reader, category archive, search.
- [x] **Live Clock & Breaking News**: Live IST clock and dynamic ticker.
- [x] **Admin Authentication**: Login screen with session persistence (`/admin/login.html`).
- [x] **Editorial CMS**: Add/edit articles with rich text editor, draft/published toggles, and live previews.
- [x] **Category Management**: Create, edit, and organize news sections.
- [x] **Advertisement Management**: 6 ad slots matching the frontend layout.
- [x] **Local Image Uploads**: Uploading featured images directly into `/uploads` with instant preview.

# News site: article drafts

## Task 1: Add draft status
Add a draft/published status to articles using the project's existing data model.
Keep the existing public pages working.
Do not expose drafts on public pages.