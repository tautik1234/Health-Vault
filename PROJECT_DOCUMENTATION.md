# HealthVault Project Comprehensive Documentation

## 1. Introduction
HealthVault is a prototype Personal Health Record and Appointment system consisting of:
- A Node.js/Express backend with optional MongoDB persistence and automatic mock-data fallback.
- Static HTML/Bootstrap frontend pages for authentication (login/register) and a dashboard.
- Field-level encryption for sensitive medical data (diagnosis, notes, vitals, appointment notes).

The system is designed for rapid iteration: if the database is unreachable or the environment forces mock mode, all endpoints transparently respond with mock data while preserving the same response contract (including a `source` field identifying `mock` or `database`).

---
## 2. Repository Structure
```
app.js
HealthVault.html
page.html
package.json
controllers/
  appointmentController.js
  healthRecordController.js
  userController.js
lib/
  crypto.js
models/
  Appointment.js
  Counter.js
  HealthRecord.js
  User.js
PROJECT_DOCUMENTATION.md  (this file)
```

---
## 3. Environment Variables
| Variable | Purpose | Required | Default / Behavior |
|----------|---------|----------|---------------------|
| `MONGO_URI` | MongoDB connection string | Optional | If unset or connect fails → mock mode |
| `FIELD_ENC_KEY` | 32-byte key (hex) for AES-256-GCM field encryption | Recommended | If absent/invalid: ephemeral or zeroed key fallback (unsafe for prod) |
| `BCRYPT_SALT_ROUNDS` | Cost factor for bcrypt hashing | Optional | `12` |
| `FORCE_MOCK` | Force mock mode irrespective of DB | Optional | `'false'` |
| `MOCK_TOKEN` | Static token allowed in mock mode | Optional | `mockToken` |
| `API_TOKEN` | Static token accepted in DB mode (placeholder) | Optional | Falls back to `mockToken` |
| `PORT` | HTTP server port | Optional | `5000` |

---
## 4. Dependencies (package.json)
| Library | Purpose | Notes |
|---------|--------|-------|
| `express` | HTTP server & routing | Version 5.x (future-proof) |
| `mongoose` | ODM for MongoDB | Provides schemas, hooks, models |
| `bcrypt` | Secure password hashing | Uses configurable cost factor |
| `dotenv` | Loads environment variables from `.env` | Early bootstrap in `app.js` |
| `body-parser` | JSON body parsing | Could be replaced by `express.json()` but retained |
| `jsonwebtoken` | (Planned) JWT handling | Not yet integrated in logic |
| `uuid` | Unique IDs (not actively used in current code) | Potential future use |
| `cors` | Cross-Origin Resource Sharing | Allows frontend static pages to access API |

---
## 5. Backend Overview (`app.js`)
### 5.1 Startup & Connection Logic
- Loads env via `dotenv`.
- Attempts MongoDB connection using `mongoose.connect`.
- Tracks state with `dbReady` and `dbError` flags.
- Listens for `error` and `disconnected` events to revert to mock mode gracefully.

### 5.2 Mock Mode Decision
```js
function useMock() { return !dbReady || process.env.FORCE_MOCK === 'true'; }
```
Rationale: Simplifies conditional handling; a single canonical function used across routes & middleware.

### 5.3 Authentication Middleware: `authenticate`
Behavior:
1. Extracts Bearer token from `Authorization` header.
2. In mock mode: accepts `MOCK_TOKEN` (default `mockToken`).
3. In DB mode: validates against `API_TOKEN` (placeholder; replace with JWT verification in real scenario).
4. Attaches `req.user = { id, role, mock }`.
Errors:
- 401: Header missing
- 403: Invalid token

### 5.4 Authorization Middleware: `authorize(roles)`
Ensures `req.user.role` is inside the permitted list.
- Returns 401 if `req.user` unset (should be intercepted earlier normally).
- Returns 403 if role mismatch.

### 5.5 Response Helper: `respondWith(data, res, meta={})`
Uniform JSON wrapper:
```json
{
  "source": "mock" | "database",
  "...meta": "(optional additional keys)",
  "data": { ... | [ ... ] }
}
```
Helps frontend display provenance and keeps shape consistent across success cases.

### 5.6 Mock Data Collections
- `mockUsers`, `mockHealthRecords`, `mockAppointments` plus auto-increment counters.
- Provide minimal coverage to exercise UI flows without DB.

### 5.7 Routes Summary
| Method | Path | Middleware | Description | Data Source |
|--------|------|------------|-------------|-------------|
| GET | `/health` | None | Status (dbReady, mockMode, dbError) | N/A |
| POST | `/register` | None | Create user (mock or DB) | Mixed |
| POST | `/login` | None | Authenticate; returns token + userId | Mixed |
| GET | `/me` | `authenticate` | Retrieve profile + stats | Mixed |
| POST | `/records` | `authenticate` | Create health record | Mixed |
| GET | `/records/:recordId` | `authenticate` | Fetch a specific record (decrypt for DB) | Mixed |
| DELETE | `/records/:recordId` | `authenticate` | Delete a record | Mixed |
| GET | `/health-records` | `authenticate` | List all health records | Mixed |
| POST | `/appointment` | `authenticate` | Create appointment | Mixed |
| GET | `/appointment/:username` | `authenticate` | List user appointments | Mixed |
| GET | `/appointments` | `authenticate` | List all appointments | Mixed |
| GET | `/users` | `authenticate` + `authorize('admin')` | List users (no passwords) | Mixed |
| GET | `/reminders` | `authenticate` | Mock reminders array | Mock only |
| GET | `/categories` | `authenticate` | Mock dashboard categories | Mock only |
| GET | `/access` | `authenticate` | Mock access control list | Mock only |

### 5.8 Route Handler Details
#### `/register`
- Mock: Checks duplicates (username/email), pushes into array, returns static token.
- DB: Saves a new `User` (with hashed password) including optional `stats` object.
Return shape: `{ message, token, (id in mock) }`.

#### `/login`
- Mock: Simple linear search by email/password (plaintext in mock list).
- DB: Finds by email, then uses `comparePassword` (bcrypt compare).
Return shape: `{ message, userId, token }`.

#### `/me`
- Mock: Returns admin user plus synthetic stats.
- DB: Looks up by `username` query param; returns subset (username, email, stats).

#### `/records` (POST)
- Mock: Assigns incremental `recordId`; pushes into `mockHealthRecords`.
- DB: Saves new `HealthRecord` (triggers encryption hooks & counter).
Returns `{ recordId }` (+ `_id` in DB mode).

#### `/records/:recordId` (GET/DELETE)
- Mock: Array search/splice.
- DB: `findOne` / `findOneAndDelete`; decrypt via `toDecrypted()`.

#### `/health-records`
- Mock: Full array.
- DB: Fetch all, map `toDecrypted()`.

#### `/appointment` & `/appointment/:username` & `/appointments`
- Mirror patterns of records (incremental ID, optional encryption of notes, user filter).

#### `/users`
- Mock: Exposes { id, username, email, role }.
- DB: Selects `username email createdAt` (hides password & stats unless required).

#### `/reminders`, `/categories`, `/access`
- Currently mock-only for UI population. Provided through `respondWith` to confirm uniform response shape.

---
## 6. Models
### 6.1 `models/User.js`
Fields:
- `username` (unique, required)
- `email` (unique, required)
- `password` (hashed before save)
- `stats` object { bpm, bp, bmi, weight }
- `createdAt` timestamp default
Hooks & Methods:
- `pre('save')`: If password modified → bcrypt salt & hash.
- `comparePassword(candidate)` → Promise<Boolean> using `bcrypt.compare`.
Rationale for `stats`: Allow server as canonical store for health metrics displayed on dashboard.

### 6.2 `models/Appointment.js`
Fields:
- `user` (String ref to username; chosen for quick filter in mock + DB consistency)
- `appointmentId` (auto-increment via `Counter`)
- `doctorName`, `datetime`, `notes`, `status` (enum: scheduled/done/cancelled)
Hooks:
- `pre('save')`: Assigns `appointmentId` from `Counter` if missing (atomic upsert + increment).
- `pre('save')`: Encrypts `notes` if modified.
Methods:
- `toDecrypted()` decrypts notes for outbound responses.

### 6.3 `models/HealthRecord.js`
Fields:
- `user` (ObjectId ref to `User`)
- `recordId` (auto-increment)
- `recordDate` (default now)
- `diagnosis`, `notes`, `vitals` (encrypted fields)
Hooks:
- `pre('save')`: Auto-increment logic via `Counter`.
- `pre('save')`: Field-level encryption if modified/non-empty.
Methods:
- `toDecrypted()` decrypts each encrypted field.

### 6.4 `models/Counter.js`
Generic sequence model with `_id` + `seq`. Used by both Appointment and HealthRecord for numeric, monotonic IDs friendly to UI.

---
## 7. Encryption Utility (`lib/crypto.js`)
### Functions
| Name | Purpose | Detailed Behavior |
|------|---------|-------------------|
| `encryptField(plaintext)` | Encrypt string using AES-256-GCM | Returns `iv:tag:cipher` or `plain:<hex>` fallback if encryption fails |
| `decryptField(stored)` | Decrypts stored format | Parses components; falls back to returning original/decoded if format invalid |

### Fallback Logic
- If `FIELD_ENC_KEY` missing: generate ephemeral key (warning logged) — for dev/demo only.
- If invalid length: uses zeroed key (explicit warning). This ensures app does not crash in mock mode when secret misconfigured.

---
## 8. Controllers (Legacy Folder)
`controllers/*.js` contain earlier, more direct CRUD-style logic (register/login/create/list) not currently wired in `app.js` after refactor. They provide:
- `userController.js`: `registerUser`, `loginUser`
- `appointmentController.js`: `createAppointment`, `fetchAppointments`
- `healthRecordController.js`: `createRecord`, `fetchRecord`, `deleteRecord`
These can be re-integrated by mapping routes to controller exports to maintain separation of concerns; presently `app.js` duplicates that logic inline for speed during hackathon development.

---
## 9. Frontend: `page.html`
### Functional Elements
| Feature | Description |
|---------|-------------|
| Tabs (Login/Register) | Bootstrap tabbed forms for auth flows |
| `api()` | Generic fetch wrapper adding auth header conditionally |
| Login handler | Builds email from username if `@` missing; stores token & username/userId |
| Register handler | Sends `{ username, email, password, stats }`; stores token & stats |
| Error handling | `#errorBox` alert for inline error messages + auto-clear |

### Key Decisions
- Use `@example.com` domain synthesis to keep backend simple (email required) while allowing username login UX.
- Persist stats locally for instant dashboard display; canonical refresh occurs later via `/me` call.

---
## 10. Frontend: `HealthVault.html`
### Core Script Responsibilities
| Function / Block | Purpose |
|------------------|---------|
| `getUserData()` | Safely parse stored user object from localStorage |
| `loadUserStats()` | Populate dashboard stat widgets |
| `api()` | Shared authenticated fetch wrapper |
| `hydrateUser()` | Calls `/me` to replace locally cached stats with authoritative data |
| `loadRecords()` | Fetches `/health-records`, shows subset, includes provenance source |
| `loadReminders()` | Fetches `/reminders` (currently mock) |
| `loadCategories()` | Fetches `/categories` (currently mock) |
| `loadAccessControl()` | Fetches `/access` (currently mock) |
| Add Record Handler | Gathers form input, POST `/records` (diagnosis + combined notes) |
| `Logout()` | Clears auth + user data and navigates back to `page.html` |
| Accessibility Toggles | High contrast, large text, large buttons dynamic toggles |

### Data Flow Snapshot
1. Local stats shown immediately.
2. Remote stats override via `/me` (if DB mode or mock mode).
3. Lists populate concurrently (records, reminders, categories, access).

---
## 11. Mock & Fallback Strategy
| Aspect | Behavior | Rationale |
|--------|----------|-----------|
| Connectivity Failure | Switch to mock mode automatically | Developer productivity & demo resiliency |
| Source Annotation | Every list/record includes `source` | Transparency in UI & debugging |
| Token Acceptance | Single static token in mock | Simplify early iteration |
| Encryption Fallback | App never crashes due to missing key | Lower friction during setup |

---
## 12. Error Handling & Status Codes
| Scenario | Code | Notes |
|----------|------|------|
| Missing auth header | 401 | `authenticate` middleware |
| Invalid token | 403 | Mode-dependent rejection |
| Resource not found | 404 | Records / appointments / users |
| Validation / duplicate | 400 | User registration errors |
| DB operational failure | 503 | Suggest fallback or indicates mode |
| Unauthorized role | 403 | `authorize` role mismatch |

---
## 13. Security Considerations
| Category | Current | Improvement Path |
|----------|---------|------------------|
| Auth | Static token | Replace with JWT (exp, iat, roles) |
| Password Hashing | bcrypt w/ configurable cost | Add password strength validation |
| Field Encryption | AES-256-GCM w/ env key | Enforce key presence; rotation strategy |
| CORS | `*` (open) | Restrict to known origins in prod |
| Input Validation | Minimal | Add schema validation (e.g., Zod/Joi) |
| Logging | Console only | Structured logging (pino/winston) |
| Rate Limiting | None | Add `express-rate-limit` |

---
## 14. Comprehensive Function Index
### Backend (app.js)
| Name | Type | Parameters | Returns | Explanation |
|------|------|------------|---------|-------------|
| `useMock` | Function | none | Boolean | True if DB not ready or forced |
| `authenticate` | Middleware | (req,res,next) | n/a | Validates token; sets `req.user` |
| `authorize` | Middleware factory | roles (String/Array) | Middleware | Enforces role membership |
| `respondWith` | Utility | (data, res, meta?) | JSON response | Standardizes outbound payload |
| `app.get('/health')` | Route | - | JSON | Service health & mode |
| `app.post('/register')` | Route | body: { username,email,password, stats? } | JSON | Creates user (mock/DB) + token |
| `app.post('/login')` | Route | body: { email,password } | JSON | Auth + token |
| `app.get('/me')` | Route | query: username | JSON | Profile + stats |
| `app.post('/records')` | Route | body: record payload | JSON | Create record (assigns IDs) |
| `app.get('/records/:recordId')` | Route | path param | JSON | Retrieve one record |
| `app.delete('/records/:recordId')` | Route | path param | JSON | Delete record |
| `app.get('/health-records')` | Route | none | JSON | List all records |
| `app.post('/appointment')` | Route | body: appointment | JSON | Create appointment |
| `app.get('/appointment/:username')` | Route | path param | JSON | User’s appointments |
| `app.get('/appointments')` | Route | none | JSON | List all appointments |
| `app.get('/users')` | Route | none | JSON | List users (admin only) |
| `app.get('/reminders')` | Route | none | JSON | Mock reminder list |
| `app.get('/categories')` | Route | none | JSON | Mock categories |
| `app.get('/access')` | Route | none | JSON | Mock access list |

### Models
| File | Function / Method | Purpose |
|------|------------------|---------|
| User.js | `pre('save')` | Hash password if modified |
| User.js | `comparePassword` | bcrypt compare |
| Appointment.js | `pre('save')`(counter) | Increment `appointmentId` |
| Appointment.js | `pre('save')`(encryption) | Encrypt `notes` |
| Appointment.js | `toDecrypted` | Decrypt notes |
| HealthRecord.js | `pre('save')`(counter) | Increment `recordId` |
| HealthRecord.js | `pre('save')`(encryption) | Encrypt diagnosis/notes/vitals |
| HealthRecord.js | `toDecrypted` | Decrypt encrypted fields |
| crypto.js | `encryptField` | AES-GCM encryption w/ fallback |
| crypto.js | `decryptField` | AES-GCM decryption w/ fallback |

### Frontend (page.html)
| Symbol | Purpose |
|--------|---------|
| `api` | Generic fetch w/ optional auth header |
| Login submit handler | Build email, call `/login`, persist token + user info |
| Register submit handler | Send stats & auth data, persist token + stats |
| `showError/clearErrorLater` | Inline error UI management |

### Frontend (HealthVault.html)
| Symbol | Purpose |
|--------|---------|
| `getUserData` | Safe localStorage parse |
| `loadUserStats` | Fill metrics widgets |
| `api` | Authenticated fetch |
| `hydrateUser` | Replace local stats using `/me` |
| `loadRecords` | Shows subset of records + provenance |
| `loadReminders` | Populate reminders UI |
| `loadCategories` | Populate category cards |
| `loadAccessControl` | Populate access list |
| Record save handler | Compile form input & POST `/records` |
| `Logout` | Clear storage & redirect |
| Accessibility toggles | Contrast / Text / Buttons adjustments |

---
## 15. Detailed Change Log (Chronological Highlights)
| Area | Change | Reason |
|------|--------|-------|
| app.js | Added mock authentication & authorization middleware | Provide basic access control without full JWT setup |
| app.js | Added `useMock` + `respondWith` | Centralize fallback logic & uniform responses |
| app.js | Added DB connection state tracking | Allow transparent auto-fallback |
| app.js | Added routes: `/health-records`, `/reminders`, `/categories`, `/access`, `/me` | Support frontend integration & profile hydration |
| User model | Added `stats` field | Persist user health metrics |
| crypto.js | Added key fallback & plaintext sentinel handling | Prevent crashes during insecure dev runs |
| Frontend | Replaced placeholder `/api/...` endpoints with actual route paths | Align UI with backend contract |
| Frontend | Added `api()` wrapper & token header injection | DRY fetch logic |
| Frontend | Added errorBox UI instead of alerts | Better UX & accessibility |
| Frontend | Added profile hydration via `/me` | Authoritative stats instead of only localStorage |
| Registration | Now returns token in DB mode too | Immediate logged-in experience |
| Security | Encrypted fields for health data & appointment notes | Protection of sensitive content |
| Responses | Added `source` field in all listing endpoints | UI can display data provenance |
| Appointments | Decrypt notes via `toDecrypted()` | Maintain consistent plaintext return |

---
## 16. API Response Examples
(Representative; mock vs DB differ only in `source` and persistence side-effects.)

### Login (POST /login) Success
```json
{
  "message": "ok",
  "userId": "6640f...", 
  "token": "mockToken"
}
```

### Health Records List (GET /health-records)
```json
{
  "source": "mock",
  "data": [
    { "recordId":1, "diagnosis":"Hypertension", "notes":"Lifestyle changes advised", ... }
  ]
}
```

### Create Record (POST /records)
```json
{ "id":"6650...", "recordId":7 }
```
(or mock: `{ "message":"created (mock)", "recordId": 4 }`)

---
## 17. Future Enhancements (Recommended Roadmap)
1. JWT-based auth with refresh tokens.
2. Replace mock-only endpoints (`/reminders`, `/categories`, `/access`) with persisted models.
3. Add PUT/PATCH for updating user stats and records.
4. Validation layer (Joi/Zod) & centralized error middleware.
5. Pagination & filtering for record/appointment listings.
6. Logging (pino) + correlation IDs.
7. Add unit/integration tests (Jest + Supertest) for critical flows.
8. Dockerfile + docker-compose for reproducible local environment (Mongo instance).
9. CI pipeline (lint/test) & code coverage metrics.
10. RBAC expansion (multiple roles beyond admin/user).

---
## 18. Known Issues / Caveats
| Issue | Impact | Mitigation |
|-------|--------|-----------|
| Process exiting with code 1 in environment | Startup reliability concern | Investigate external supervisor or additional unlogged signals |
| Static token reuse | Security risk | Implement JWT issuance & verification |
| Encryption fallback with ephemeral key | Data confidentiality risk | Enforce mandatory key in non-dev environments |
| Controllers unused after refactor | Potential confusion | Either remove or wire them with routes |

---
## 19. Glossary
| Term | Definition |
|------|------------|
| Mock Mode | Operational mode using in-memory data when DB is unavailable/forced |
| Provenance | Indicator (`source`) showing origin of data (mock vs database) |
| AES-256-GCM | Authenticated encryption cipher used for field-level security |
| Stats | Aggregated health metrics (bpm, bp, bmi, weight) attached to a user |
| Sequence Counter | Pattern to generate incremental numeric IDs using a separate collection |

---
## 20. Conclusion
This documentation details every significant function, model, route, library usage, rationale for changes, and future improvement paths. The current state emphasizes developer velocity and resilience (mock fallback) while providing a scaffold for production-hardening (JWT auth, validation, persistent auxiliary data, secure key management).

For further enhancements, prioritize authentication upgrade, validation, persistent reminder/access models, and structured logging.

---
**End of Document**
