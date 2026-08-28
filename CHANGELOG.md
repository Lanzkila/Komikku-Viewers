# Changelog

All notable changes to **Kirin Backup Viewer** are documented here.

## [1.5.0] - 2026-08-28

### Premium Suite
- Added Premium Command Dashboard with animated stats, smart status banner, Command Center, mini charts and Backup Vault.
- Added draggable and pinnable Dashboard widgets with saved layout.
- Added Library Quality Score, Tracker Coverage, Source Reliability, Reading Persona, Milestones and Top Lists.
- Added Quick Preview drawer via three-dot button or right-click and upgraded manga details with cover ambience and progress.
- Added Ctrl+K Command Palette with universal manga/source/category/command search.
- Added Notification Center and health recommendations.
- Added Showcase library layout, Focus Mode and Presentation Mode.
- Added accent-color customization, solid/glass surfaces and optional ambient background.
- Added progressive backup loading overlay and stage progress.
- Added Migration Assistant with CSV report and Year in Review.
- Added comparison timeline and stronger before/after highlighting.
- Added Premium HTML Report and Share-safe HTML Report.
- Added What’s New, About, update badge and keyboard-shortcut overlay.
- Added accessibility profiles: Larger Text, High Contrast and Reduced Motion.
- Added optional privacy blur when the browser tab becomes hidden.
- Added PWA install banner and offline-ready status.
- Updated footer to v1.5.0 Premium Suite.

## [1.4.0] - 2026-08-27

### Added
- Added a simple two-option backup selector on Home: **Komikku** and **Mihon** only.
- Added Mihon protobuf schema support via `schemas/schema-mihon.proto`.
- Added Home Quick Start, Supported Backup, Feature Snapshot, and Project/Changelog cards.
- Added dynamic footer year using the visitor's browser date.

### Changed
- Default backup app remains Komikku.
- Home and PWA naming are now generic `Kirin Backup Viewer` because both Komikku and Mihon are supported.
- Exported JSON and `.tachibk` filenames follow the selected/loaded backup app.
- Service-worker cache updated to `kirin-backup-v140`.

## [1.3.3] - 2026-08-27

### Fixed
- Fixed the actual source of the thin blue strips above the Library filter controls.
- The strips were the `View`, `Card`, and `Per page` controls scrolling underneath the sticky filter layer and peeking through its top edge.
- Removed sticky positioning from the Library filter row on desktop, tablet, and mobile so the two control rows can no longer overlap.
- Removed the unnecessary compositing transform from the Library filter row.

### Changed
- The main application header remains sticky.
- Library filters now scroll normally with the Library page.
- Service-worker cache updated to `kirin-komikku-v133`.

## [1.3.2] - 2026-08-27

### Fixed
- Fixed the remaining thin blue/card strip visible between the sticky header and library filters.
- Corrected the desktop/tablet sticky filter offset from `94px` to the actual `82px` header height.
- Added an opaque edge to the sticky filter layer so library cards cannot bleed through at the boundary.

### Changed
- Service-worker cache updated to `kirin-komikku-v132` so the corrected CSS is fetched after deployment.

## [1.3.1] - 2026-08-27

### Fixed
- Fixed blue/empty strip artifacts appearing above the library filters on desktop and some mobile Chrome/WebView builds.
- Removed `content-visibility` from paginated manga cards in Performance Mode because it could cause GPU paint artifacts around sticky UI.
- Made the sticky header and library filter layers opaque and isolated to prevent content bleeding through them.
- Improved service-worker update behavior so newly deployed CSS/JS/app-shell files are fetched before falling back to the offline cache.

### Changed
- Performance Mode still removes unnecessary transitions, but library cards now render normally because the library is already paginated.
- Service-worker cache updated to `kirin-komikku-v131`.

## [1.3.0] - 2026-08-27

### Added
- Seven themes: Kirin Night, Cloud Light, AMOLED, Ocean, Sakura, Forest, and Sepia.
- Tracker name mapping for MyAnimeList, AniList, Kitsu, Shikimori, Bangumi, Komga, MangaUpdates, Kavita, Suwayomi, and MangaDex List.
- Detailed tracking cards with progress, score, status, dates, and tracker URLs when available.
- Chapter search, read/bookmark filters, sorting, upload dates, and last-read metadata.
- Genre, author, artist, smart-collection, top-manga, library-growth, and reading-heatmap explorers.
- Stale manga, source-health, orphan-data, and safe-repair analysis.
- Per-manga comparison details when comparing two backups.
- Saved search/filter presets.
- Library CSV and health CSV/JSON exports.
- Backup metadata panel.
- Performance Mode for large libraries.
- Privacy Lock with optional inactivity timeout.
- Viewer-settings export/import.
- Desktop keyboard shortcuts.
- PWA manifest, install support, and offline app-shell caching.

### Kept
- Dashboard, Library, Explore, Analyze, and Tools views.
- Komikku `.tachibk`, GZIP/raw protobuf, and JSON decoding.
- JSON and `.tachibk` export.
- Health check, duplicate detector, insights, and two-backup comparison.
- Mobile hamburger navigation.
- Viewer-only scope; no manga reader.

## [1.2.2] - 2026-08-27

### Added
- Restored richer chapter metadata inspired by the original backup viewer.
- Upload-date indicator for chapters.
- Last-read metadata when history exists.
- Improved scanlator, last-page, read/unread, and bookmark presentation.

## [1.2.1] - 2026-08-27

### Changed
- Replaced mobile bottom navigation with a hamburger menu.
- Desktop navigation remains horizontal.
- Mobile menu closes after navigation, outside click, or Escape.

### Fixed
- Removed mobile navigation overlap/blue-edge artifacts caused by the previous fixed bottom navigation layout.

## [1.2.0] - 2026-08-27

### Added
- Advanced dashboard and backup analyzer.
- Backup Health Check.
- Duplicate Detector.
- Advanced library search syntax and quick filters.
- Category, source, tracker, and reading-activity explorers.
- Library Insights.
- Compare two backups with added/removed/changed detection.
- Diff JSON export.
- Manga Info tabs: Overview, Chapters, Tracking, and Raw.
- Grid, Compact, and List library modes.
- Card-size and page-size preferences.
- Summary report and browser Print/Save as PDF.
- Saved viewer preferences.

## [1.1.1] - 2026-08-27

### Changed
- Removed the experimental local Manga Reader completely.
- Returned the project to a viewer-only scope.

### Kept
- Mobile navigation fixes and theme-button positioning improvements.

## [1.1.0] - 2026-08-27

### Added
- Mobile UI fixes for navigation and theme control.
- Experimental local reader support.

> The reader was removed again in v1.1.1.

## [1.0.0] - 2026-08-27

### Added
- Initial GitHub Pages build focused on Komikku backups.
- Komikku protobuf schema loading.
- GZIP and raw protobuf backup decoding.
- Library viewer, search, filters, Manga Info, chapters, statistics, and backup tools.
- JSON and `.tachibk` export.
- Client-side processing with no custom backend required.
