# CST Notes changelog

## 0.1.5

### Initialization
- Fixed setup failing in new, empty vaults with “Graph rebuild paused: the surgeon registry is missing.” New installations no longer require an existing surgeon or case, and successful initialization prevents setup from reopening whenever CST Notes navigation opens.

## 0.1.4

### Public-release preparation
- Reset distributable state to the built-in specialty folders with zero surgeon records and zero case notes.
- Removed copied personal vault content, migration sessions, backups, diagnostics, old release archives, and local workspace state from the public-release copy.
- Preserved the reusable Specialty → Surgeon → Case architecture, templates, registries, graph definitions, migration framework, mobile support, and commands.
- Updated runtime and manifest metadata to strict semantic version `0.1.4`.
## 0.1.3.4

### iOS, iPadOS, macOS, and Windows experience
- Keeps sidebar search input/keyboard state stable, reconciles stale specialty/surgeon routes after Admin renames or moves, and reports rejected navigation instead of leaving unhandled UI promises.
- Quarantines path/frontmatter identity mismatches as Pending Review. Mismatched cases remain openable but are not counted or presented under the wrong surgeon.
- Disables profile and new-case actions when the surgeon registry has not synced, while leaving recoverable case removal available and case notes unchanged.
- Adds single-submit behavior to slow mobile modals and protects section import from overwriting destination edits made while its preview is open.
- Scopes managed-title/property styling to each workspace leaf, including pop-out windows, rather than hiding unrelated note chrome globally.

### Case and Admin lifecycle safety
- Case creation now requires the exact existing surgeon folder and registry identity, validates every derived path before I/O, preserves a Sync-winning file byte-for-byte, and reports durable creation separately from graph/log/open follow-up failures.
- Case removal is now a recoverable soft-delete: CST writes and verifies an original-path JSON manifest, exact-moves the note to `Backend/Admin/Backups/Deleted Cases`, rechecks the archive and vacated live path, then removes active note-specific migration state. No automatic path-based trash call can delete a late Sync replacement; users may purge archives manually after Sync settles.
- Surgeon, specialty, reference, template-version, graph, launcher, header-repair, rename/move/merge, and registry operations now use serialized or exact-expected writes with compensation where multi-file work can partially fail.
- External surgeon folders arriving through Sync no longer author placeholder registry records; explicit verified reconcile/repair owns that recovery.
- Registry/session/case writes now require the same expected path, TFile object, and prior bytes at mutation time; prompt-time renames, replacement objects, and late Sync children abort without redirecting writes or cleanup.
- Queued Vault renames that pick up a same-path Sync replacement are detected after the adapter boundary; CST restores the exact replacement to its prior path and aborts without committing backend changes.
- Registry arrival schedules a deferred convergence pass even when it overlaps an internal create/modify suppression token, so skipped folder/case routing is not stranded.
- Stale generated nodes, retired legacy records, and empty surgeon folders are moved to recoverable Admin quarantine paths instead of background recursive trash.
- Case creation pairs template content only with a version snapshot containing the exact same bytes.

### Migration, Undo, and recovery
- Legacy migration modal actions are serialized, stale async renders are ignored, close persistence is guarded, and unresolved-content actions share the same action lock.
- Save/Undo/session remapping use revisioned compare-and-swap behavior. Undo is confined to the exact managed case and exact session backup subtree, requires postimage hashes, and never bootstraps a missing registry.
- v0.1.1/v0.1.2/v0.1.3 migrations stage raw source text, revalidate before retirement, compensate registry deltas on case-write conflicts, and avoid cached-frontmatter decisions during cold Sync.
- Snapshot filenames and roots are bounded for Windows/iOS portability, root ownership is atomic across devices, payloads are compact, and a manifest maps every backup to its original path.

### Verification
- Added a cross-platform backend/state-machine regression harness covering Sync races, missing/invalid registry/session data, compensation, deletion, recovery, path limits, and cold metadata caches.
- Async modal failure paths now contain diagnostic-persistence failures locally, preventing detached/unhandled rejections when storage or Sync is unavailable.
- Added Chromium, Firefox, and WebKit responsive/contrast matrix coverage for iPhone, iPad, Windows, and macOS-sized layouts.

## 0.1.3.1

### Legacy migration fixes
- Added migration-only MD-glove editing with live surgeon-header preview. Glove changes remain in session state until a case successfully commits, then update the surgeon registry; migrated case bodies retain only the live `cst-surgeon-header` marker.
- Reworked Auto-fill to parse legacy headings/sections and place only recognized content into matching current-template sections. Unknown and unheaded content stays unresolved instead of being dumped into Case/Notes.
- Fixed Auto-fill OFF so it restores the exact pre-Auto-fill working destination, including after UI rerenders.
- Source accounting re-checks actual destination content, so deleting previously auto-filled/moved content returns it to unresolved/Needs Review.

### Navigation / repair
- Fixed `Open <Surgeon>` buttons in case headers to navigate directly to the surgeon inside the CST app on desktop and iOS.
- Added a dedicated live-header scan/preview/backup/repair workflow and command.

### Migration recovery / diagnostics
- Added durable migration-completion caching plus ledger reconciliation for v0.1.1, v0.1.2, and v0.1.3.
- Pending migrations can be run/retried safely; successful prerequisites unlock/run the next migration.
- Failed or blocked Admin repairs/migrations now generate a structured ChatGPT-ready diagnostic with plugin version, platform, migration/schema state, validation counts, error/stack summary, safety state, and relevant paths/IDs.
- Diagnostic reports are saved under `Backend/Admin/Logs/Diagnostics/` when possible and can be copied directly from the failure UI.

## 0.1.3

### CST app / iOS
- Search no longer rebuilds the search input on each keystroke; results refresh independently so iOS focus and keyboard should remain stable.
- Specialty → Surgeon navigation now stays inside the CST app and exposes the surgeon's cases directly, with back navigation to the specialty.
- Added a root-level `CST App.md` launcher note with native CST buttons for Open CST App, New Case, and Quick Case.
- Increased desktop Recent/Specialty/Surgeon/Case row thickness and increased mobile touch-row thickness.
- Hides Obsidian's redundant inline title while a CST-managed/backend/launcher note is active; the real Markdown H1 remains the portable title.

### Templates
- Every editable case template under `Backend/_Templates/Cases/` now receives automatic settled-edit version snapshots under `Backend/_Templates/_Versions/`.
- Existing templates are initialized as v1 without changing their content.
- New cases record the current `vN` template version.

### Legacy Template Migration
- Replaced the one-click destructive legacy-template upgrader UI with a resumable visual migration workspace launched from Admin → Migrations.
- Desktop: Legacy Source and New Template working-copy editors side by side, with swap panes.
- iPhone: Legacy/New Template tabs; iPad/desktop can use split layout.
- Auto-fill is a true ON/OFF toggle. OFF restores the destination state from immediately before Auto-fill was enabled.
- Source note is never overwritten while unresolved content, template ambiguity, or an unaccepted template-version change remains.
- Unresolved cases move to a Needs Review queue and cycle back only after ordinary Remaining cases are exhausted.
- Unmapped legacy content appears directly beneath the rendered surgeon header in the destination pane and opens a focused mapping dialog with a suggested destination section.
- Move, choose section, keep custom heading, and explicit Ignore actions are supported.
- Save & Next snapshots the untouched original, writes only a fully resolved destination, records template/version metadata, then advances.
- Working copies, queue state, Spine template choices, migration notes, and progress persist in `Backend/Admin/Data/Legacy Migration Session.md`.
- Added progress bar, status counts, specialty/status filters, jump-to-case, source accounting, section navigation, search in each pane, Compare mode, Send to Needs Review, Skip, and Undo Last Saved Migration.
- Legacy source is not overwritten until a case is safe to migrate.

### Data cleanup
- Case metadata no longer stores duplicate surgeon gloves/gown; live surgeon data remains sourced from the shared surgeon registry.
- v0.1.3 setup repairs the launcher, initializes template history, removes legacy duplicated case glove/gown properties, and preserves case bodies.

## 0.1.2
- Mobile CST app view and Markdown-backed surgeon registry.
- Live surgeon headers and mobile repair migration.

## 0.1.1
- Live surgeon header migration and graph duplicate-node cleanup.

## 0.1.0
- Initial private CST Notes plugin build.

## 0.1.3.2

- Restores the missing specialty/surgeon graph path helpers that blocked the v0.1.2 migration.
- Adds migration preflight checks before backend writes and improved snapshot reporting in ChatGPT diagnostics.
- Makes downstream migration status respect prerequisite state and revalidates v0.1.3 after v0.1.2 is repaired.
- Reworks legacy parsing so only the legacy `MD:` glove line feeds the surgeon-glove working value; PA lines remain opaque user-controlled legacy content.
- Recognizes legacy bold section labels such as `**Tips**:` and maps known sections intelligently instead of dumping the full source note.
- Makes Auto-fill ON/OFF a deterministic reversible working-copy toggle.
- Expands the Legacy Template Migration workspace, removes section-jump buttons, integrates a larger Unmapped Content reviewer, and keeps an optional pop-out reviewer.
- Makes Save & Next visibly process, diagnose errors, reconcile the persisted queue, and always advance or defer to Needs Review.
- Refreshes migration progress/counts from persisted session state after state transitions.
- Adds GUI-only legacy MD glove conflict resolution; migrated case bodies continue to contain only the live surgeon header renderer.
- Handles deletion of exact `CST Notes/Specialties/<specialty>/<surgeon>/<case>.md` cases by removing active note-specific migration/backend session state and rebuilding generated graph infrastructure while retaining surgeon records and backups.
- Removes the “is my CST data safe?” question from exported ChatGPT diagnostics while preserving factual safety-state evidence.
