# Codebase Concerns & Technical Debt: HisarKiAawaj

## 1. Backend Connectivity State
* **Current Status**: The frontend and admin dashboard are currently in **"Setup / Fallback Mode"**.
* **Reason**: `supabase-config.js` has placeholder credentials. A live database instance has not yet been connected to execute `schema.sql`.

## 2. Architectural Choices for Backend Execution
* **Path 1 (Cloud Supabase)**:
  * Fast and zero backend code needed.
  * Requires creating a project on Supabase and running `schema.sql`.
* **Path 2 (Self-Hosted Node.js Server)**:
  * Replaces Supabase with a lightweight Node.js + SQLite server (`src/server.js`).
  * Requires serving the static frontend files and emulating the data layer so `supabase-client.js` talks to local REST endpoints.

## 3. Image Storage
* Currently, `admin.js` supports uploading images to Supabase Storage bucket `news-media`.
* If running completely offline/local (Option 2), a local `/uploads` route with `multipart/form-data` handling is required.

