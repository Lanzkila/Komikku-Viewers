# Changelog

## Recent commits (automatic)

<!-- AUTO-CHANGELOG:START -->
### 2026-10-08 (MYT)
- **09:28** · **Fixed** — fix(pages): force new core library-filter script on load ([`ff91e31`](https://github.com/Lanzkila/Komikku-Viewers/commit/ff91e31cf031d2fb84f69a209805ddfe0c95672a)) <!-- commit:ff91e31cf031d2fb84f69a209805ddfe0c95672a -->
- **09:27** · **Fixed** — fix(viewer): display history-only exclusion count and refresh SW registration ([`7ad4ace`](https://github.com/Lanzkila/Komikku-Viewers/commit/7ad4ace9c160941ea2d9e3ffef8f42a059b88e3c)) <!-- commit:7ad4ace9c160941ea2d9e3ffef8f42a059b88e3c -->
- **09:27** · **Docs** — docs(changelog): auto-update commit history \[skip ci\] ([`6e5d86c`](https://github.com/Lanzkila/Komikku-Viewers/commit/6e5d86c8aee632dddcdc7b0c853d99b4b599f28c)) <!-- commit:6e5d86c8aee632dddcdc7b0c853d99b4b599f28c -->
- **09:22** · **Fixed** — fix(viewer): automatically exclude non-library Komikku backup entries ([`4f7582e`](https://github.com/Lanzkila/Komikku-Viewers/commit/4f7582e4da44e26e1ed9a590fd7c0b36ed98c2ba)) <!-- commit:4f7582e4da44e26e1ed9a590fd7c0b36ed98c2ba -->
- **09:22** · **Docs** — docs(changelog): auto-update commit history \[skip ci\] ([`03892c1`](https://github.com/Lanzkila/Komikku-Viewers/commit/03892c1c6d84f1e6884960744fe30e33ebfa528c)) <!-- commit:03892c1c6d84f1e6884960744fe30e33ebfa528c -->
- **09:05** · **Docs** — docs(changelog): auto-update commit history \[skip ci\] ([`0d68917`](https://github.com/Lanzkila/Komikku-Viewers/commit/0d689170d45a7b285f68706cfb3daf57b1bdaef7)) <!-- commit:0d689170d45a7b285f68706cfb3daf57b1bdaef7 -->
- **09:04** · **Maintenance** — chore(changelog): add idempotent MYT commit history generator ([`ccfa8d3`](https://github.com/Lanzkila/Komikku-Viewers/commit/ccfa8d3060f1bc6a538b3d7912dfc58970e59a79)) <!-- commit:ccfa8d3060f1bc6a538b3d7912dfc58970e59a79 -->
- **09:04** · **Docs** — docs: refresh Komikku Viewer README with v1.6 guide, credits and changelog ([`5b7098f`](https://github.com/Lanzkila/Komikku-Viewers/commit/5b7098f2055287c2844ad70b196e250738d8b567)) <!-- commit:5b7098f2055287c2844ad70b196e250738d8b567 -->
- **09:04** · **CI** — ci: run auto changelog on main pushes ([`291c080`](https://github.com/Lanzkila/Komikku-Viewers/commit/291c080efb087116a65fddea8281a5e9a7b27d85)) <!-- commit:291c080efb087116a65fddea8281a5e9a7b27d85 -->
- **09:01** · **Fixed** — fix(pwa): invalidate cache for corrected desktop actions menu ([`d99251f`](https://github.com/Lanzkila/Komikku-Viewers/commit/d99251fb32b8250f813944ef47e36e455b5204dc)) <!-- commit:d99251fb32b8250f813944ef47e36e455b5204dc -->
- **09:01** · **Fixed** — fix(ui): move actual desktop header controls into hamburger, not nav duplicates ([`cd6dbe3`](https://github.com/Lanzkila/Komikku-Viewers/commit/cd6dbe3d34b9089accff0e8b41565f468fef03b8)) <!-- commit:cd6dbe3d34b9089accff0e8b41565f468fef03b8 -->
- **09:01** · **Style** — style(ui): display real header action buttons as desktop hamburger rows ([`4432027`](https://github.com/Lanzkila/Komikku-Viewers/commit/4432027e6598dfa3dbe4c5e4839853ac7f4d1eea)) <!-- commit:4432027e6598dfa3dbe4c5e4839853ac7f4d1eea -->
- **09:01** · **Fixed** — fix(ui): replace desktop hamburger nav duplicates with real header controls ([`2b5138f`](https://github.com/Lanzkila/Komikku-Viewers/commit/2b5138fd89b4b512d8de8e1354ed96ae2e1345a0)) <!-- commit:2b5138fd89b4b512d8de8e1354ed96ae2e1345a0 -->
- **08:58** · **Added** — feat(ui): add accessible desktop hamburger quick menu behavior ([`aba488d`](https://github.com/Lanzkila/Komikku-Viewers/commit/aba488da768f36095805c99701707a69f5f0e43c)) <!-- commit:aba488da768f36095805c99701707a69f5f0e43c -->
- **08:58** · **Style** — style: align desktop hamburger and responsive quick menu ([`8dec954`](https://github.com/Lanzkila/Komikku-Viewers/commit/8dec9547017f296f7bd20a0fde78f631bf636a61)) <!-- commit:8dec9547017f296f7bd20a0fde78f631bf636a61 -->
- **08:58** · **Added** — feat(ui): place desktop hamburger immediately after Tools ([`7ee73b1`](https://github.com/Lanzkila/Komikku-Viewers/commit/7ee73b19b8e294c8766a1900dceb19d49189f7f0)) <!-- commit:7ee73b19b8e294c8766a1900dceb19d49189f7f0 -->
- **08:58** · **Fixed** — fix(pwa): refresh cached assets for desktop header hamburger ([`62636e4`](https://github.com/Lanzkila/Komikku-Viewers/commit/62636e496f87afff0fc09f1286db76c7c37d1a0c)) <!-- commit:62636e496f87afff0fc09f1286db76c7c37d1a0c -->
<!-- AUTO-CHANGELOG:END -->


## [1.6.0] - 2026-09-05

### Added
- Reading & Backup Intelligence suite opened from the new diamond button (`Ctrl+Shift+K`).
- Reading Center, chapter analytics, 52-week heatmap, smart collections and manga timeline.
- Bulk selection, local pins, local collections, selected JSON/CSV export and in-memory delete.
- Category Manager, Tracker Center 2.0, Sources/Feeds/Settings inspector and migration report.
- Snapshot Vault, Compare 2.0, Duplicate Resolution Assistant, Repair Center 2.0, integrity grade, Undo/reset and session log.
- Quick Preview and keyboard library navigation.
- Thumbnail Recovery Center with broken/missing cover scan, local URL/image overrides, override import/export and automatic Library card repair.
- WestManga-aware cover diagnostics; missing source-side URLs are not fabricated.

### Changed
- Suite typography enlarged for easier reading on desktop and phone.
- PWA cache updated to `kirin-backup-v160`.
- v1.5.7 core viewer remains the stable base and is not rewritten by this release.

### Previous
- v1.5.7: modal close-X alignment fix.
- v1.5.x: Premium Suite, notifications, delete controls, feed/category fixes.
- v1.4.0: Komikku + Mihon selector.
- v1.3.x: themes, trackers, analyzers, PWA, responsive UI.
- v1.0–1.2: initial viewer, library/analyzer foundation and viewer-only scope.
