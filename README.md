# Kirin Komikku Backup Viewer

A GitHub Pages-friendly, client-side viewer for **Komikku** backup files.

## Supported input

- `.tachibk`
- `.proto.gz`
- raw protobuf backups
- decoded `.json`

The loader follows Komikku's backup behavior: it checks for the GZIP magic bytes (`1F 8B`); GZIP data is decompressed first, while non-GZIP data is decoded directly as protobuf.

## Features

- Komikku-only UI (no fork selector)
- Library grid, search and filters
- Categories, including hidden Komikku categories
- Manga information and chapter list
- Reading history / Recently Read
- Sources and statistics
- Komikku saved-search/feed counters
- JSON export
- `.tachibk` export
- Responsive desktop/mobile layout
- Backup processing stays in the browser

## Deploy to GitHub Pages

### Option A — GitHub Actions (included)

1. Create a new GitHub repository.
2. Upload everything in this folder to the repository root.
3. Open **Settings → Pages**.
4. Set **Source** to **GitHub Actions**.
5. Push to `main`. The included workflow deploys the site.

### Option B — Deploy from branch

You can also set **Settings → Pages → Deploy from a branch → main / (root)**. The site does not require a build step.

## Important

`protobufjs` and `long` are loaded from jsDelivr. `pako` is bundled locally. The Komikku protobuf schema is stored at `schemas/schema-komikku.proto`.

## Credits / License

This project is a derivative/adaptation of [Animeboynz/Mihon-Backup-Viewer](https://github.com/Animeboynz/Mihon-Backup-Viewer), with a Komikku-focused interface and loader. The upstream project is GPL-2.0 licensed. See `LICENSE`.
