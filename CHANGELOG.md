# Changelog

All notable changes to **Kirin Komikku Backup Viewer** are documented here.

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
