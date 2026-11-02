# Local Image Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Independently toggle local WebP storage for link icons and galleries, migrate existing sources and preserve original links.

**Architecture:** DataStore owns source URLs and a persistent cache manifest. A background image service downloads through the existing safe HTTP client, encodes bounded WebP images, and records per-source results. API projection selects local or source URLs using current settings, keeping edit sources explicit.

**Tech Stack:** Express 5, Vue 3/Pinia, Sharp, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-02-local-image-storage-design.md`

## Global Constraints

- `localIcons: true`, `localGallery: false`; both existing and new images migrate.
- Retain original URLs, cached files and independent switching; failures fall back to originals.
- All JSON I/O stays in DataStore; do not alter live user data for tests.
- Restrict downloads, pixels and upload serving; keep transparent/animated images where decodable.
- Preserve existing uncommitted changes; no commit, push or release in this task.

## Review Focus

- Gallery reordering and deleted/edited sources during migration must not receive stale snapshots.
- Settings disabled during download must immediately select remote URLs.
- Cache entries with missing files must be repaired on startup/retry.
- Private redirects and oversized/undecodable images must fail without broken stored paths.
- Editor must save sources, including unchanged dark icons and reordered gallery entries.

### Task 1: Persistent sources and safe binary downloads

**Files:** `backend/services/data-store.js`, `backend/services/security.js`, `backend/tests/image-storage.test.js`, `backend/tests/security.test.js`.

**Interfaces:** `getImageCache()`, `setCachedImage(kind, source, localUrl)`, `getImageSources() -> [{kind, source}]`, `projectLink(link)`, `getDisplayCategories()`; safeGet accepts `responseType`, `maxContentLength`, `allowedContentTypes` while retaining HTML defaults.

- [x] Add failing tests for settings defaults, independent switching, source-preserving projection, missing files and gallery reorder.
- [x] Run `npm test --prefix backend -- tests/image-storage.test.js tests/security.test.js`, verify expected failures.
- [x] Implement manifest I/O in DataStore, source enumeration and projection with `imageSources: {favicon, faviconDark, imageGallery}`.
- [x] Extend safeGet with bounded binary support without changing webpage callers; add redirect and body limit assertions.
- [x] Re-run targeted tests, expect all pass.

### Task 2: WebP cache and migration API

**Files:** create `backend/services/image-storage.js`; modify `backend/server.js`, `backend/package.json`, `backend/package-lock.json`; test `backend/tests/image-storage.test.js`, new `backend/tests/image-storage-api.test.js`.

**Interfaces:** `ImageStorage(store, {download?})`, `start({retry?}) -> void`, `status() -> {running,total,completed,failed,errors,revision}`, `whenIdle() -> Promise`; public projection uses DataStore interfaces from Task 1. Authenticated `GET /api/settings/image-storage`, `POST /api/settings/image-storage/retry`.

- [x] Add failing tests for real WebP/alpha output, failure fallback, cache reuse, restart repair, concurrent requests and mid-download disable/edit.
- [x] Install Sharp; implement two-worker queue with bounded binary download, atomic file writes and hash filenames under icons/gallery.
- [x] Trigger startup, settings and successful link mutations; project category/CRUD responses and narrowly allow generated static paths.
- [x] Add isolated authenticated API tests for settings, migration status/retry and static path access.
- [x] Run targeted tests and existing backend suite, expect pass or document independently verified baseline failures.

### Task 3: Settings and source-link UI

**Files:** `frontend/src/stores/navStore.js`, `frontend/src/components/modals/AdminModal.vue`, `frontend/src/components/modals/LinkFormModal.vue`, optional focused source-link component; relevant UI test under `backend/tests/` using Vite SSR or browser tooling.

**Interfaces:** Pinia `imageStorageStatus`, `fetchImageStorageStatus()`, `retryImageStorage()`; editor prefers API `imageSources` and submits canonical originals.

- [x] Add regression checks for source hydration and safe external links, observe failure first.
- [x] Add two switches to settings; poll status while admin is visible, refresh categories on migration completion; stop polling on close/unmount.
- [x] Add borderless original-image anchors after each icon/gallery URL row; allow HTTP(S) only and use noopener noreferrer.
- [x] Preserve gallery source order, current previews and input accessibility, accepting existing relative image paths.
- [x] Build frontend and check relevant UI behavior with an isolated service/data directory.

### Task 4: Final review and delivery

- [x] Run backend suite, production build, focused lint and review changes without staging existing user work.
- [x] Obtain independent code review; address actionable issues and re-run affected checks.
- [x] Record verification and limitations in this plan; deliver concise result without publishing.

## Execution ledger

- User approved implementation on 2026-11-02; proceed through tasks without further routine approval prompts.
- Ruling: implement in current dirty workspace and do not create commits/worktrees, preserving user work and installed dependencies; verification uses isolated temporary data only.
- Pre-flight: Task 2 consumes Task 1 source/cache/project interfaces; Task 3 consumes Task 2 API status and Task 1 imageSources. Names match above.

## Final verification — 2026-11-02

- Tasks 1–4 complete. Initial backend baseline: 50/50 tests passed.
- Final full suite: 9 files, 70/70 tests passed (`npm test --prefix backend -- --silent`). Targeted tests were observed failing before persistence, safe binary downloads, conversion, API and reactive-icon implementations/fixes.
- `npm run build`: passed. Existing large-bundle and static/dynamic import warnings remain.
- ESLint on all changed JS/Vue implementation and test files: zero errors. Existing style warnings and repository module-type configuration warning remain.
- Independent review found stale favicon references and unprojected category mutation responses. Both were reproduced, fixed and regression-tested. Follow-up review: PASS, no new findings.
- Real headless Chrome verified the production build against isolated temporary backend data: default switches; independent storage switching; mounted icon refresh; gallery transitioning to local WebP while open; source URLs in editor; borderless HTTP(S)-only original-image anchors; no page runtime errors. Image downloads and example.com image responses used fixed PNG fixtures; actual application API/state/rendering ran unchanged.
- Added README documentation. No deployment, release, commit or push. Existing live data was not used for tests.
- Ruling: added bounded ICO decoding with `decode-ico` because Sharp alone cannot read common favicon.ico files. Selected dependency supports the existing Node 20 Docker runtime.
- Ruling: made useFavicon consume reactive getters and resolved the open detail link from current store state; this is required for storage policy changes to affect already-mounted cards and galleries.