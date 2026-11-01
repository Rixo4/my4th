# Project: News Website Admin & Publishing Backend

## 1. Vision & Overview
A lightweight, secure news publishing backend and admin management dashboard for a single site owner. It connects to an existing public news frontend, allowing the owner to manage articles (draft, preview, publish, unpublish, edit, delete) while guaranteeing that drafts remain strictly private and only published stories appear on the public site.

## 2. Target User & Core Problem
- **Target User**: Single site owner / publisher responsible for content creation and maintenance.
- **Problem**: The site owner currently lacks a reliable, centralized mechanism to manage and publish news articles without directly editing code or frontend files.

## 3. System Architecture
```
+-----------------------------------------------------------+
|                        Site Owner                         |
+-----------------------------+-----------------------------+
                              |
                     [Browser / Admin UI]
                              |
                    (Cookie-based Session)
                              v
+-----------------------------------------------------------+
|                   Backend Service (Node.js)               |
|                                                           |
|  +--------------------+         +-----------------------+ |
|  | /api/admin/*       |         | /api/public/*         | |
|  | (Protected CRUD,   |         | (Read-only, published | |
|  |  Preview, Auth)    |         |  articles only)       | |
|  +---------+----------+         +-----------+-----------+ |
+------------|--------------------------------|-------------+
             |                                |
             v                                v
+-----------------------+         +-------------------------+
| SQLite Database       |         | Existing Public Frontend|
| (Articles, Sessions,  |         | (Fetches & renders      |
|  Admin Credentials)   |         |  published news feed)   |
+-----------------------+         +-------------------------+
```

### Key Architectural Decisions:
- **Backend**: Node.js with Express or Fastify.
- **Database**: SQLite (via Drizzle ORM or `better-sqlite3`) — zero external database daemon required, file-based, fast, ACID-compliant, easy to backup.
- **Authentication**: Single-user authentication via hashed password (`bcrypt` / `argon2`) with secure, HTTP-only session cookies.
- **Admin UI**: Dedicated, responsive dashboard for managing articles, editing content (rich text/markdown), managing metadata, and live previewing.
- **Public Integration**: Clean REST API (`GET /api/articles`, `GET /api/articles/:slug`) returning only articles where `status = 'published'` and `published_at <= current_timestamp`.

## 4. Key Security & Privacy Guarantees
1. **Draft Privacy**: Drafts and unpublished articles must never be exposed through public endpoints under any circumstances.
2. **Access Control**: All `/api/admin/*` routes reject any request without a valid authenticated session.
3. **Session Hardening**: HTTP-only cookies with `SameSite=Lax` (or `Strict`), protecting against XSS session theft and CSRF.

## 5. Scope Fences (Version 1 vs Future)
- **Included in v1**:
  - Single-user login and session persistence.
  - Full article CRUD (Title, slug, summary, body, image URL/upload, date, category/tags).
  - Draft, preview, publish, and unpublish workflows.
  - Filterable admin article list.
  - Public REST API integration contract for the existing frontend.
- **Deferred to Future Versions**:
  - Multi-user roles and permissions.
  - Scheduled automated publishing.
  - Analytics and view metrics.
  - User comments, newsletters, social sharing.
  - Revision history and version diffing.

