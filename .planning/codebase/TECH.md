# Codebase Tech Stack & Environment: HisarKiAawaj

## 1. Runtime & Platform
* **Frontend Runtime**: Native browser JavaScript (ES6+), HTML5, CSS3.
* **External Client Libraries**:
  * Supabase JavaScript SDK v2 (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`)
  * Google Fonts (`Playfair Display`, `DM Sans`)
* **Local Backend Environment**: Node.js v26.13.0 on Windows.
* **Database / Backend Target**:
  * **Option 1**: Supabase (Hosted PostgreSQL with built-in Auth, Storage, and Row Level Security).
  * **Option 2**: Node.js + Native `node:sqlite` REST backend.

## 2. Directory Layout
```
adiminDrive/
├── index.html                   # Public news portal homepage
├── article.html                 # Dedicated individual article reader
├── category.html                # Category-filtered news archive
├── search.html                  # Search results page
├── styles.css                   # Main responsive stylesheet
├── app.js                       # Public frontend controller & UI interactions
├── supabase-config.js           # Client credentials & local storage overrides
├── supabase-client.js           # Centralized data access, auth, & storage abstraction
├── schema.sql                   # Complete PostgreSQL DDL, RLS, indexes, & seed data
├── README-SUPABASE-ADMIN.md     # Production deployment and configuration guide
├── .env.example                 # Environment variables specification
└── admin/                       # Dedicated Admin CMS
    ├── index.html               # Redirect to login or dashboard
    ├── login.html               # Admin authentication screen
    ├── dashboard.html           # Full CMS dashboard & editor
    ├── admin.css                # Admin UI styling
    └── admin.js                 # Admin CMS controller & data handlers
```

## 3. Configuration & Secrets
* `supabase-config.js` looks up credentials in `localStorage` (`hisarkiaawaj_supabase_url`, `hisarkiaawaj_supabase_anon_key`) with fallback to script variables.
* No build tools required; runs directly in modern browsers via any static server or Node.js server.

