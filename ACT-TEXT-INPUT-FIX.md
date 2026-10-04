# Web 0.3.1 — Scene text input fix (2026-10-04)

## Reproduced defects

The scene story textarea ran `storyActsChange('storyText', ...)` on every input event, including intermediate IME composition. This read, decoded, parsed, serialized and recompressed the whole workspace, not just the field. On this workstation's roughly 6.7 MB workspace, five sequential insertions blocked for 1,843–2,086 ms each. A full `renderAll()` also detached the focused textarea, lost the caret and collapsed scene six.

The preceding navigation/editing regression did not exercise continuous text input or Chinese IME composition.

## Changes

- Scene story, scene name and scene content use small, project/scope/act/field-specific recovery drafts. Whitespace, line breaks, punctuation and Unicode are preserved exactly.
- A 900 ms idle debounce merges field edits; whole-workspace compression runs in a dedicated local Web Worker. Existing synchronous writers remain compatible. Cached reads are reused only when native storage bytes still match.
- Async storage performs compare-and-swap after encoding. Local intervening writes are remerged; external-tab conflicts, deleted scenes and same-field changes are rejected without rollback of newer data.
- IME candidate text is not committed mid-composition. Focused scene textareas are not rebuilt by background page rendering. Expanded scenes survive subsequent renders, and guards are scoped to the current project/group.
- Each field has a save button and inline status. Failed saves retain recovery text; a reload can restore the draft. Generation must first save the current source, and failed saves block sending stale source to AI. Global Save/Restart/Exit cannot bypass unresolved drafts.
- Existing stories, screenplay versions, generation records, source media, scene grouping history and pipeline state are not replaced by demo data.

## Evidence and verification

- `act-text-drafts.test.js`: field merges, scoped writes, conflicts/deletions, Unicode, async acknowledgement, local/external races, quota failures, restore locks and cached reads.
- Local isolated browser regression: `.runtime/act-input-browser-check.cjs`; output `test-artifacts/act-input-after.json`.
- Baseline measurement: `test-artifacts/act-input-before.json`.
- Whole-workbench browser regression: `.runtime/workbench-browser-check.cjs`; output `test-artifacts/workbench-browser-check.json`.
- Unit runner uses only explicit `*.test.js` files. Never use unfiltered `node --test`, which can discover legacy live-render scripts.
- Browser tests use a fresh disposable profile and a read snapshot of real projects. Workspace writes are intercepted into a shadow copy; all other non-read requests are blocked, including AI and generation APIs. They record real disk revisions before and after testing. The focused input run kept the revision unchanged. During the later general workbench run, production scene-six story text was independently changing; this is recorded in `act-input-regression-audit.json`, and no old snapshot was restored.

The measured post-fix input event handling was on the order of milliseconds, not seconds. This is a targeted local responsiveness test, not a guarantee of zero latency for all project sizes, all IMEs or future workloads.

## Deployment

Updated static assets are served by the existing 4173 process; a service or GPU restart is not required. Assets have new cache-version parameters. Copy any unfinished text out of an already-open old page before force-refreshing. The top bar shows `Web 0.3.1 · 20261004`.

A source/workspace backup was created under `.runtime/ui-backups/*-act-input/` before applying this change. Runtime profiles, recovery snapshots, test output and private credentials are not committed to Git.
