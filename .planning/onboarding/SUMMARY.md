# Onboarding Summary: HisarKiAawaj

## Codebase Status
* **Repository**: `terabaapmc/hisarkiawaaj`
* **Type**: Brownfield News Platform (Public Site + Admin CMS)
* **Onboarding Date**: 2026-10-30

## Key Findings
1. **Frontend & Admin UI**:
   * Complete, working customer-facing news portal in the root directory (`index.html`, `article.html`, `category.html`, `search.html`).
   * Complete, working Admin CMS in `admin/` (`admin/dashboard.html`, `admin/login.html`).
2. **Data Layer**:
   * Pre-architected for Supabase in `schema.sql` and `supabase-client.js`.
   * Ready for either:
     - Cloud activation (paste Supabase credentials in `supabase-config.js`), or
     - Self-hosted Node.js + SQLite backend.
3. **Planning Alignment**:
   * Codebase map written to `.planning/codebase/`.
   * Current milestone tracks connecting the working admin and public frontend to a live database and enforcing draft privacy.

## Next Steps
* Run `/gsd-plan-phase 1` or execute backend setup depending on the chosen deployment path.

