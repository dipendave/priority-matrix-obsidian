# Worklog

Track of development iterations and time estimates.

| Timestamp | Est. Duration | Description |
|-----------|---------------|-------------|
| 2026-02-08 20:56 | ~30min | Initial plugin implementation — scaffold, data model, plugin core, matrix view with add/delete/drag-drop, responsive CSS |
| 2026-02-08 22:00 | ~15min | Added Jest test suite (33 tests), obsidian mock, CI workflow, extracted view utilities for testability |
| 2026-02-08 22:10 | ~5min | Added README, post-build vault sync (esbuild plugin + .env.local), gitignored personal vault paths |
| 2026-02-08 22:20 | ~5min | Added task editing — editTask() method, inline edit UI on click, edit form styles, 5 new tests |
| 2026-02-08 22:45 | ~15min | Fixed mobile collapsed quadrants — Playwright tests (24), HTML fixture, CSS overflow fix |
| 2026-02-08 23:30 | ~15min | Comprehensive mobile layout fix — single scroll container strategy, box-sizing fix, removed flex constraints on inner elements, 32 Playwright tests |
| 2026-02-08 23:50 | ~10min | Mobile compact layout + keyboard scroll fix — hide redundant title, tighter spacing, scrollIntoView on input focus |
| 2026-02-09 00:10 | ~2min | Added 60px bottom padding on mobile to clear Obsidian's bottom nav bar |
| 2026-02-12 12:00 | ~5min | Community plugin release prep — LICENSE, authorUrl, release workflow, Installation section in README |
| 2026-02-12 13:00 | ~5min | Improved README — hero screenshot, feature table, collapsible mobile screenshot, clearer usage section |
| 2026-02-12 14:30 | ~2min | Increased quadrant color opacity for vivid backgrounds (body 0.25, header 0.38, border 0.35) |
| 2026-02-13 12:00 | ~15min | Fixed all 13 ObsidianReviewBot required issues (sentence case, promises, command ID/name, onunload, substr, innerHTML, async, inline styles) |
| 2026-02-13 13:00 | ~10min | Centered add button (setIcon SVG), version footer, auto-bump pre-commit hook |
| 2026-02-13 23:50 | ~5min | Fixed CI failures — added .npmrc with legacy-peer-deps, regenerated package-lock.json |
| 2026-02-14 00:30 | ~30min | Task count badges, quadrant overflow fix (min-height:0), delete undo toast with Notice, restoreTask(), 3 new unit tests, 1 Playwright test, desktop project in config |
| 2026-02-13 21:37 | ~10min | Added Playwright design-review screenshot script (6 screenshots: desktop/mobile, empty/overloaded/form-open states) |
| 2026-02-14 01:30 | ~30min | Design overhaul — reduced color opacity, removed subtitles/title/footer, quadrant-colored buttons, 3-size type scale, hidden drag handles, collapsed mobile empties, date toggle, overflow fade hint |
| 2026-02-14 02:00 | ~5min | Removed "Add date" toggle — date picker always visible in add-task form |
| 2026-02-13 16:00 | ~15min | Fixed version inconsistencies (package.json 1.0.3, bump script, pre-commit), added populated fixture, Playwright screenshot script, rewrote README with new screenshots |
| 2026-02-15 12:00 | ~15min | Design evaluation improvements — vertical importance axis label, task edit/drag hover hints, dark Q3 orange fix, taller overflow fade, actionable empty state text, 3 new Playwright tests |
| 2026-02-16 14:00 | ~30min | Follow-up design review — captured 7 fresh screenshots via Playwright, evaluated all fixes from initial review, documented 7 remaining polish issues, updated DESIGN_REVIEW.md with before/after comparison |
| 2026-02-17 12:00 | ~15min | Design polish — ghost submit button with quadrant color, per-quadrant overflow fade gradient, dark mode Q3 tuned to 0.08, vertically centered empty state text |
| 2026-02-17 15:30 | ~15min | Design evaluation polish (5 items) — conditional overflow fade, inverted button weight, edit discoverability text, mobile drag onboarding notice, new task highlight animation |
| 2026-02-17 16:30 | ~15min | Design eval refinements — stronger overflow fade (0.15), dark mode highlight, SVG delete icon, edit hover affordance, refreshed README + screenshots |
| 2026-02-17 17:00 | ~10min | Added 24 community plugin compliance tests — guards against ObsidianReviewBot regressions (innerHTML, inline styles, substr, async/await, promises, commands, sentence case) |
| 2026-03-02 20:00 | ~5min | Added onExternalSettingsChange() hook for Obsidian Sync support — reloads data and re-renders view when data.json is updated externally |
| 2026-03-02 20:15 | ~5min | Added 5 unit tests for onExternalSettingsChange() to guard against sync regression |
| 2026-03-02 21:00 | ~30min | Added 93 view integration tests covering all core UI flows (add, edit, delete, undo, drag, rendering, persistence, validation, accessibility) with enhanced obsidian DOM mock |
| 2026-03-22 12:00 | ~30min | Task completion feature — checkbox on tasks, collapsible completed bin with quadrant dots and relative time, revive/delete from bin, 42 new tests (TDD), 205 total |
| 2026-03-22 13:00 | ~15min | Design eval polish — completion undo notice, green checkbox color, stronger border contrast, auto-expand on first completion, fixture updated with checkboxes + completed section, 3 new tests |
| 2026-03-22 14:00 | ~5min | Auto-release pipeline — post-commit hook tags and pushes on every commit, minor version bumps every 10 patches |
