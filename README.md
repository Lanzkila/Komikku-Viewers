# Kirin Komikku Backup Viewer

A client-side **Komikku backup viewer and analyzer** for inspecting `.tachibk` backups directly in the browser.

> Viewer only — this project does not include a manga reader and does not download manga pages.

## Repository information

| Item | Details |
| --- | --- |
| Project | Kirin Komikku Backup Viewer |
| Repository | `Lanzkila/Komikku-Viewers` |
| Owner | Lanzkila |
| Current build | v1.3.2 Sticky Gap Fix |
| Deployment | GitHub Pages |
| Live site | https://lanzkila.github.io/Komikku-Viewers/ |
| Default branch | `main` |
| App type | Static client-side web application / PWA |
| License | GPL-2.0 |

## What it does

Kirin Komikku Backup Viewer opens Komikku backup files locally in your browser and provides a visual library viewer, statistics, backup diagnostics, tracking information, comparison tools, and export utilities.

The selected backup is decoded inside the browser. The website itself does not need a backend server to inspect the backup.

### Supported input

- Komikku `.tachibk`
- GZIP protobuf / `.proto.gz`
- Raw protobuf backup data
- Decoded `.json`

## Main features

### Dashboard

- Manga, chapter, unread, bookmark, and tracking totals
- Backup health score
- Library snapshot
- Recently read entries
- Backup metadata

### Library viewer

- Grid, compact grid, and list layouts
- Multiple card sizes and page sizes
- Search by title, author, artist, genre, source, and other metadata
- Advanced search syntax
- Quick filters and saved filter presets
- Category, status, reading-progress, and sorting filters
- Smart collections
- Performance mode for large libraries

### Manga information

- Overview and metadata
- Description, genres, categories, source, author, and artist
- Chapter list
- Chapter search and filters
- Chapter sorting
- Upload date and last-read metadata
- Read / unread / bookmark state
- Raw backup entry inspector

### Tracking

Tracker IDs are mapped to the tracker services used by Komikku where known, including:

- MyAnimeList
- AniList
- Kitsu
- Shikimori
- Bangumi
- Komga
- MangaUpdates
- Kavita
- Suwayomi
- MangaDex List

Tracking views can display stored progress, score, status, dates, and tracker URLs when those values exist in the backup.

### Explore

- Categories
- Sources
- Trackers
- Genres
- Authors
- Artists
- Reading activity
- Reading heatmap
- Library growth
- Top manga
- Smart collections

### Analyzer

- Backup health check
- Duplicate detector
- Missing cover / missing chapter checks
- Unknown source detection
- Broken category-reference detection
- Stale manga analysis
- Source health
- Orphan-data checks
- Safe repair preview for supported consistency issues
- Library insights

### Compare backups

Load a second backup locally and compare it against the current backup.

The comparison can show:

- Added manga
- Removed manga
- Changed manga
- New chapters
- Category changes
- Reading-state changes
- Bookmark changes
- Per-manga differences

Comparison data can also be exported as JSON.

### Export and tools

- Export decoded JSON
- Re-encode and export `.tachibk`
- Export library CSV
- Export health report CSV / JSON
- Generate printable backup summary
- Print / Save as PDF through the browser
- Export / import viewer settings
- Clear viewer settings and current session

## Themes

v1.3.x includes seven themes:

1. Kirin Night
2. Cloud Light
3. AMOLED
4. Ocean
5. Sakura
6. Forest
7. Sepia

Theme and viewer preferences are stored locally in the browser.

## Mobile and desktop

The interface is responsive for desktop, laptop, tablet, and phone layouts.

On mobile, primary navigation uses a hamburger menu to avoid overlapping or cramped navigation controls.

## Privacy

Backup processing is designed to stay client-side.

- Selected backup files are decoded in the current browser session.
- The viewer does not require uploading the backup to a custom backend.
- Comparison backups are also processed locally.
- Viewer settings can be stored in browser storage, but exported viewer settings do not contain the loaded backup.
- Privacy Lock can hide the viewer after inactivity when enabled.

Always review your own browser extensions, hosting environment, and network setup if you require a stricter threat model.

## PWA and offline support

The project includes a web app manifest and service worker so supported browsers can install the viewer as a PWA.

After the required app resources have been cached successfully, the viewer can reuse cached assets. Some third-party resources may still require an initial online load before they become available offline.

## Project structure

```text
Komikku-Viewers/
├─ index.html
├─ README.md
├─ LICENSE
├─ manifest.webmanifest
├─ sw.js
├─ .nojekyll
├─ .github/
│  └─ workflows/
│     └─ pages.yml
├─ assets/
│  ├─ css/
│  │  └─ app.css
│  ├─ js/
│  │  └─ app.js
│  ├─ icons/
│  │  └─ app-icon.svg
│  └─ vendor/
│     └─ pako.min.js
└─ schemas/
   └─ schema-komikku.proto
```

## GitHub Pages deployment

The repository is intended to be hosted directly with GitHub Pages.

The included GitHub Actions workflow deploys the repository root when changes are pushed to `main`.

Live build:

**https://lanzkila.github.io/Komikku-Viewers/**

## Development notes

This project is a static application built with HTML, CSS, and JavaScript. Backup decoding uses protobuf and GZIP support in the browser.

There is no required application backend for normal viewer operation.

For very large backups, Performance Mode reduces unnecessary UI work and keeps rendering paginated instead of attempting to display the complete library at once.

## Changelog

See [`CHANGELOG.md`](./CHANGELOG.md) for version history and notable fixes.

## Credits

Kirin Komikku Backup Viewer is based on and inspired by the open-source **Mihon Backup Viewer** project by Animeboynz, with the interface and feature set reworked for this Komikku-focused viewer.

- Mihon Backup Viewer: https://github.com/Animeboynz/Mihon-Backup-Viewer
- Komikku: https://github.com/komikku-app/komikku

Komikku, Mihon, MyAnimeList, AniList, and other named services belong to their respective projects/owners. This repository is not an official Komikku or Mihon project.

## License

This repository retains the **GNU General Public License v2.0 (GPL-2.0)** licensing requirements of the derived implementation. See [`LICENSE`](./LICENSE) for the full license text.
