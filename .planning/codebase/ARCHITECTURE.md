# Codebase Architecture: HisarKiAawaj

## 1. System Overview
HisarKiAawaj (हिसार की आवाज़) is an independent local news publishing platform composed of:
1. **Public News Website**: Read-only interface for general readers (Homepage, Article Detail, Category Feeds, Search).
2. **Editorial Admin CMS**: Secure control panel for the site owner to draft, edit, preview, schedule, publish, and delete articles, as well as manage categories and advertisement placements.
3. **Data & Storage Layer**: Relational database with strict Row Level Security (RLS) guaranteeing that drafts and scheduled articles remain inaccessible to public visitors.

## 2. Component Architecture

```
[Public Visitors]                      [Site Owner / Admin]
       │                                        │
  (Read-Only)                              (Full CRUD)
       │                                        │
       ▼                                        ▼
[index.html / article.html]             [admin/dashboard.html]
       │                                        │
    [app.js]                              [admin/admin.js]
       │                                        │
       └──────────────┬─────────────────────────┘
                      ▼
            [supabase-client.js]
                      │
                      ▼
         [PostgreSQL / Supabase or REST API]
         ├── profiles (Role enforcement: admin)
         ├── categories (City, Crime, Politics, etc.)
         ├── articles (Draft, Published, Scheduled)
         └── advertisements (6 in-page placement zones)
```

## 3. Data Flow & Security Boundary
* **Public Fetch**:
  * In `app.js`, queries target `articles` where `status = 'published'` and `published_at <= NOW()`.
  * If the database is disconnected, `app.js` renders local fallback demonstration stories.
* **Admin Fetch & Mutations**:
  * In `admin/admin.js`, all actions are gated by `initAdminSession()` which requires `profiles.role === 'admin'`.
  * Admin can create drafts, toggle publication state, upload featured images to media storage, and delete records.

