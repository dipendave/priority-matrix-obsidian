# Changelog

All notable changes to this project will be documented in this file.

---

## [2026-05-16 19:00] - 2.0.3 — Address source/CSS lint warnings

**Why:** Obsidian community directory flagged two warnings on 2.0.2.

**Changed:**
- `esbuild.config.mjs`: replaced `import builtins from "builtin-modules"` with `import { builtinModules as builtins } from "node:module"` — Node has had `module.builtinModules` built in since 16, no need for an external package
- `package.json`: removed `builtin-modules` dev dependency (and regenerated `package-lock.json`)
- `styles.css`: removed `!important` from `.pm-hidden` — replaced with doubled-class selector `.pm-hidden.pm-hidden { display: none }` which boosts specificity to (0,2,0) so it wins over any single-class display rule without `!important`

**Verified:** 208 Jest + 48 Playwright tests pass, build clean

**Files:**
- `esbuild.config.mjs`
- `package.json`, `package-lock.json`
- `styles.css`

---

## [2026-05-16 18:00] - 2.0.2 — Release notes + artifact attestations

**Why:** Obsidian community directory flagged two recommendations on 2.0.1: no release description, and no GitHub artifact attestations on `main.js`/`styles.css`. Addressed both.

**Changed:**
- `.github/workflows/release.yml`:
  - Added `id-token: write` and `attestations: write` permissions
  - Added `actions/attest-build-provenance@v2` step for `main.js` and `styles.css`
  - Added `--generate-notes` to `gh release create` so releases get auto-generated changelogs from commits

**Files:**
- `.github/workflows/release.yml`
- `manifest.json`, `package.json`, `package-lock.json`, `versions.json` (bumped to 2.0.2)

---

## [2026-05-16 17:00] - 2.0.1 — Rename id to task-priority-matrix

**Why:** community.obsidian.md rejected the `priority-matrix` id with "An entry with this ID already exists." even though it's not in the public registry — likely a stale record in their submission queue. Picked a less-collision-prone id to unblock submission.

**Changed:**
- `manifest.json` id `priority-matrix` → `task-priority-matrix`
- `manifest.json` name "Priority Matrix" → "Task Priority Matrix"
- `package.json` name `obsidian-priority-matrix` → `obsidian-task-priority-matrix`
- Display text + ribbon tooltip "Priority matrix" → "Task priority matrix"
- README title and references updated
- `.env.local` vault sync path updated

**Not changed (intentional):**
- CSS classes stay `pm-*` (internal, not user-visible)
- TS classes stay `PriorityMatrix*` (internal)

**Files:**
- `manifest.json`, `package.json`, `package-lock.json`
- `src/main.ts`, `src/view.ts`
- `tests/community-compliance.test.ts`, `tests/view-integration.test.ts`
- `README.md`, `.env.local`

---

## [2026-05-16 12:00] - 2.0.0 — Rebrand to Priority Matrix

**Why:** Another developer (`oamadorr/eisenhower-matrix-obsidian`) registered the `eisenhower-matrix` plugin ID first under Obsidian's new self-service submission flow after our PR #10188 to `obsidian-releases` was invalidated by that repo disabling PRs. Rebranded to avoid the conflict and clear the path to publishing.

**Changed:**
- `manifest.json` id `eisenhower-matrix` → `priority-matrix`
- `manifest.json` name "Eisenhower Matrix" → "Priority Matrix" (description still mentions Eisenhower Matrix as the underlying method)
- `package.json` name `obsidian-eisenhower-matrix` → `obsidian-priority-matrix`
- All CSS class prefixes `em-*` → `pm-*` (124 in styles.css, 90 in view.ts, 4 in types.ts, 323 in test fixture, ~200 across tests)
- TypeScript identifiers: `EisenhowerMatrixPlugin/View/Data` → `PriorityMatrixPlugin/View/Data`, `VIEW_TYPE_EISENHOWER` → `VIEW_TYPE_PRIORITY`
- User-facing strings: `getDisplayText()` and ribbon tooltip now return "Priority matrix"
- README rewritten with new name and description
- Version bumped 1.1.0 → 2.0.0 (id change = new plugin from Obsidian's perspective)
- `.env.local` vault sync paths updated to `priority-matrix` folder (users must rename their Obsidian plugin folder)

**Verified:**
- 208 Jest tests pass
- 48 Playwright tests pass (12 skipped — desktop-only)
- Build clean, screenshots regenerated

**Files:**
- `manifest.json`, `package.json`, `package-lock.json`, `versions.json`
- `src/types.ts`, `src/main.ts`, `src/view.ts`, `styles.css`
- `tests/__mocks__/obsidian.ts` (none needed — sdk shim), `tests/main.test.ts`, `tests/view.test.ts`, `tests/view-integration.test.ts`, `tests/types.test.ts`, `tests/community-compliance.test.ts`, `tests/mobile.spec.ts`, `tests/fixtures/matrix.html`
- `README.md`, `.env.local`
- `screenshots/*.png` (regenerated)

---

## [2026-03-22 14:00] - Auto-release on Every Push

**Changed:**
- `post-commit` hook auto-tags and pushes the tag after every commit, triggering the GitHub release workflow
- Minor version bumps every 10 patches (e.g., 1.0.9 → 1.1.0) in `scripts/bump-version.mjs`

**Files:**
- `scripts/bump-version.mjs`
- `.git/hooks/post-commit` (local only, not tracked)

---

## [2026-03-22 13:00] - Design Evaluation Polish

**Changed:**
- Completion notice with undo: checking a task now shows "Task completed. Undo" notice (same pattern as delete)
- Checkbox color: replaced `var(--interactive-accent)` with neutral green (`#22c55e`) to avoid clashing with quadrant colors
- Checkbox border: increased contrast from `var(--text-muted)` to `var(--background-modifier-border)`, green hover hint
- Auto-expand completed section on first completion (session-level, respects toggle after that)
- Updated Playwright fixture with checkbox elements on all tasks and a 3-item completed section

**Files:**
- `src/view.ts` — completion notice, auto-expand logic, session toggle tracking
- `styles.css` — green checkbox color, border contrast
- `tests/fixtures/matrix.html` — checkboxes + completed section in fixture
- `tests/view-integration.test.ts` — 3 new tests (notice, undo, auto-expand)

---

## [2026-03-22 12:00] - Task Completion Feature

**Added:**
- Checkbox on each task to mark it as completed
- Collapsible "Completed (N)" section below the matrix grid
- Completed tasks show: strikethrough title, quadrant color dot, relative completion time
- Click checked checkbox to revive (uncomplete) a task back to its original quadrant
- Delete button on completed tasks for permanent removal
- `formatCompletedDate()` utility for relative time display ("Just now", "X min ago", etc.)
- 42 new tests (12 plugin unit tests, 7 utility tests, 23 view integration tests)

**Data model:**
- Added `completedAt?: string | null` to `Task` interface (no migration needed)
- Added `QUADRANT_COLORS` constant for quadrant-origin dots

**Files:**
- `src/types.ts` — `completedAt` field, `QUADRANT_COLORS`
- `src/main.ts` — `completeTask()`, `uncompleteTask()`, `getCompletedTasks()`, updated `getTasksForQuadrant()`
- `src/view.ts` — checkbox rendering, completion handlers, completed section, `formatCompletedDate()`
- `styles.css` — checkbox, completed section, quadrant dot, mobile responsive styles
- `tests/main.test.ts`, `tests/view.test.ts`, `tests/view-integration.test.ts`

---

## [2026-03-02 21:00] - Comprehensive View Integration Tests

**Added:**
- 93 integration tests for `EisenhowerMatrixView` covering all user-facing core functionality
- Enhanced obsidian mock with real DOM helpers (createEl, createDiv, addClass, etc.) for jsdom testing
- `jest-environment-jsdom` dev dependency for DOM-based view tests

**Test categories (93 tests):**
- View identity & lifecycle (10): getViewType, getDisplayText, getIcon, onOpen, onClose, drag hint notice
- Matrix rendering (9): 4-quadrant structure, axis labels, color classes, add buttons, re-render cleanup
- Empty & populated state (4): empty text, em-quadrant-empty class, populated rendering
- Task count badges (4): badge show/hide, correct counts, quadrant isolation
- Task rendering (12): title, data-task-id, drag handle, delete button, draggable, due dates, overdue class, ordering
- Add task flow (12): form toggle, submit, validation, error states, Enter/Escape keys, cancel, reset, highlight
- Edit task flow (12): edit mode activation, pre-fill, save, validation, cancel, Enter/Escape, draggable disabled, editing class
- Delete & undo flow (6): delete removes task, notice with undo, undo restores, re-renders, nonexistent ID
- Desktop drag & drop (7): dragstart/dragend, dataTransfer, drop zone highlighting, cross-quadrant move, same-quadrant no-op
- Data persistence (5): savePluginData called on add, edit, delete, undo, drag move
- Edge cases (6): whitespace validation, single char, XSS safety, empty date, rapid add, edit validation
- Accessibility (3): aria-labels on add/delete buttons, data-task-id
- Event propagation (2): delete vs edit isolation, mousedown stopPropagation
- Per-quadrant forms (2): independent forms, quadrant isolation

**Files:**
- `tests/view-integration.test.ts` (new)
- `tests/__mocks__/obsidian.ts` (enhanced with DOM helpers)

---

## [2026-03-02 20:15] - Sync Regression Tests

**Added:**
- 5 unit tests for `onExternalSettingsChange()` to prevent sync regression: method existence, data reload from disk, view re-render, no-views graceful handling, non-matrix view filtering

**Files:**
- `tests/main.test.ts`

---

## [2026-03-02 20:00] - Sync Support via onExternalSettingsChange

**Added:**
- `onExternalSettingsChange()` hook in main plugin — reloads `data.json` and re-renders the matrix view when Obsidian Sync (or any external process) updates the plugin data file
- Tasks added on one device now appear on other synced devices without requiring a manual reload

**Files:**
- `src/main.ts`

---

## [2026-02-17 17:00] - Community Plugin Compliance Test Suite

**Added:**
- 24 automated compliance tests (`tests/community-compliance.test.ts`) that guard against ObsidianReviewBot regressions
- Tests cover: no innerHTML/outerHTML, no inline styles, no deprecated `substr`, async/await correctness, promise handling, command registration (no plugin ID/name leaking), no onunload detach, sentence case UI text

**Files:**
- `tests/community-compliance.test.ts`

---

## [2026-02-17 16:30] - Design Eval Refinements: Overflow Fade, Dark Highlight, SVG Icons

**Changed:**
- Overflow fade gradient strengthened from 0.06 to 0.15 opacity — now visibly signals "scroll for more"
- Dark mode task creation highlight uses white flash (`rgba(255,255,255,0.08)`) instead of invisible black
- Delete button changed from Unicode × to SVG icon via `setIcon("x")` for visual consistency with + button
- Desktop click-to-edit hover background increased (0.04 to 0.06 light, 0.06 to 0.08 dark) for better affordance
- Added `em-has-overflow` class to overloaded fixture for screenshot verification
- Updated README feature table with creation feedback and mobile onboarding
- Refreshed all README and design-review screenshots

**Files:**
- `styles.css`
- `src/view.ts`
- `tests/fixtures/matrix.html`
- `README.md`
- `screenshots/*.png`
- `screenshots/design-review/*.png`

---

## [2026-02-17 15:30] - Design Evaluation Polish (5 Items)

**Changed:**
- Overflow fade on task lists is now conditional — only shown when content actually overflows via `em-has-overflow` class toggled in `updateOverflowIndicators()`
- Inverted Add/Cancel button weight hierarchy — Add/Save is now solid (tinted background), Cancel is ghost (transparent with border)
- Per-quadrant colored submit buttons with `rgba(color, 0.12)` background and `rgba(color, 0.4)` border
- Empty state text updated from "Tap + to add a task" to "Tap + to add, tap a task to edit" for edit discoverability
- One-time mobile drag onboarding notice on first open: "Long-press a task to drag it between quadrants"
- New task highlight animation (`em-highlight-new`, 600ms ease-out background fade) confirms successful task creation
- Added `hasSeenDragHint` to `EisenhowerMatrixData` interface for persisting one-time mobile onboarding
- Added `Platform` export to obsidian mock for unit test compatibility

**Files:**
- `styles.css`
- `src/view.ts`
- `src/types.ts`
- `tests/__mocks__/obsidian.ts`
- `tests/fixtures/matrix.html`

---

## [2026-02-17 12:00] - Design Polish: Form Buttons, Overflow Fade, Dark Mode Q3

**Changed:**
- Form submit button changed from purple `var(--interactive-accent)` to ghost button with quadrant-colored border (matches + button style)
- Overflow fade gradient now uses per-quadrant background colors instead of generic `--background-primary-alt`
- Dark mode Q3 (Delegate) opacity dialed back from 0.10/0.20 to 0.08/0.18 for better balance with other quadrants
- Empty state text vertically centered within quadrants

**Files:**
- `styles.css`

---

## [2026-02-16 14:00] - Follow-up Design Review with Fresh Screenshots

**Added:**
- Follow-up design review (`DESIGN_REVIEW.md`) evaluating all changes since the initial 2026-02-14 review
- `scripts/capture-design-review-screenshots.mjs` — Playwright screenshot capture for design review (7 screenshots: desktop populated/dark/empty/overloaded/form-open, mobile populated/empty)
- 7 new follow-up screenshots in `screenshots/design-review/followup-*.png`

**Changed:**
- Updated `DESIGN_REVIEW.md` from initial review to follow-up format: documents what was fixed, verifies fixes via fresh screenshots, identifies 7 remaining polish issues (purple form button, always-visible date row, empty state spacing, overflow gradient color mismatch, dark mode Q3 weight, mobile button sizing, task card color tags)
- Graded current state B+ (up from C+ at initial review), with clear path to A-tier documented

**Files:**
- `DESIGN_REVIEW.md`
- `scripts/capture-design-review-screenshots.mjs`
- `screenshots/design-review/followup-desktop-populated.png`
- `screenshots/design-review/followup-desktop-dark.png`
- `screenshots/design-review/followup-desktop-empty.png`
- `screenshots/design-review/followup-desktop-overloaded.png`
- `screenshots/design-review/followup-desktop-form-open.png`
- `screenshots/design-review/followup-mobile-populated.png`
- `screenshots/design-review/followup-mobile-empty.png`

---

## [2026-02-15 12:00] - Design Evaluation Improvements

**Changed:**
- Added vertical "IMPORTANT / NOT IMPORTANT" axis label on desktop (grid layout), hidden on mobile
- Task content now shows hover highlight to hint at click-to-edit editability
- Drag handles show at 15% opacity by default (was invisible until hover)
- Dark mode Q3 (Delegate) orange is brighter and more distinct (was muddy)
- Overflow fade hint is taller (30px, was 20px) for better scroll signaling
- Empty state text changed from "No tasks yet" to "Tap + to add a task" for actionable guidance
- Matrix wrapper converted from flex to CSS grid on desktop for dual-axis label placement

**Added:**
- 3 new Playwright tests for axis label visibility (hidden on mobile, visible on desktop, mobile uses flex layout)

**Files:**
- `styles.css`
- `src/view.ts`
- `tests/fixtures/matrix.html`
- `tests/mobile.spec.ts`

---

## [2026-02-13 16:00] - Fix Version Inconsistencies + README Screenshot Refresh

**Fixed:**
- Synced `package.json` version from 1.0.0 to 1.0.3 to match `manifest.json`
- Updated `scripts/bump-version.mjs` to also bump `package.json` version on auto-bump
- Updated pre-commit hook to stage `package.json` alongside `manifest.json` and `versions.json`

**Added:**
- Populated fixture state in `tests/fixtures/matrix.html` with 10 realistic tasks across all 4 quadrants (for hero screenshot)
- `scripts/capture-readme-screenshots.mjs` — Playwright script that captures 4 retina screenshots (desktop light, desktop dark, desktop overloaded, mobile)
- `npm run screenshots` script

**Changed:**
- Rewrote `README.md` with new hero screenshot, 3 new feature rows (task count badges, undo on delete, overflow scrolling), dark mode / mobile / overflow screenshot sections, updated dev commands
- Deleted stale `screenshots/desktop.png` and `screenshots/iphone.jpeg`

**Files:**
- `package.json`
- `scripts/bump-version.mjs`
- `.git/hooks/pre-commit`
- `tests/fixtures/matrix.html`
- `scripts/capture-readme-screenshots.mjs`
- `README.md`
- `screenshots/desktop-populated.png`
- `screenshots/desktop-dark.png`
- `screenshots/desktop-overloaded.png`
- `screenshots/mobile-populated.png`

---

## [2026-02-14 02:00] - Remove "Add date" toggle, always show date picker

**Changed:**
- Removed the "Add date" toggle button from the add-task form — date picker is now always visible
- Simpler form: title input, date row, and buttons — no hidden state to discover

**Removed:**
- `em-add-date-toggle` CSS class and hover styles
- `resetDateToggle()` helper and toggle click listener in view.ts

**Files:**
- `src/view.ts`
- `styles.css`
- `tests/fixtures/matrix.html`

---

## [2026-02-14 01:30] - Design Overhaul: Minimalist Visual Refresh

**Changed:**
- Reduced quadrant color opacity (body 0.25→0.06, header 0.38→0.15, border 0.35→0.15) for a calmer interface
- Removed quadrant subtitles, title header, and version footer
- Add buttons inherit quadrant color (transparent bg + colored border) instead of purple accent
- Collapsed type scale from 7 sizes to 3: action (0.95em), body (0.85em), meta (0.7em)
- Increased spacing: grid gap 8→12px, header/task/list padding increased
- Drag handles hidden by default, shown on hover; hidden entirely on mobile
- Task card borders removed, form border-top removed
- Date row in add form hidden behind "Add date" toggle for faster quick-capture
- Mobile delete button opacity 0.6→0.3; empty quadrants collapsed to header-only
- Added overflow fade gradient hint on scrollable desktop task lists

**Files:**
- `styles.css`
- `src/view.ts`
- `tests/fixtures/matrix.html`
- `tests/mobile.spec.ts`

---

## [2026-02-14 00:30] - Task Count Badges, Quadrant Overflow Fix, Delete Undo Toast

**Added:**
- Task count badges in quadrant headers — shows count (e.g., "DO 3") when tasks exist, hidden when empty
- Delete undo toast — 5-second Notice with "Undo" link that restores the deleted task
- `restoreTask()` method on plugin for undoing deletions
- Desktop Playwright project and overflow scroll test
- Overloaded-state fixture (8 tasks in Q1) for Playwright testing

**Fixed:**
- Quadrant content clipping on desktop when many tasks — added `min-height: 0` to `.em-quadrant` so CSS grid children can shrink and `.em-task-list` scrolls properly
- Mobile-only Playwright tests now skip on desktop project (added `isMobile` guards)

**Files:**
- `src/view.ts`
- `src/main.ts`
- `styles.css`
- `tests/__mocks__/obsidian.ts`
- `tests/main.test.ts`
- `tests/fixtures/matrix.html`
- `tests/mobile.spec.ts`
- `playwright.config.ts`

---

## [2026-02-13 23:50] - Fix CI peer dependency failures

**Fixed:**
- CI `npm ci` failing due to peer dependency conflicts from `eslint-plugin-obsidianmd` (eslint ^10 vs plugins expecting ^9, typescript 4.7.4 vs >=4.8.4)
- Added `.npmrc` with `legacy-peer-deps=true` so CI resolves deps the same way as local
- Regenerated `package-lock.json` with clean dependency tree

**Files:**
- `.npmrc`
- `package-lock.json`

---

## [2026-02-13 13:00] - Plus Icon, Version Footer, Auto-Bump

**Added:**
- Version number displayed as faint footer text (`v1.0.1`) in the matrix view, read from manifest.json
- Pre-commit hook script (`scripts/bump-version.mjs`) that auto-bumps the patch version when source files are committed

**Fixed:**
- Add button "+" was not centered — replaced text character with Obsidian's `setIcon("plus")` SVG icon
- Added `padding: 0` to add button to remove default browser padding

**Files:**
- `src/view.ts`
- `styles.css`
- `scripts/bump-version.mjs`

---

## [2026-02-13 12:00] - Fix All ObsidianReviewBot Required Issues

**Fixed:**
- Use sentence case for all UI text ("Eisenhower Matrix" → "Eisenhower matrix")
- Mark all unhandled promises with `void` operator (ribbon icon, command, click/submit/drop/touch handlers)
- Command ID no longer includes plugin ID (`open-eisenhower-matrix` → `open-view`)
- Command name no longer includes plugin name (`Open Eisenhower Matrix` → `Open matrix`)
- Removed `onunload()` leaf detach — prevents resetting leaf position on reload
- Replaced deprecated `substr()` with `substring()` in ID generation
- Replaced `innerHTML` with `textContent` for drag handle (☰) and delete button (×)
- Removed `async` from `onOpen`/`onClose` (no `await` expression) — returns `Promise.resolve()` instead
- Made `drop` and `touchend` handlers synchronous, using `void` for fire-and-forget saves
- Moved inline `style.position/pointerEvents/zIndex` on touch clone to CSS class, dynamic props use `setCssStyles()`

**Files:**
- `src/main.ts`
- `src/view.ts`
- `styles.css`

---

## [2026-02-12 14:30] - Make Quadrant Colors Pop

**Changed:**
- Increased quadrant color opacity for more vivid, distinct backgrounds in both light and dark mode
- Body background: 0.08 → 0.25, header background: 0.15 → 0.38, borders: 0.2 → 0.35
- Applied uniformly to all four quadrants (Q1 red, Q2 blue, Q3 orange, Q4 gray)

**Files:**
- `styles.css`

---

## [2026-02-12 13:00] - Improved README

**Changed:**
- Rewrote README with desktop screenshot hero image, feature table, collapsible mobile screenshot, and clearer usage instructions

**Files:**
- `README.md`
- `screenshots/desktop.png`
- `screenshots/iphone.jpeg`

---

## [2026-02-12 12:00] - Community Plugin Release Preparation

**Added:**
- MIT LICENSE file
- GitHub Actions release workflow (`.github/workflows/release.yml`) — creates a draft GitHub Release with `main.js`, `manifest.json`, and `styles.css` on tag push
- Installation section in README.md

**Changed:**
- Added `authorUrl` to `manifest.json`

**Files:**
- `LICENSE`
- `manifest.json`
- `.github/workflows/release.yml`
- `README.md`

---

## [2026-02-09 00:10] - Bottom Padding for Obsidian Nav Bar

**Fixed:**
- Eliminate quadrant (last in stack) was hidden behind Obsidian's bottom navigation icons on mobile
- Added 60px bottom padding to container on mobile so all quadrants are fully accessible when scrolled to bottom

**Files:**
- `styles.css`

---

## [2026-02-08 23:50] - Mobile Compact Layout & Keyboard Scroll Fix

**Fixed:**
- Keyboard opening on iOS hid the input field — form now scrolls into view when input is focused (300ms delay for keyboard animation)
- Redundant "Eisenhower Matrix" title on mobile (Obsidian already shows it in the nav bar) — now hidden on `<600px`
- Tightened mobile spacing: reduced container/header/form padding, smaller grid gap, compact empty states

**Changed:**
- Added `scrollIntoView()` on focus for add form and edit form inputs
- Added `-webkit-overflow-scrolling: touch` for smooth iOS scrolling

**Files:**
- `src/view.ts`
- `styles.css`

---

## [2026-02-08 23:30] - Comprehensive Mobile Layout Fix

**Fixed:**
- Mobile content invisible or clipped when interacting with the matrix
- Root cause: `height: auto` on `.em-container` caused it to grow beyond Obsidian's fixed-height leaf (which has `overflow: hidden`), so content beyond the boundary was clipped with no scroll
- Also: `flex: 1` and `min-height: 0` on `.em-matrix-wrapper`, `.em-grid`, and `.em-task-list` constrained content height instead of letting it flow naturally
- Also: missing `box-sizing: border-box` on container meant padding extended it beyond the leaf

**Mobile layout strategy (new):**
- `.em-container` fills the Obsidian leaf (`height: 100%`, `box-sizing: border-box`) and is the **only** scroll container (`overflow-y: auto`)
- All inner elements (wrapper, grid, task list) use `flex: none; min-height: auto; overflow: visible` — natural content height, no constraints
- Quadrants stack vertically, each sized by its content; container scrolls when total exceeds screen

**Added:**
- 4 new Playwright tests: container fills leaf (not overflows it), inner elements use natural height, container is scrollable when forms are open (32 total)

**Files:**
- `styles.css`
- `tests/mobile.spec.ts`

---

## [2026-02-08 22:45] - Mobile Layout Fix & Playwright Tests

**Fixed:**
- Quadrants collapsing to thin colored bars on mobile — root cause was `overflow: hidden` on `.em-container` and `.em-matrix-wrapper` clipping content in Obsidian's constrained workspace leaf
- On mobile (`<600px`): container now uses `height: auto` + `overflow-y: auto`, wrapper uses `overflow-y: visible`, quadrants have `min-height: 80px`

**Added:**
- Playwright mobile UI tests (24 tests across iPhone SE + iPhone 16 Pro viewports)
- Tests cover: quadrant visibility, header visibility, tap target sizes, overflow behavior, form accessibility in constrained containers
- HTML test fixture reproducing the plugin's DOM structure with Obsidian-like constraints

**Files:**
- `styles.css`
- `playwright.config.ts`
- `tests/mobile.spec.ts`
- `tests/fixtures/matrix.html`
- `package.json`

---

## [2026-02-08 22:20] - Task Editing

**Changed:**
- Added `editTask()` method to plugin for updating task title and due date
- Added inline edit mode — click a task to edit its title and due date in-place
- Save with Enter or Save button, cancel with Escape or Cancel button
- Added 5 new unit tests for editTask logic (38 total)

**Files:**
- `src/main.ts`
- `src/view.ts`
- `styles.css`
- `tests/main.test.ts`

---

## [2026-02-08 22:10] - README, Vault Auto-Sync & Dev Workflow

**Changed:**
- Added README.md with feature overview and dev instructions
- Added post-build vault sync via esbuild plugin — copies main.js, manifest.json, styles.css to vault plugin dirs after every build (data.json is never touched)
- Vault paths stored in `.env.local` (gitignored) to keep personal paths out of the repo

**Files:**
- `README.md`
- `esbuild.config.mjs`
- `.env.local`
- `.gitignore`

---

## [2026-02-08 22:00] - Automated Tests & CI Pipeline

**Changed:**
- Added Jest unit testing framework with ts-jest and manual obsidian mock
- Extracted `formatDueDate()` and `isDueDatePast()` from view class into standalone exported functions for testability
- Created 33 unit tests covering plugin CRUD logic, date utilities, and type constants
- Added GitHub Actions CI workflow that runs tests and build on every push/PR
- Added `npm test` script to package.json

**Files:**
- `jest.config.js`
- `tests/__mocks__/obsidian.ts`
- `tests/main.test.ts`
- `tests/view.test.ts`
- `tests/types.test.ts`
- `src/view.ts`
- `package.json`
- `.github/workflows/ci.yml`

---

## [2026-02-08 20:56] - Initial Plugin Implementation

**Changed:**
- Created Obsidian plugin scaffold (manifest.json, package.json, tsconfig.json, esbuild.config.mjs)
- Implemented data model with Task interface, Quadrant enum, and QuadrantMeta constants
- Built plugin core with view registration, ribbon icon, command palette integration, and task CRUD operations
- Implemented full Eisenhower Matrix view with 2x2 CSS Grid, color-coded quadrants (Do/Schedule/Delegate/Eliminate)
- Added inline task creation with title input and date picker
- Added task deletion
- Implemented HTML5 desktop drag-and-drop between quadrants
- Implemented mobile touch drag-and-drop with 250ms long-press detection and visual clone
- Created responsive CSS with breakpoints at 768px, 600px, and 400px
- Added dark/light theme support using Obsidian CSS variables
- Due dates with relative formatting (Today, Tomorrow, etc.) and overdue highlighting

**Files:**
- `src/types.ts`
- `src/main.ts`
- `src/view.ts`
- `styles.css`
- `manifest.json`
- `package.json`
- `tsconfig.json`
- `esbuild.config.mjs`
- `versions.json`
- `.gitignore`

---

## [2026-02-13 21:37] - Add Playwright design-review screenshot script

**Added:**
- Created `tests/design-screenshots.mjs` to capture design-review screenshots of the matrix fixture
- Captures 6 screenshots: desktop empty, overloaded, overloaded Q1 (element), form-open, mobile empty, mobile overloaded
- Desktop at 1280x720, mobile at iPhone SE (375x667)
- Output directory: `screenshots/design-review/`

**Files:**
- `tests/design-screenshots.mjs`
- `screenshots/design-review/desktop-empty.png`
- `screenshots/design-review/desktop-overloaded.png`
- `screenshots/design-review/desktop-overloaded-q1.png`
- `screenshots/design-review/desktop-form-open.png`
- `screenshots/design-review/mobile-empty.png`
- `screenshots/design-review/mobile-overloaded.png`

---
