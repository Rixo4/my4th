# UAT: Phase 2 — Authentication & Admin Security

## Execution Summary
- **Phase**: 2 — Authentication & Admin Security
- **Goal**: Implement single-user authentication and session protection for all admin surfaces.
- **Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04
- **Status**: In Progress

---

## Test Cases

### 1. Scrypt Password Hashing & Constant-Time Verification
- **Requirement**: AUTH-01
- **Description**: Verify that admin passwords are encrypted using Scrypt with cryptographic salt and constant-time comparison to prevent timing attacks.
- **Command / Action**: Automated verification in `scripts/test-db.js` (Test 2) and `src/db/auth.js`.
- **Expected Outcome**: Matching password passes verification; mismatched password fails; timingSafeEqual is utilized.
- **Result**: [ ] Pending

### 2. Login Endpoint & HTTP-Only Cookie Generation
- **Requirement**: AUTH-01, AUTH-02
- **Description**: Verify that `POST /api/auth/login` accepts valid admin credentials and issues an HTTP-only, SameSite=Lax session cookie (`hisar_session`), while rejecting invalid credentials with 401.
- **Command / Action**: Tested via server auth handler and login endpoint.
- **Expected Outcome**: Valid login returns 200 with session cookie; invalid credentials return 401 Unauthorized.
- **Result**: [ ] Pending

### 3. Route Protection Middleware (Unauthorized 401 Guard)
- **Requirement**: AUTH-03
- **Description**: Verify that unauthenticated requests to `/api/admin/*` are blocked with 401 Unauthorized, while requests with a valid `hisar_session` are authorized.
- **Command / Action**: Request `/api/admin/metrics` with and without session cookie.
- **Expected Outcome**: Without session returns 401; with session returns 200 with dashboard data.
- **Result**: [ ] Pending

### 4. Session Invalidation & Logout
- **Requirement**: AUTH-04
- **Description**: Verify that calling `POST /api/auth/logout` invalidates the server-side session and clears the client cookie (`Max-Age=0`).
- **Command / Action**: Post to `/api/auth/logout` with active cookie, then check `/api/auth/me`.
- **Expected Outcome**: Session is destroyed; subsequent requests to `/api/auth/me` return 401.
- **Result**: [ ] Pending
