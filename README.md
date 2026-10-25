# Secure Note-Taking Application — Backend Implementation Spec

> REST API for a note-taking platform with JWT authentication, role-based access control, a deliberate MongoDB index strategy, and two aggregation-driven views (users grouped by interests; posts joined via `$lookup`).
>
> **Audience:** this document is written to be executed end-to-end by an AI coding agent (or a human developer) with **no other context**. Every schema, index, endpoint, and pipeline decision is final — implement as specified, do not redesign.
>
> Source brief: *Technical Interview Task — Secure Note-Taking Application*.

---

## 1. Tech stack (fixed — do not substitute)

| Concern | Choice | Notes |
|---|---|---|
| Runtime | Node.js >= 18 | CommonJS modules (`require`) |
| HTTP framework | Express 5 | rejected async handlers auto-forward to the error handler |
| Database | MongoDB 6/7 + Mongoose 8 | single database, no migration tooling |
| Auth | `jsonwebtoken` (HS256) + `bcryptjs` | pure-JS bcrypt, 12 salt rounds |
| Hardening | `helmet`, `cors`, `express-rate-limit` | sensible defaults are fine |
| Config | `dotenv` | |

**Dependency policy:** add nothing else. No TypeScript, no CSS frameworks, no component libraries, no template engines, no test runners. Keep `package.json` minimal.

## 2. Hard constraints (graded — non-negotiable)

1. **All indexes are declared only via `schema.index()`.** No field-level `index: true`, no field-level `unique: true`, no ad-hoc `createIndex()` calls. Reason: the reviewer must see the complete index strategy inside the model files.
2. **Exactly the six indexes defined in section 7 — and nothing more.** "DO NOT MAKE ANY UNNECESSARY INDEXES" is an explicit grading criterion. If a query seems to need a new index, re-read section 7; the existing set already covers it.
3. **Pagination on every list endpoint**, using the standard envelope defined in section 9.
4. **Scenario 1 (users grouped by interests) must use exactly one `User.aggregate()` call.** No `find()`, `distinct()`, or a second `aggregate()` to enrich results — all shaping happens inside the single pipeline.
5. **Scenario 2 (posts of one user) must be a single aggregation pipeline containing a `$lookup` stage.** `Post.find({ author })` is not an acceptable substitute even though it would work.
6. **Frontend effort is capped.** A minimal functional frontend (login form + note list + create form, plain HTML + `fetch`) is acceptable; zero styling effort. Do not build templates or polish UI.
7. **Passwords hashed with bcrypt (12 rounds) inside a `pre('save')` hook.** Password changes must go through `doc.save()` — never `findByIdAndUpdate`, which bypasses the hook and would store a plaintext value.

## 3. Agent operating rules

- Implement in the order of section 14. Verify each step (boot the server, hit the endpoint) before starting the next.
- Collection names are fixed: model `User` → `users`, `Note` → `notes`, `Post` → `posts`. The `$lookup` in section 11.2 depends on the literal string `'posts'`.
- Never spread `req.body` into model constructors — pick fields explicitly (mass-assignment protection). Only the admin create/update endpoints may set `role`.
- Prefer 404 over 403 for resources the caller does not own (no existence disclosure).
- When a requirement seems ambiguous, choose the interpretation that keeps the index count minimal.
- Do not rename fields, routes, or collections from this spec; downstream verification commands reference them literally.

## 4. Project structure

```
notes-app/
├── src/
│   ├── config/
│   │   └── db.js                  # mongoose.connect wrapper
│   ├── models/
│   │   ├── User.js                # + email unique index, createdAt index, bcrypt hook
│   │   ├── Note.js                # + {owner, createdAt} compound, createdAt index
│   │   └── Post.js                # + author index, createdAt index
│   ├── middleware/
│   │   └── auth.js                # protect (JWT verify) + requireAdmin
│   ├── controllers/
│   │   ├── auth.controller.js     # register, login
│   │   ├── user.controller.js     # me
│   │   ├── note.controller.js     # notes CRUD + admin list-all
│   │   ├── admin.controller.js    # user management + Scenario 1 aggregation
│   │   └── post.controller.js     # posts + Scenario 2 aggregation
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── user.routes.js
│   │   ├── note.routes.js
│   │   ├── post.routes.js
│   │   └── admin.routes.js
│   ├── utils/
│   │   └── pagination.js
│   ├── app.js                     # express app, security middleware, error handler
│   ├── server.js                  # boot: connect DB, then listen
│   └── seed.js                    # demo data (run once)
├── .env
└── package.json
```

## 5. Environment & commands

`.env` (never commit):

```env
PORT=3000
MONGO_URI=mongodb://127.0.0.1:27017/notes-app
JWT_SECRET=<openssl rand -hex 32>
```

`package.json` scripts:

```json
{
  "scripts": {
    "start": "node src/server.js",
    "seed": "node src/seed.js"
  }
}
```

```bash
npm install
npm run seed     # creates demo users/notes/posts (section 10 has the accounts)
npm start
```

## 6. Data models

### 6.1 `src/models/User.js`

```js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true, maxlength: 100 },
  email:     { type: String, required: true, trim: true, lowercase: true,
               match: [/^\S+@\S+\.\S+$/, 'Invalid email address'] },
  password:  { type: String, required: true, minlength: 8, select: false },
  role:      { type: String, enum: ['user', 'admin'], default: 'user' },
  interests: { type: [String], default: [],
               set: (arr) => [...new Set(arr.map(s => String(s).trim().toLowerCase()))] },
}, { timestamps: true });

// Login: findOne({ email }) + duplicate-email guard on every insert.
userSchema.index({ email: 1 }, { unique: true });
// Admin list view: find({}).sort({ createdAt: -1 }).skip().limit()
userSchema.index({ createdAt: -1 });
// NOT indexed: role (never a query predicate), interests (Scenario 1 is a
// predicate-free $unwind+$group — see section 11.1 for the justification).

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
```

Key decisions:

- `select: false` on `password` — the hash cannot leak through any generic query; login opts back in with `.select('+password')`.
- The `interests` setter dedupes and lowercases, so the Scenario 1 `$group` counts each user once per interest and does not split `Chess` / `chess` into two groups.
- A unique index is **not** validation: duplicate email surfaces as MongoDB error `E11000` and is mapped to 409 by the central error handler (section 12).

### 6.2 `src/models/Note.js`

```js
const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  body:  { type: String, default: '', maxlength: 10000 },
}, { timestamps: true });

// User's own list: find({ owner }).sort({ createdAt: -1 }).skip().limit()
// ESR: equality on owner (leading) + sort on createdAt (trailing) — one index, no SORT stage.
noteSchema.index({ owner: 1, createdAt: -1 });
// Admin "everyone's notes": find({}).sort({ createdAt: -1 }).skip().limit()
noteSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Note', noteSchema);
```

Deliberate omission: **no** `index: true` on `owner` — that would create a redundant single-field index shadowed by the compound. Over-indexing is a grading failure, not a safety net.

### 6.3 `src/models/Post.js`

```js
const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:  { type: String, required: true, trim: true, maxlength: 200 },
  body:   { type: String, default: '' },
}, { timestamps: true });

// Scenario 2 $lookup: foreignField 'author' equality probes from users → posts.
// Also serves the cascade deleteMany({ author }) in admin user removal.
postSchema.index({ author: 1 });
// Public feed: find({}).sort({ createdAt: -1 }).skip().limit()
postSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Post', postSchema);
```

Mongoose builds `schema.index()` declarations automatically on connect (`autoIndex` defaults to on). After first boot, `db.users.getIndexes()` must show exactly the indexes from section 7.

## 7. Index strategy (final — do not extend)

### 7.1 The manifest — six secondary indexes, each mapped to a concrete query

| # | Collection | `schema.index` declaration | Unique | Serves (exact query shape) |
|---|---|---|---|---|
| 1 | users | `{ email: 1 }, { unique: true }` | yes | `findOne({ email })` (login); duplicate guard on register and admin-create |
| 2 | users | `{ createdAt: -1 }` | no | `find({}).sort({ createdAt: -1 }).skip().limit()` — admin user list |
| 3 | notes | `{ owner: 1, createdAt: -1 }` | no | `find({ owner }).sort({ createdAt: -1 }).skip().limit()` — user's own notes |
| 4 | notes | `{ createdAt: -1 }` | no | `find({}).sort({ createdAt: -1 }).skip().limit()` — admin all-notes list |
| 5 | posts | `{ author: 1 }` | no | `$lookup` foreign-field probes (Scenario 2); `deleteMany({ author })` cascade |
| 6 | posts | `{ createdAt: -1 }` | no | `find({}).sort({ createdAt: -1 }).skip().limit()` — public feed |

Every by-id read (`GET /users/me`, `GET /users/:id`, `GET /notes/:id`, admin user update/delete, the `$match` in Scenario 2) resolves through the **default `_id` index** — perfect selectivity, nothing to add.

### 7.2 Deliberately NOT indexed (state this in the submitted README)

| Candidate | Why it is intentionally absent |
|---|---|
| `users.interests` | Scenario 1 has **no filter predicate** — an index cannot serve a `$unwind` + `$group` full scan. Adding one is exactly the "unnecessary index" the brief forbids. |
| `users.role` | Role is checked in application middleware after an `_id` fetch; it never appears as a query predicate. |
| `{ _id: 1, owner: 1 }` on notes | `_id` is already unique-selective; `owner` is a residual filter on a single fetched document. |
| `{ author: 1, createdAt: -1 }` on posts | The lookup is pure equality on `author`; nothing sorts per-author in scope. (If per-author sorted output were added via the pipeline-form `$lookup`, widen this index — still one index, no new one.) |

### 7.3 The two rules behind the manifest

1. **ESR (Equality → Sort → Range):** for `find({ owner }).sort({ createdAt: -1 })`, a compound `{ owner: 1, createdAt: -1 }` satisfies the equality on the leading field and delivers sort order for free — no in-memory SORT stage. A bare `{ owner: 1 }` would still force a sort of every owned note per request.
2. **A filterless paginated list still needs an index — for the sort.** `find({}).sort({ createdAt: -1 }).skip().limit()` walks the `{ createdAt: -1 }` index in order and skips *index keys*, never documents. That is the "admin listing users" case named in the brief.

## 8. Authentication & authorization

### 8.1 Token design

- HS256, secret from `JWT_SECRET`, payload `{ sub: userId }` only, `expiresIn: '1h'`.
- **Token identifies; database authorizes.** The role is *not* in the token — `protect` re-fetches the user from the DB on every request, so role changes, bans, and deletions take effect immediately. Cost: one indexed `_id` read per request; benefit: `GET /users/me` gets its profile for free from the same fetch.
- Refresh tokens are out of scope — do not half-build them.

### 8.2 `src/middleware/auth.js` (reference implementation)

```js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function protect(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const user = await User.findById(payload.sub);        // _id index
  if (!user) return res.status(401).json({ error: 'User no longer exists' });

  req.user = user;                                       // fresh role + existence check
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

module.exports = { protect, requireAdmin };
```

### 8.3 Status-code semantics

- **401** — missing, malformed, expired, or invalid token; or the token's user no longer exists.
- **403** — authenticated but insufficient role (non-admin touching `/api/admin/*`).
- **404** — resource does not exist **or belongs to someone else** (never 403 for other users' notes).

### 8.4 Permission matrix

| Capability | User | Admin |
|---|---|---|
| Create / update / delete **own** notes | yes | yes |
| List own notes (`GET /api/notes`) | yes | yes |
| Read a single note (`GET /api/notes/:id`) | own only | **any** note |
| List all notes (`GET /api/admin/notes`) | no | yes |
| Read own profile (`GET /api/users/me`) | yes | yes |
| Create / list / update / delete users (`/api/admin/users`) | no | yes |
| Grouped-by-interests view | no | yes |
| Create posts; read feed and posts-by-user | yes | yes |

Note: admins **edit and delete only their own notes** — the brief grants admins *view* rights on everyone's notes, not manage rights. Ownership stays inside the query predicate (`{ _id, owner }`), which makes the check atomic and leaks nothing.

## 9. Pagination specification (applies to every list endpoint)

- Query parameters: `page` (integer >= 1, default 1), `limit` (integer 1–100, default 10 — hard-capped at 100).
- Response envelope (uniform for all lists):

```json
{
  "data": [ "...resources..." ],
  "pagination": { "page": 2, "limit": 10, "total": 23, "totalPages": 3, "hasNextPage": true }
}
```

- Implementation: `Promise.all([Model.countDocuments(filter), Model.find(filter).sort(sort).skip(skip).limit(limit).lean()])`.
- `.lean()` on all read paths; skip/limit pagination is the agreed scope (cursor pagination is a documented trade-off, not a requirement).

## 10. API reference

Mount order inside `/api/admin`: register `GET /users/grouped-by-interest` **before** `GET /users/:id`, otherwise `:id` swallows the literal path.

| # | Method | Path | Access | Purpose | Index used |
|---|---|---|---|---|---|
| 1 | POST | `/api/auth/register` | public | create account | users.email (dup guard) |
| 2 | POST | `/api/auth/login` | public | obtain JWT | users.email |
| 3 | GET | `/api/users/me` | user | own profile | users._id (via protect) |
| 4 | POST | `/api/admin/users` | admin | add user (may set `role`) | users.email |
| 5 | GET | `/api/admin/users` | admin | list users, paginated | users.createdAt |
| 6 | GET | `/api/admin/users/:id` | admin | read one user | users._id |
| 7 | PATCH | `/api/admin/users/:id` | admin | update name/email/role/interests/password | users._id |
| 8 | DELETE | `/api/admin/users/:id` | admin | remove user + cascade | users._id (+ owner/author for cascade) |
| 9 | GET | `/api/admin/users/grouped-by-interest` | admin | **Scenario 1** | none — by design |
| 10 | POST | `/api/notes` | user | create note | — |
| 11 | GET | `/api/notes` | user | own notes, paginated | notes {owner, createdAt} |
| 12 | GET | `/api/notes/:id` | user/admin | read note (own; admin: any) | notes._id |
| 13 | PATCH | `/api/notes/:id` | owner | update own note | notes._id |
| 14 | DELETE | `/api/notes/:id` | owner | delete own note | notes._id |
| 15 | GET | `/api/admin/notes` | admin | everyone's notes, paginated | notes.createdAt |
| 16 | POST | `/api/posts` | user | create post | — |
| 17 | GET | `/api/posts` | public | public feed, paginated, newest first | posts.createdAt |
| 18 | GET | `/api/posts/user/:userId` | public | **Scenario 2** | users._id + posts.author |

### 10.1 Request/response shapes

```http
POST /api/auth/register
{ "name": "Ana", "email": "ana@notes.dev", "password": "ana123456", "interests": ["chess", "reading"] }
→ 201 { "user": { "_id": "...", "name": "Ana", "email": "ana@notes.dev", "role": "user",
                  "interests": ["chess", "reading"], "createdAt": "..." } }
```

A client-supplied `role` on register is ignored (register endpoint never passes it to `User.create`).

```http
POST /api/auth/login
{ "email": "ana@notes.dev", "password": "ana123456" }
→ 200 { "token": "<jwt>", "user": { ... } }
```

Unknown email and wrong password return the **same** message (`401 Invalid credentials`) — no account enumeration.

```http
PATCH /api/admin/users/:id
{ "role": "admin" }                         — or any subset of name/email/role/interests/password
→ 200 { "user": { ... } }                   — password (if present) re-hashed via doc.save()
```

```http
DELETE /api/admin/users/:id
→ 204                                        — cascades: Note.deleteMany({ owner }), Post.deleteMany({ author })
```

### 10.2 Demo accounts created by `npm run seed`

| Account | Password | Role | Interests | Owns |
|---|---|---|---|---|
| admin@notes.dev | admin1234 | admin | chess, ops | 1 note |
| ana@notes.dev | ana123456 | user | chess, reading | 2 notes, 2 posts |
| ben@notes.dev | ben123456 | user | reading, hiking | 1 note, 1 post |
| chloe@notes.dev | chloe1234 | user | *(empty)* | — |

## 11. Aggregation scenarios (graded — follow exactly)

### 11.1 Scenario 1 — users grouped by interests

`GET /api/admin/users/grouped-by-interest` (admin-only: it exposes every user's identity).

```js
exports.groupedByInterest = async (req, res) => {
  const groups = await User.aggregate([
    { $project: { name: 1, interests: 1 } },   // slim docs before unwinding
    { $unwind: '$interests' },                 // one doc per (user, interest); empty arrays vanish
    { $group: {
        _id: '$interests',                     // the interest becomes the grouping key
        count: { $sum: 1 },
        users: { $push: { _id: '$_id', name: '$name' } },
    } },
    { $sort: { count: -1, _id: 1 } },          // most popular first, deterministic ties
  ]);
  res.json({ data: groups });
};
```

Constraints and reasoning:

- **Exactly one `aggregate()` call.** `$project`, `$unwind`, `$group`, `$sort` are pipeline *stages* inside that call — this satisfies "do not use any other methods". The member list is built with `$push` inside the pipeline; there is **no** follow-up `find()` enrichment.
- `$unwind` emits one document per (user, interest) pair; users with empty `interests` correctly appear in no group.
- **No index serves this pipeline, and none may be created.** An index only helps a query with a predicate to seek on (`$match`, sort bounds, ranges). This pipeline must touch every user and hash-group — `users.interests` would be a pure write-tax index and directly violates the brief's constraint. Write this justification into the submitted README.

Expected output for the seed data:

```json
{ "data": [
  { "_id": "chess",   "count": 2, "users": [{ "_id": "...", "name": "Admin" }, { "_id": "...", "name": "Ana" }] },
  { "_id": "reading", "count": 2, "users": [{ "_id": "...", "name": "Ana" }, { "_id": "...", "name": "Ben" }] },
  { "_id": "hiking",  "count": 1, "users": [{ "_id": "...", "name": "Ben" }] },
  { "_id": "ops",     "count": 1, "users": [{ "_id": "...", "name": "Admin" }] }
] }
```

### 11.2 Scenario 2 — all posts of one user via `$lookup`

`GET /api/posts/user/:userId` (public — posts are visible to everyone).

```js
const mongoose = require('mongoose');
const User = require('../models/User');

exports.postsByAuthor = async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ error: 'Invalid user id' });

  // Mongoose does NOT cast inside aggregate() — string → ObjectId must be manual:
  const [result] = await User.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(userId) } },   // _id index; MUST be first stage
    { $lookup: {
        from: 'posts',             // collection name — pluralized from model 'Post'
        localField: '_id',
        foreignField: 'author',    // index { author: 1 } on the foreign side
        as: 'posts',
    } },
    { $project: { name: 1, email: 1, posts: 1 } },
  ]);

  if (!result) return res.status(404).json({ error: 'User not found' });
  res.json({ data: result });     // posts: [] when the user has written none
};
```

Two classic failure modes (both graded):

1. **The ObjectId cast.** In `find()` Mongoose auto-casts strings; in `aggregate()` it does not. `$match: { _id: userId }` with a raw string silently matches nothing — a 404 that looks like a logic bug. Always construct `new mongoose.Types.ObjectId(...)`.
2. **`from: 'posts'` is the collection name**, not the model name. If the lookup returns empty arrays for everyone, this is why.

Index behavior: `$match` runs first and uses the `_id` index; the `$lookup` then probes `posts` by `author` through the `{ author: 1 }` index. Without that index, every lookup degrades to a full scan of the posts collection — see section 13 for the drop/re-add demonstration that proves the index is "strictly required".

## 12. Error handling

Central error handler in `src/app.js` (last middleware). Express 5 forwards rejected async handlers here automatically — no try/catch wrappers needed in controllers.

| Condition | Detection | Status |
|---|---|---|
| Duplicate unique key | `err.code === 11000` | 409 — `Email already in use` |
| Mongoose validation failure | `err.name === 'ValidationError'` | 422 |
| Malformed ObjectId in path | `err.name === 'CastError'` | 400 |
| Unknown route | 404 middleware before the error handler | 404 |
| Anything else | logged server-side, generic message | 500 |

## 13. Verification receipts (run before submitting)

In `mongosh` (or via `Model.find(...).explain('executionStats')`):

```js
db.notes.find({ owner: ObjectId("<anaId>") }).sort({ createdAt: -1 }).limit(10).explain('executionStats')
// expect: IXSCAN "owner_1_createdAt_-1", NO SORT stage, totalDocsExamined ≈ nReturned

db.users.find({}).sort({ createdAt: -1 }).limit(10).explain('executionStats')
// expect: IXSCAN "createdAt_-1", no SORT stage

db.notes.getIndexes(); db.users.getIndexes(); db.posts.getIndexes()
// expect: _id + exactly the six from section 7 — no strays

db.users.aggregate([
  { $match: { _id: ObjectId("<anaId>") } },
  { $lookup: { from: 'posts', localField: '_id', foreignField: 'author', as: 'posts' } }
], { explain: true })
// expect: $match → IXSCAN _id; $lookup probes posts via author_1
```

The money demo: `db.posts.dropIndex('author_1')`, re-run the `$lookup` explain, show the foreign side flip to a collection scan, re-create the index. Screenshot both runs for the submitted README — it is written proof the index is *strictly required*.

Also verify with the seed data:

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@notes.dev","password":"admin1234"}' | jq -r .token)

curl -s localhost:3000/api/admin/users/grouped-by-interest -H "Authorization: Bearer $TOKEN"
curl -s localhost:3000/api/posts/user/<anaId>
curl -s "localhost:3000/api/notes?page=1&limit=10" -H "Authorization: Bearer $TOKEN"   # admin sees empty own list — correct
```

## 14. Implementation order

1. Scaffold: `package.json`, `.env`, directory tree, `db.js`, minimal `app.js` + `server.js` — verify the server boots and connects.
2. The three models (section 6) — after first boot, confirm `getIndexes()` shows the six.
3. Auth: register, login, `protect`, `requireAdmin` — verify with curl (register → login → `/api/users/me`).
4. Pagination utility.
5. Notes CRUD, user-scoped — verify user B gets 404 (not 403) on user A's note for read/update/delete.
6. Admin routes: user CRUD + cascade delete + `GET /api/admin/notes`.
7. Posts: create + public feed.
8. Scenario 1 endpoint (section 11.1).
9. Scenario 2 endpoint (section 11.2).
10. Seed script; run every command in section 13; confirm section 15.
11. Optional: minimal functional frontend (single static page: login form, note list, note create) — no styling effort.

## 15. Definition of done

- [ ] All six indexes created via `schema.index()` and visible in `getIndexes()` — no field-level `index`/`unique`, no extra indexes.
- [ ] Every list endpoint returns the `{ data, pagination }` envelope with capped `limit`.
- [ ] Every GET resolves through an index: `explain()` shows IXSCAN, never COLLSCAN, never an in-memory SORT stage on list paths.
- [ ] Scenario 1 is one `aggregate()` call, no enrichment queries.
- [ ] Scenario 2 is one `$lookup` pipeline with manual ObjectId casting; works for users with zero posts.
- [ ] Role enforcement verified: non-admin gets 403 on `/api/admin/*`; users cannot read, update, or delete notes they do not own (404).
- [ ] Passwords bcrypt-hashed (12 rounds), never present in any API response; login errors are indistinguishable between unknown email and wrong password.
- [ ] Duplicate email returns 409 via the central error handler; malformed ids return 400.
- [ ] Deleting a user cascades their notes and posts.
- [ ] Seed script runs clean; both aggregation endpoints produce correct output on seed data.
- [ ] Submitted README contains the index manifest, the "deliberately not indexed" table, and the explain() evidence.