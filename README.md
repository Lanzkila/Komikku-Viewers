<div align="center">

<img src="assets/icons/app-icon.svg" alt="Kirin Backup Viewer icon" width="96" height="96">

# Kirin Backup Viewer

**Komikku · Mihon · Backup Viewer & Analyzer**

Baca dan analisis backup manga **terus dalam browser** — tanpa menghantar fail backup ke server khas.

*Inspect your Komikku and Mihon manga backups privately in your browser.*

[**🌐 Buka Viewer / Open Viewer**](https://lanzkila.github.io/Komikku-Viewers/) · [**📋 Changelog**](CHANGELOG.md) · [**📄 License**](LICENSE)

[![Stars](https://img.shields.io/github/stars/Lanzkila/Komikku-Viewers?style=flat-square&logo=github&label=Stars)](https://github.com/Lanzkila/Komikku-Viewers/stargazers)
[![Forks](https://img.shields.io/github/forks/Lanzkila/Komikku-Viewers?style=flat-square&logo=github&label=Forks)](https://github.com/Lanzkila/Komikku-Viewers/forks)
[![Release downloads](https://img.shields.io/github/downloads/Lanzkila/Komikku-Viewers/total?style=flat-square&label=Release%20Downloads)](https://github.com/Lanzkila/Komikku-Viewers/releases)
[![License](https://img.shields.io/github/license/Lanzkila/Komikku-Viewers?style=flat-square)](LICENSE)
[![Last commit](https://img.shields.io/github/last-commit/Lanzkila/Komikku-Viewers?style=flat-square)](https://github.com/Lanzkila/Komikku-Viewers/commits/main/)
[![Auto Changelog](https://github.com/Lanzkila/Komikku-Viewers/actions/workflows/auto-changelog.yml/badge.svg?branch=main)](https://github.com/Lanzkila/Komikku-Viewers/actions/workflows/auto-changelog.yml)

</div>

---

## 🇲🇾 Pengenalan

**Kirin Backup Viewer** ialah aplikasi web / PWA untuk membuka dan memeriksa metadata backup **Komikku** atau **Mihon**. Pilih fail backup, lihat perpustakaan manga, semak kemajuan bacaan, analisis kesihatan data, bandingkan dua backup dan eksport laporan.

> **Viewer dan alat analisis sahaja:** bukan manga reader, tidak menyediakan sumber manga, tidak membaca bab secara online dan tidak memuat turun halaman manga.

| Maklumat | Butiran |
| --- | --- |
| **Versi suite terkini** | **v1.6.0 — Reading & Backup Intelligence** |
| **Enjin asas** | v1.5.7 (dikekalkan; suite tambahan) |
| **Input** | `.tachibk`, raw protobuf, `.proto.gz` / GZIP protobuf, JSON yang serasi |
| **Aplikasi backup** | Komikku (default) dan Mihon sahaja |
| **Platform** | Browser desktop/telefon, GitHub Pages, PWA |
| **Kod sumber** | [Lanzkila/Komikku-Viewers](https://github.com/Lanzkila/Komikku-Viewers) |
| **Lesen** | [GPL-2.0](LICENSE) |

## ✨ Ciri utama / Main features

| Bahagian | Fungsi |
| --- | --- |
| **Dashboard** | Statistik manga/bab, belum dibaca, bookmark, tracker, health score dan recently read |
| **Library** | Grid, compact, showcase & list; carian, sort, quick filter, pagination, saved presets & smart collections |
| **Manga details** | Maklumat manga, kategori, genre, source, author/artist, bab, status read/unread/bookmark dan raw metadata |
| **Explore** | Categories, sources, trackers, genres, authors, artists, reading activity, heatmap & library growth |
| **Analyze** | Duplicate, missing cover/bab, source health, stale manga, orphan/invalid references, safe repair preview |
| **Compare** | Bandingkan dua backup: manga ditambah/dibuang/diubah, perubahan bab, kategori, status dan bookmark |
| **Tracking** | Baca data tracker tersimpan termasuk MyAnimeList, AniList, Kitsu, Shikimori, Bangumi dan servis lain jika tersedia |
| **Export** | Decoded JSON, `.tachibk` re-encoding, CSV dan laporan yang boleh dicetak / Save as PDF |
| **Premium Suite** | Command Dashboard, Quick Preview, Command Palette, notifications, Migration Assistant & Library Quality |
| **Reading Intelligence** | Reading Center, chapter analytics, heatmap 52 minggu, timeline, pins, collections dan bulk selection |
| **Backup Intelligence** | Snapshot Vault, Compare 2.0, duplicate resolution, Repair Center 2.0, integrity grade, Undo/reset dan session log |
| **Cover Recovery** | Kesan imej rosak/hilang, URL/image overrides tempatan, import/eksport override dan pembaikan kad Library |
| **Personalization** | Tujuh tema, PWA, UI responsif, focus/presentation mode dan pilihan aksesibiliti |

<details>
<summary><b>Tracker yang dikenali / Recognized trackers</b></summary>

MyAnimeList, AniList, Kitsu, Shikimori, Bangumi, Komga, MangaUpdates, Kavita, Suwayomi dan MangaDex List (bergantung kepada data dalam backup).

</details>

## 🚀 Cara menggunakan / Quick start

1. Buka **[Kirin Backup Viewer](https://lanzkila.github.io/Komikku-Viewers/)**.
2. Pilih **Komikku** atau **Mihon** pada halaman utama.
3. Tekan **Choose file** untuk membuka backup yang serasi; pemprosesan berlaku di browser.
4. Gunakan **Dashboard**, **Library**, **Explore**, **Analyze** dan **Tools** untuk melihat data.
5. Buka menu **☰** pada desktop untuk pintasan Intelligence Suite (◆), Command Palette, Notifications, Appearance, versi dan New backup. Pada HP, gunakan menu navigasi sedia ada.
6. Eksport JSON, CSV, `.tachibk` atau laporan apabila diperlukan. **Simpan salinan backup asal** sebelum mengeksport backup yang diubah.

**Pintasan / Shortcuts:** `Ctrl + K` (Command Palette), `Ctrl + Shift + K` (Reading & Backup Intelligence).

## 🔒 Privasi & keselamatan

- Fail yang dipilih diproses **di browser**, bukannya dimuat naik ke backend projek.
- Dua backup untuk perbandingan juga diproses secara setempat.
- Tetapan, pins, collections, snapshot dan override boleh disimpan dalam storan browser; jangan anggap peranti yang dikongsi sebagai storan rahsia.
- Beberapa library JavaScript dimuat daripada CDN. Akses internet mungkin diperlukan pada lawatan pertama.
- Semak fail eksport yang dijana sebelum digunakan pada aplikasi asal; **jangan bergantung pada viewer sebagai satu-satunya backup**.
- PWA boleh menggunakan aset cache selepas lawatan pertama yang berjaya. Jika UI masih versi lama, reload selepas kemas kini service worker.

## 📁 Struktur projek / Repository structure

```text
Komikku-Viewers/
├── index.html                         # UI utama
├── assets/
│   ├── css/                           # Styles & suite UI
│   ├── js/                            # Viewer, suite & menu
│   ├── icons/                         # PWA icon
│   └── vendor/                        # Local dependencies
├── schemas/                           # Komikku & Mihon protobuf
├── manifest.webmanifest               # PWA manifest
├── sw.js                              # Service worker & cache
├── scripts/update_changelog.py        # Commit history generator
├── .github/workflows/
│   └── auto-changelog.yml             # Auto Changelog action
├── CHANGELOG.md                       # Manual release notes + auto history
├── README.md
└── LICENSE
```

## 📝 Auto Changelog

Setiap push ke branch `main` akan mencetuskan [**Auto Changelog**](.github/workflows/auto-changelog.yml). Workflow menyemak commit baharu serta sejarah **30 hari terkini**, kemudian menulisnya dalam [`CHANGELOG.md`](CHANGELOG.md) dengan:

- **Tarikh dan jam Malaysia (MYT, UTC+8)**
- **Kategori commit** (Added, Fixed, Docs, Refactor dan lain-lain)
- **Pautan terus** ke commit GitHub
- **Pengesanan SHA** agar entri yang sama tidak digandakan

Nota release asal dikekalkan di bawah sejarah automatik. Rekod lama tidak dipadam; 30 hari ialah *tempoh semakan balik* untuk mengisi commit yang terlepas. Bot menggunakan commit `[skip ci]` supaya tidak mencetuskan workflow berulang.

Workflow juga boleh dijalankan manual melalui **Actions → Auto Changelog → Run workflow** (pilih tempoh sejarah untuk diisi).

> Badge **Release Downloads** hanya mengira fail yang dimuat turun melalui *GitHub Releases*, bukan lawatan GitHub Pages atau jumlah pemasangan PWA. Jika repo belum mempunyai release, kiraan mungkin kosong/0.

## 🧹 Auto Library Cleanup

Apabila backup terbaru dimuatkan, viewer akan **menyembunyikan rekod dengan `favorite=false`** (bukan Library aktif) secara automatik. Data sejarah yang disimpan oleh Komikku/Mihon tidak lagi dipaparkan sebagai manga dalam Dashboard, Library, Analyze, Compare dan Intelligence Suite. **Fail backup asal tidak diubah.** Eksport baharu daripada viewer mungkin mengecualikan rekod tersebut, jadi simpan backup asal untuk memelihara sejarah. Perubahan dalam aplikasi hanya boleh dikesan selepas membuka backup baharu; GitHub Pages tidak bersambung langsung kepada data aplikasi.

## 🇬🇧 English overview

Kirin Backup Viewer is a **client-side Komikku & Mihon backup metadata viewer and analyzer**. Open supported `.tachibk`, protobuf/GZIP or decoded JSON backups; inspect manga, chapters, trackers and history; compare backups, run diagnostics, recover cover overrides and export reports. It is **not** a manga reader or chapter downloader.

The current feature suite is **v1.6.0**, layered over the **v1.5.7** base. Your selected backup remains in your browser rather than being uploaded to an application backend. Always retain your original backup. The [automatic changelog](CHANGELOG.md) records commits in Malaysia time, separately from manually written version notes.

## 🙏 Credits & attribution

This project is based on and inspired by the open-source **[Mihon Backup Viewer](https://github.com/Animeboynz/Mihon-Backup-Viewer)** project by **Animeboynz**, with its UI and features adapted for a Komikku/Mihon-focused viewer.

- [Komikku](https://github.com/komikku-app/komikku)
- [Mihon Backup Viewer — original inspiration](https://github.com/Animeboynz/Mihon-Backup-Viewer)

Komikku, Mihon, tracking providers and related names belong to their respective owners. **This is an unofficial community project.**

## 📜 License

Released under **[GNU General Public License v2.0 (GPL-2.0)](LICENSE)**. Retain applicable notices and license requirements for derived code.

<div align="center"><sub>Kirin Backup Viewer · <a href="https://github.com/Lanzkila/Komikku-Viewers">Lanzkila/Komikku-Viewers</a></sub></div>
