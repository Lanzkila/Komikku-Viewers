(() => {
  'use strict';

  const SETTINGS_KEY = 'kirin-backup-viewer-settings-v15';
  const defaultSettings = {
    theme: 'night',
    sort: 'title',
    status: 'all',
    read: 'all',
    viewMode: 'grid',
    cardSize: 'medium',
    pageSize: 30,
    performanceMode: 'auto',
    autoLock: 0,
    presets: [],
    lastView: 'dashboard',
    backupFlavor: 'komikku',
    accentColor: '',
    surfaceStyle: 'solid',
    ambient: 'off',
    largeText: false,
    highContrast: false,
    reducedMotion: false,
    blurOnHidden: false,
    pinnedWidgets: ['health','snapshot','recent','vault','charts','quality','tracking','sources','persona','milestones','toplists'],
    widgetOrder: ['health','snapshot','recent','vault','charts','quality','tracking','sources','persona','milestones','toplists'],
    seenVersion: '',
  };

  const state = {
    data: null,
    fileName: '',
    sourceMap: new Map(),
    categoryMap: new Map(),
    categoryIdMap: new Map(),
    filtered: [],
    page: 1,
    pageSize: 30,
    debug: [],
    schemaCache: new Map(),
    loadedFlavor: null,
    quickFilter: '',
    exploreTab: 'categories',
    analysisTab: 'health',
    modalMangaIndex: null,
    compareData: null,
    compareFileName: '',
    diff: null,
    cache: { health: null, duplicates: null, activity: null, searchIndex: null },
    settings: loadSettings(),
    primaryMeta: null,
    repairPlan: null,
    installPrompt: null,
    lockTimer: null,
    chapterUi: { search: '', filter: 'all', sort: 'number-desc' },
    notifications: [],
    notificationUnread: 0,
    notificationSignature: '',
    notificationSeenSignature: '',
    dismissedNotifications: new Set(),
    seenNotificationKeys: new Set(),
    commandIndex: 0,
    commandResults: [],
    previewMangaIndex: null,
    dragWidget: null,
  };

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (v = '') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const asArray = v => Array.isArray(v) ? v : [];
  const asNum = v => Number(v || 0);
  const key64 = v => v == null ? '' : String(v);
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const normalizeText = v => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');

  const statusNames = {0:'Unknown',1:'Ongoing',2:'Completed',3:'Licensed',4:'Publishing finished',5:'Cancelled',6:'On hiatus'};
  const statusLookup = Object.fromEntries(Object.entries(statusNames).map(([k,v]) => [v.toLowerCase(), Number(k)]));

  const TRACKERS = {
    1:{name:'MyAnimeList',mark:'MAL'}, 2:{name:'AniList',mark:'AL'}, 3:{name:'Kitsu',mark:'K'},
    4:{name:'Shikimori',mark:'SH'}, 5:{name:'Bangumi',mark:'BG'}, 6:{name:'Komga',mark:'KG'},
    7:{name:'MangaUpdates',mark:'MU'}, 8:{name:'Kavita',mark:'KV'}, 9:{name:'Suwayomi',mark:'SW'},
    60:{name:'MangaDex List',mark:'MD'},
  };
  const THEMES = {
    night:{name:'Kirin Night',meta:'#0b0d12'}, light:{name:'Cloud Light',meta:'#f5f7fb'}, amoled:{name:'AMOLED',meta:'#000000'},
    ocean:{name:'Ocean',meta:'#07131d'}, sakura:{name:'Sakura',meta:'#180e17'}, forest:{name:'Forest',meta:'#08140f'}, sepia:{name:'Sepia',meta:'#f1e6cf'},
  };
  const BACKUP_APPS = {
    komikku:{name:'Komikku',schema:'schema-komikku.proto',exportBase:'komikku-backup'},
    mihon:{name:'Mihon',schema:'schema-mihon.proto',exportBase:'mihon-backup'},
  };
  const DAY = 86400000;
  const VERSION = '1.5.5';
  const DASHBOARD_WIDGETS = {health:'Backup health',snapshot:'Library snapshot',recent:'Recently read',vault:'Backup Vault',charts:'Activity trends',quality:'Library Quality',tracking:'Tracker Coverage',sources:'Source Reliability',persona:'Reading Persona',milestones:'Milestones',toplists:'Top Lists'};
  const CHANGELOG_SUMMARY = [
    'Notification drawer no longer covers the desktop header',
    'Notification red badge is marked read as soon as Status Center is opened',
    'Clear notifications one-by-one or clear all',
    'Delete a manga from Quick Preview or full Manga Details',
    'Delete current filtered results or all manga from Tools → Danger Zone',
    'All manga deletion stays in memory until a new backup is exported',
    'Dashboard Milestones gap fix from v1.5.1 is retained'
  ];

  function loadSettings() {
    try {
      const current = localStorage.getItem(SETTINGS_KEY);
      const legacy = localStorage.getItem('kirin-komikku-viewer-settings-v13') || localStorage.getItem('kirin-komikku-viewer-settings-v12');
      const raw = JSON.parse(current || legacy || '{}');
      if (raw.theme === 'dark') raw.theme = 'night';
      return { ...defaultSettings, ...raw, presets: Array.isArray(raw.presets) ? raw.presets : [] };
    } catch {
      return { ...defaultSettings, presets: [] };
    }
  }

  function saveSettings(patch = {}) {
    state.settings = { ...state.settings, ...patch };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  }

  function log(message) {
    const line = `${new Date().toLocaleTimeString()}  ${message}`;
    state.debug.push(line);
    if (state.debug.length > 100) state.debug.shift();
    const out = $('#debug-output');
    if (out) out.textContent = state.debug.join('\n');
  }

  function diag(message, error = false) {
    const el = $('#diagnostic');
    if (el) {
      el.textContent = message;
      el.classList.toggle('error', !!error);
    }
    log(message);
  }

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  function updateThemeUi() {
    const theme = state.settings.theme in THEMES ? state.settings.theme : 'night';
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('light', ['light','sepia'].includes(theme));
    const btn = $('#theme-toggle');
    if (btn) {
      btn.textContent = '◐';
      btn.title = `Theme · ${THEMES[theme].name}`;
      btn.setAttribute('aria-label', `Choose theme. Current ${THEMES[theme].name}`);
    }
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = THEMES[theme].meta;
    $$('#theme-grid [data-theme-choice]').forEach(b => b.classList.toggle('active', b.dataset.themeChoice === theme));
  }

  function applySavedSettings() {
    if (!(state.settings.theme in THEMES)) state.settings.theme = state.settings.theme === 'light' ? 'light' : 'night';
    updateThemeUi();
    state.pageSize = Number(state.settings.pageSize) || 30;
    if ($('#sort-select')) $('#sort-select').value = state.settings.sort || 'title';
    if ($('#status-filter')) $('#status-filter').value = state.settings.status || 'all';
    if ($('#read-filter')) $('#read-filter').value = state.settings.read || 'all';
    if ($('#view-mode-select')) $('#view-mode-select').value = state.settings.viewMode || 'grid';
    if ($('#card-size-select')) $('#card-size-select').value = state.settings.cardSize || 'medium';
    if ($('#page-size-select')) $('#page-size-select').value = String(state.pageSize);
    if ($('#performance-mode-select')) $('#performance-mode-select').value = state.settings.performanceMode || 'auto';
    if ($('#auto-lock-select')) $('#auto-lock-select').value = String(state.settings.autoLock || 0);
    applyPremiumSettings();
    applyPerformanceMode();
    renderSearchPresets();
    armAutoLock();
  }

  function selectedFlavor() {
    const flavor = state.loadedFlavor || state.settings.backupFlavor || 'komikku';
    return flavor in BACKUP_APPS ? flavor : 'komikku';
  }

  function updateBackupFlavorUi() {
    const flavor = state.settings.backupFlavor in BACKUP_APPS ? state.settings.backupFlavor : 'komikku';
    const info = BACKUP_APPS[flavor];
    $$('[data-backup-flavor]').forEach(btn => {
      const active = btn.dataset.backupFlavor === flavor;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-checked', String(active));
    });
    const title = $('#drop-title');
    if (title) title.textContent = `Drop ${info.name} backup here`;
  }

  async function setBackupFlavor(flavor) {
    if (!(flavor in BACKUP_APPS) || state.data) return;
    saveSettings({backupFlavor:flavor});
    state.loadedFlavor = null;
    updateBackupFlavorUi();
    const info = BACKUP_APPS[flavor];
    diag(`Loading ${info.name} schema…`);
    try {
      await ensureSchema(flavor);
      diag(`Ready ✓ · ${info.name} schema loaded · GZIP/raw protobuf supported.`);
    } catch (error) {
      diag(error.message, true);
    }
  }

  async function ensureSchema(flavor = selectedFlavor()) {
    if (!(flavor in BACKUP_APPS)) flavor = 'komikku';
    if (state.schemaCache.has(flavor)) return state.schemaCache.get(flavor);
    if (!window.protobuf) throw new Error('ProtobufJS did not load. Check your internet connection, then reload the page.');
    if (window.Long && protobuf.util) {
      protobuf.util.Long = window.Long;
      protobuf.configure();
    }
    const info = BACKUP_APPS[flavor];
    const schemaUrl = new URL(`./schemas/${info.schema}`, document.baseURI).href;
    log(`Loading ${info.name} schema: ${schemaUrl}`);
    const response = await fetch(schemaUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load ${info.schema} (HTTP ${response.status}).`);
    const schemaText = await response.text();
    const parsed = protobuf.parse(schemaText, { keepCase: true });
    const type = parsed.root.lookupType('Backup');
    state.schemaCache.set(flavor, type);
    log(`${info.name} protobuf schema loaded.`);
    return type;
  }

  function isJsonBytes(bytes) {
    const max = Math.min(bytes.length, 64);
    let s = '';
    for (let i = 0; i < max; i++) s += String.fromCharCode(bytes[i]);
    return s.trimStart().startsWith('{') || s.trimStart().startsWith('[');
  }

  async function gunzip(bytes) {
    if (window.pako?.ungzip) return window.pako.ungzip(bytes);
    if ('DecompressionStream' in window) {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    throw new Error('No GZIP decoder is available in this browser.');
  }

  async function decodeBackupFile(file, { primary = false } = {}) {
    if (!file) throw new Error('No file selected.');
    if (primary) { state.debug = []; setLoadStage(0, `Reading ${file.name}`); diag(`Reading ${file.name} · ${formatBytes(file.size)}…`); }
    else log(`Comparison: reading ${file.name} · ${formatBytes(file.size)}.`);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const header = [...bytes.slice(0, 8)].map(n => n.toString(16).padStart(2, '0')).join(' ');
    log(`${primary ? 'Primary' : 'Compare'} header: ${header || '(empty)'}`);
    if (!bytes.length) throw new Error('The selected file is empty.');

    const meta = { name:file.name, size:file.size, header, format:'raw protobuf', compressedBytes:bytes.length, decodedBytes:bytes.length };
    if (isJsonBytes(bytes) || file.name.toLowerCase().endsWith('.json')) {
      const text = new TextDecoder().decode(bytes);
      meta.format = 'JSON'; meta.decodedBytes = bytes.length;
      if (primary) state.primaryMeta = meta;
      log(`${primary ? 'Primary' : 'Compare'} detected JSON backup.`);
      return normalizeData(JSON.parse(text));
    }

    const flavor = selectedFlavor();
    const appInfo = BACKUP_APPS[flavor];
    const Backup = await ensureSchema(flavor);
    let payload = bytes;
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      meta.format = 'GZIP protobuf';
      if (primary) { setLoadStage(1, 'Decompressing GZIP'); diag('GZIP header detected · decompressing…'); }
      payload = await gunzip(bytes);
      meta.decodedBytes = payload.length;
      log(`${primary ? 'Primary' : 'Compare'} GZIP OK · ${formatBytes(payload.length)} protobuf payload.`);
    } else log(`${primary ? 'Primary' : 'Compare'} has no GZIP header · decoding as raw protobuf.`);

    if (primary) { setLoadStage(2, `Decoding ${appInfo.name} protobuf`); diag(`Decoding ${appInfo.name} protobuf…`); }
    let message;
    try { message = Backup.decode(payload); }
    catch (error) { throw new Error(`${appInfo.name} protobuf decode failed: ${error.message}`); }
    const data = Backup.toObject(message, { longs:String, enums:String, bytes:String, defaults:false, arrays:true, objects:true });
    if (primary) state.primaryMeta = meta;
    log(`${primary ? 'Primary' : 'Compare'} protobuf OK · ${asArray(data.backupManga).length} manga.`);
    return normalizeData(data);
  }

  function normalizeData(data) {
    if (!data || typeof data !== 'object') throw new Error('Decoded backup did not contain an object.');
    data.backupManga = asArray(data.backupManga);
    data.backupCategories = asArray(data.backupCategories);
    data.backupSources = asArray(data.backupSources);
    data.backupSavedSearches = asArray(data.backupSavedSearches);
    data.backupFeeds = asArray(data.backupFeeds);
    data.backupPreferences = asArray(data.backupPreferences);
    data.backupSourcePreferences = asArray(data.backupSourcePreferences);
    data.backupExtensionStores = asArray(data.backupExtensionStores);
    data.backupManga.forEach(m => {
      m.chapters = asArray(m.chapters);
      m.categories = asArray(m.categories);
      m.tracking = asArray(m.tracking);
      m.history = asArray(m.history);
      m.genre = asArray(m.genre);
      m.customGenre = asArray(m.customGenre);
      m.mergedMangaReferences = asArray(m.mergedMangaReferences);
    });
    return data;
  }

  async function openFile(file) {
    if (!file) return;
    try {
      const data = await decodeBackupFile(file, { primary: true });
      state.data = data;
      state.loadedFlavor = state.settings.backupFlavor in BACKUP_APPS ? state.settings.backupFlavor : 'komikku';
      state.fileName = file.name;
      state.compareData = null;
      state.compareFileName = '';
      state.diff = null;
      state.notifications = [];
      state.notificationUnread = 0;
      state.notificationSignature = '';
      state.notificationSeenSignature = '';
      state.dismissedNotifications.clear();
      state.seenNotificationKeys.clear();
      state.cache = { health: null, duplicates: null, activity: null, searchIndex: null };
      state.quickFilter = '';
      state.page = 1;
      setLoadStage(3, 'Building indexes');
      buildIndexes();
      $('#loader-view').classList.add('hidden');
      $('#app-view').classList.remove('hidden');
      document.body.classList.add('has-backup');
      $('#backup-name').textContent = file.name;
      const loadedApp = BACKUP_APPS[state.loadedFlavor];
      $('#backup-summary').textContent = `${loadedApp.name} · ${data.backupManga.length.toLocaleString()} manga · ${data.backupCategories.length} categories · ${data.backupSources.length} sources`;
      diag(`${loadedApp.name} backup loaded ✓ · ${data.backupManga.length.toLocaleString()} manga.`);
      populateFilters();
      applySavedSettings();
      updateQuickChipUi();
      setLoadStage(4, 'Analyzing library');
      renderDashboard();
      renderBackupMetadata();
      applyPerformanceMode();
      const restoredView = ['dashboard','library','explore','analyze','tools'].includes(state.settings.lastView) ? state.settings.lastView : 'dashboard';
      switchView(restoredView);
      buildNotifications();
      updatePwaStatus();
      setTimeout(()=>hideLoadProgress(),220);
    } catch (error) {
      console.error(error);
      diag(error.message || String(error), true);
      toast('Could not open this backup');
      hideLoadProgress();
    } finally {
      $('#file-input').value = '';
    }
  }

  function buildIndexes() {
    state.sourceMap = new Map(state.data.backupSources.map(s => [key64(s.sourceId), s.name || key64(s.sourceId)]));
    state.categoryMap = new Map();
    state.categoryIdMap = new Map();
    state.data.backupCategories.forEach((c, i) => {
      // Komikku/Mihon BackupManga.categories stores BackupCategory.order, not the DB category id.
      const orderKey = key64(c.order != null ? c.order : i);
      state.categoryMap.set(orderKey, c);
      if (c.id != null) state.categoryIdMap.set(key64(c.id), c);
    });
  }

  function displayTitle(m) { return m.customTitle || m.title || '(Untitled)'; }
  function displayAuthor(m) { return m.customAuthor || m.author || ''; }
  function displayArtist(m) { return m.customArtist || m.artist || ''; }
  function displayDescription(m) { return m.customDescription || m.description || ''; }
  function displayCover(m) { return m.customThumbnailUrl || m.thumbnailUrl || ''; }
  function displayGenres(m) { return (m.customGenre?.length ? m.customGenre : m.genre) || []; }
  function displayStatus(m) { const s = asNum(m.customStatus) || asNum(m.status); return statusNames[s] || `Status ${s}`; }
  function sourceName(m) { return state.sourceMap.get(key64(m.source)) || key64(m.source) || 'Unknown source'; }
  function unreadCount(m) { return m.chapters.reduce((n, c) => n + (c.read ? 0 : 1), 0); }
  function readCount(m) { return m.chapters.length - unreadCount(m); }
  function bookmarkCount(m) { return m.chapters.reduce((n, c) => n + (c.bookmark ? 1 : 0), 0); }
  function lastRead(m) { return Math.max(0, ...m.history.map(h => asNum(h.lastRead))); }
  function hasHistory(m) { return lastRead(m) > 0; }

  function populateFilters() {
    const sel = $('#category-filter');
    sel.innerHTML = '<option value="all">All categories</option>';
    [...state.categoryMap.entries()].sort((a,b) => asNum(a[1].order)-asNum(b[1].order)).forEach(([id,c]) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = `${c.hidden ? 'Hidden · ' : ''}${c.name}`;
      sel.appendChild(opt);
    });
  }

  function tokenizeQuery(query) {
    const tokens = query.match(/(?:[^\s"]+:"[^"]*"|"[^"]*"|\S+)/g) || [];
    return tokens.map(t => t.trim()).filter(Boolean);
  }

  function stripQuotes(v) {
    const s = String(v || '').trim();
    return s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
  }

  function compareNumber(value, expression) {
    const m = String(expression).match(/^(>=|<=|>|<|=)?\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) return String(value) === String(expression);
    const op = m[1] || '=';
    const target = Number(m[2]);
    if (op === '>') return value > target;
    if (op === '<') return value < target;
    if (op === '>=') return value >= target;
    if (op === '<=') return value <= target;
    return value === target;
  }

  function queryMatches(m, query) {
    const tokens = tokenizeQuery(query);
    if (!tokens.length) return true;
    const title = normalizeText(displayTitle(m));
    const author = normalizeText(displayAuthor(m));
    const artist = normalizeText(displayArtist(m));
    const source = normalizeText(sourceName(m));
    const genres = displayGenres(m).map(normalizeText);
    const categories = m.categories.map(id => normalizeText(state.categoryMap.get(key64(id))?.name || ''));
    const allText = [title,author,artist,source,...genres,...categories].join(' ');

    return tokens.every(token => {
      const colon = token.indexOf(':');
      if (colon < 1) return allText.includes(normalizeText(stripQuotes(token)));
      const field = token.slice(0, colon).toLowerCase();
      const raw = stripQuotes(token.slice(colon + 1));
      const value = normalizeText(raw);
      if (field === 'title') return title.includes(value);
      if (field === 'author') return author.includes(value);
      if (field === 'artist') return artist.includes(value);
      if (field === 'source') return source.includes(value);
      if (field === 'genre') return genres.some(g => g.includes(value));
      if (field === 'category' || field === 'cat') return categories.some(c => c.includes(value));
      if (field === 'status') {
        const status = asNum(m.customStatus) || asNum(m.status);
        const wanted = /^\d+$/.test(value) ? Number(value) : statusLookup[value];
        return wanted == null ? normalizeText(displayStatus(m)).includes(value) : status === wanted;
      }
      if (field === 'unread') return compareNumber(unreadCount(m), raw);
      if (field === 'chapters') return compareNumber(m.chapters.length, raw);
      if (field === 'tracked') return ['1','yes','true'].includes(value) ? m.tracking.length > 0 : m.tracking.length === 0;
      if (field === 'bookmark' || field === 'bookmarked') return ['1','yes','true'].includes(value) ? bookmarkCount(m) > 0 : bookmarkCount(m) === 0;
      if (field === 'history') return ['1','yes','true'].includes(value) ? hasHistory(m) : !hasHistory(m);
      if (field === 'cover') return ['1','yes','true'].includes(value) ? Boolean(displayCover(m)) : !displayCover(m);
      if (field === 'tracker') return m.tracking.some(t => trackerInfo(t.syncId).name.toLowerCase().includes(value));
      return allText.includes(normalizeText(token));
    });
  }

  function quickMatches(m) {
    const q = state.quickFilter;
    if (!q) return true;
    if (q === 'unread') return unreadCount(m) > 0;
    if (q === 'completed') return (asNum(m.customStatus) || asNum(m.status)) === 2;
    if (q === 'bookmarked') return bookmarkCount(m) > 0;
    if (q === 'tracked') return m.tracking.length > 0;
    if (q === 'nocover') return !displayCover(m);
    if (q === 'nohistory' || q === 'neverread') return !hasHistory(m);
    if (q === 'long') return m.chapters.length >= 100;
    if (q === 'completedunread') return (asNum(m.customStatus)||asNum(m.status)) === 2 && unreadCount(m) > 0;
    if (q === 'uncategorized') return m.categories.length === 0;
    return true;
  }

  function applyFilters(resetPage = false) {
    if (!state.data) return;
    if (resetPage) state.page = 1;
    const q = $('#search-input').value.trim();
    const cat = $('#category-filter').value;
    const status = $('#status-filter').value;
    const read = $('#read-filter').value;
    const sort = $('#sort-select').value;

    let list = state.data.backupManga.filter(m => {
      if (q && !queryMatches(m, q)) return false;
      if (!quickMatches(m)) return false;
      if (cat !== 'all' && !m.categories.some(c => key64(c) === cat)) return false;
      const actualStatus = asNum(m.customStatus) || asNum(m.status);
      if (status !== 'all' && actualStatus !== Number(status)) return false;
      if (read === 'unread' && unreadCount(m) === 0) return false;
      if (read === 'read' && unreadCount(m) !== 0) return false;
      if (read === 'bookmarked' && bookmarkCount(m) === 0) return false;
      if (read === 'tracked' && m.tracking.length === 0) return false;
      return true;
    });

    list.sort((a,b) => {
      if (sort === 'recent') return lastRead(b)-lastRead(a) || displayTitle(a).localeCompare(displayTitle(b));
      if (sort === 'added') return asNum(b.dateAdded)-asNum(a.dateAdded) || displayTitle(a).localeCompare(displayTitle(b));
      if (sort === 'unread') return unreadCount(b)-unreadCount(a) || displayTitle(a).localeCompare(displayTitle(b));
      if (sort === 'chapters') return b.chapters.length-a.chapters.length || displayTitle(a).localeCompare(displayTitle(b));
      return displayTitle(a).localeCompare(displayTitle(b), undefined, {sensitivity:'base'});
    });

    state.filtered = list;
    const pages = Math.max(1, Math.ceil(list.length / state.pageSize));
    state.page = clamp(state.page, 1, pages);
    renderLibrary();
  }

  function coverHtml(m, className = '') {
    const cover = displayCover(m);
    return cover ? `<img class="${className}" src="${esc(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : `<div class="cover-fallback">◇</div>`;
  }

  function renderLibrary() {
    const grid = $('#library-grid');
    const mode = $('#view-mode-select').value || state.settings.viewMode || 'grid';
    const cardSize = $('#card-size-select').value || state.settings.cardSize || 'medium';
    grid.className = `manga-grid ${mode === 'grid' ? '' : mode} card-${cardSize}`.trim();
    const start = (state.page - 1) * state.pageSize;
    const pageItems = state.filtered.slice(start, start + state.pageSize);
    grid.innerHTML = pageItems.map(m => {
      const idx = state.data.backupManga.indexOf(m);
      const total = m.chapters.length;
      const read = readCount(m);
      const pct = total ? Math.round(read / total * 100) : 0;
      return `<article class="manga-card"><button class="quick-preview-btn" type="button" data-quick-preview="${idx}" aria-label="Quick preview">•••</button><button class="card-hit" data-manga-index="${idx}"><div class="cover">${coverHtml(m)}<span class="badge">${unreadCount(m)} unread</span></div><div class="manga-card-body"><div class="manga-title">${esc(displayTitle(m))}</div><div class="manga-sub"><span>${esc(displayStatus(m))}</span><span>${read}/${total}</span></div><div class="progress"><i style="width:${pct}%"></i></div></div></button></article>`;
    }).join('');
    $('#empty-library').classList.toggle('hidden', pageItems.length > 0);
    const pages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    $('#library-meta').textContent = `${state.filtered.length.toLocaleString()} of ${state.data.backupManga.length.toLocaleString()} manga`;
    $('#page-label').textContent = `Page ${state.page} / ${pages}`;
    $('#prev-page').disabled = state.page <= 1;
    $('#next-page').disabled = state.page >= pages;
  }

  function updateQuickChipUi() {
    $$('#quick-chips [data-quick]').forEach(btn => btn.classList.toggle('active', btn.dataset.quick === state.quickFilter));
  }

  function getActivity() {
    if (state.cache.activity) return state.cache.activity;
    const rows = [];
    state.data.backupManga.forEach((m, mangaIndex) => {
      m.history.forEach(h => {
        const when = asNum(h.lastRead);
        if (when > 0) rows.push({ manga: m, mangaIndex, when, url: h.url || '', duration: asNum(h.readDuration) });
      });
    });
    rows.sort((a,b) => b.when-a.when);
    state.cache.activity = rows;
    return rows;
  }

  function computeDuplicates() {
    if (state.cache.duplicates) return state.cache.duplicates;
    const exact = new Map();
    const titles = new Map();
    state.data.backupManga.forEach((m, index) => {
      const exactKey = `${key64(m.source)}::${normalizeText(m.url)}`;
      if (m.url) {
        if (!exact.has(exactKey)) exact.set(exactKey, []);
        exact.get(exactKey).push({m,index});
      }
      const titleKey = normalizeText(displayTitle(m)).replace(/[^a-z0-9\u00c0-\uffff]+/g, '');
      if (titleKey) {
        if (!titles.has(titleKey)) titles.set(titleKey, []);
        titles.get(titleKey).push({m,index});
      }
    });
    const strong = [...exact.values()].filter(g => g.length > 1);
    const possible = [...titles.values()].filter(g => g.length > 1 && !g.every(x => x.m.url && x.m.url === g[0].m.url && key64(x.m.source) === key64(g[0].m.source)));
    state.cache.duplicates = { strong, possible };
    return state.cache.duplicates;
  }

  function computeHealth() {
    if (state.cache.health) return state.cache.health;
    const mangas = state.data.backupManga;
    const duplicateData = computeDuplicates();
    const issues = {
      missingTitle: [], missingCover: [], noChapters: [], unknownSource: [], danglingCategory: [], duplicate: [],
    };
    mangas.forEach((m,index) => {
      if (!displayTitle(m) || displayTitle(m) === '(Untitled)') issues.missingTitle.push(index);
      if (!displayCover(m)) issues.missingCover.push(index);
      if (!m.chapters.length) issues.noChapters.push(index);
      if (!state.sourceMap.has(key64(m.source))) issues.unknownSource.push(index);
      if (m.categories.some(id => !state.categoryMap.has(key64(id)))) issues.danglingCategory.push(index);
    });
    issues.duplicate = duplicateData.strong.flat().map(x => x.index);
    // Chapter arrays can legitimately be absent when chapter backup was disabled or an entry had no fetched chapters.
    // Keep Health focused on structural consistency; metadata completeness is covered by Quality/Source Health.
    const weighted = issues.missingTitle.length*4 + issues.missingCover.length*.1 + issues.unknownSource.length*3 + issues.danglingCategory.length*3 + duplicateData.strong.length*3;
    const denominator = Math.max(1, mangas.length * 4);
    const score = clamp(Math.round(100 - (weighted / denominator * 100)), 0, 100);
    const integrityFlags = issues.missingTitle.length + issues.unknownSource.length + issues.danglingCategory.length + duplicateData.strong.length;
    const result = { score, issues, duplicateGroups: duplicateData.strong.length, integrityFlags };
    state.cache.health = result;
    return result;
  }

  function renderDashboard() {
    if (!state.data) return;
    const mangas = state.data.backupManga;
    const chapters = mangas.reduce((n,m) => n + m.chapters.length, 0);
    const unread = mangas.reduce((n,m) => n + unreadCount(m), 0);
    const bookmarks = mangas.reduce((n,m) => n + bookmarkCount(m), 0);
    const health = computeHealth();
    const stats = [
      ['Manga', mangas.length, `${state.data.backupCategories.length} categories`],
      ['Chapters', chapters, `${unread.toLocaleString()} unread`],
      ['Bookmarks', bookmarks, `${mangas.filter(m=>m.tracking.length).length} tracked`],
      ['Health', `${health.score}%`, health.score >= 90 ? 'Looks clean' : 'Review issues'],
    ];
    $('#dashboard-cards').innerHTML = stats.map(([label,val,sub]) => {const num=typeof val==='number'?val:(typeof val==='string'&&val.endsWith('%')?Number(val.slice(0,-1)):null);return `<div class="stat-card"><strong ${num!=null?`data-animate-count="${num}" data-suffix="${typeof val==='string'&&val.endsWith('%')?'%':''}"`:''}>${typeof val==='number'?val.toLocaleString():esc(val)}</strong><span>${esc(label)}</span><small>${esc(sub)}</small></div>`}).join('');

    const issueCount = health.integrityFlags;
    $('#dashboard-health').innerHTML = `<div class="health-ring"><div class="health-score" style="--score:${health.score}"><span>${health.score}%</span></div><div><strong>${issueCount ? `${issueCount.toLocaleString()} issue flags` : 'No obvious issues found'}</strong><p class="muted">${health.duplicateGroups} strong duplicate group${health.duplicateGroups===1?'':'s'} · ${health.issues.unknownSource.length} unknown source entr${health.issues.unknownSource.length===1?'y':'ies'}.</p></div></div>`;

    const completed = mangas.filter(m => (asNum(m.customStatus)||asNum(m.status))===2).length;
    const withHistory = mangas.filter(hasHistory).length;
    const noCover = mangas.filter(m=>!displayCover(m)).length;
    const snapshot = [
      ['Completed', `${completed.toLocaleString()} / ${mangas.length.toLocaleString()}`],
      ['With reading history', withHistory.toLocaleString()],
      ['Missing covers', noCover.toLocaleString()],
      ['Saved searches / feeds', `${state.data.backupSavedSearches.length} / ${state.data.backupFeeds.length}`],
    ];
    $('#dashboard-snapshot').innerHTML = snapshot.map(([k,v])=>`<div class="detail-item"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');

    const recent = getActivity().slice(0,5);
    $('#dashboard-recent').innerHTML = recent.length ? recent.map(r => `<button class="card-hit" data-manga-index="${r.mangaIndex}"><div class="mini-row">${displayCover(r.manga)?`<img class="mini-thumb" src="${esc(displayCover(r.manga))}" alt="" referrerpolicy="no-referrer">`:`<div class="mini-thumb cover-fallback">◇</div>`}<div><strong>${esc(displayTitle(r.manga))}</strong><small>${esc(sourceName(r.manga))}</small></div><small>${new Date(r.when).toLocaleDateString()}</small></div></button>`).join('') : '<p class="muted">No reading history found.</p>';
    renderPremiumDashboard();
  }

  function renderCategoryExplorer() {
    const rows = [...state.categoryMap.entries()].map(([id,c]) => {
      const mangas = state.data.backupManga.filter(m => m.categories.some(x => key64(x) === id));
      return {id,c,count:mangas.length,unread:mangas.reduce((n,m)=>n+unreadCount(m),0),completed:mangas.filter(m=>(asNum(m.customStatus)||asNum(m.status))===2).length};
    }).sort((a,b)=>b.count-a.count || String(a.c.name).localeCompare(String(b.c.name)));
    $('#category-explorer').innerHTML = rows.length ? rows.map(r=>`<button class="explorer-card" data-category-jump="${esc(r.id)}"><strong>${r.c.hidden?'◌ ':''}${esc(r.c.name)}</strong><small>${r.c.hidden?'Hidden category':'Category'}</small><div class="explorer-metrics"><span>${r.count} manga</span><span>${r.unread} unread</span><span>${r.completed} completed</span></div></button>`).join('') : '<div class="empty-state">No categories in this backup.</div>';
  }

  function renderSourceExplorer() {
    const counts = new Map();
    state.data.backupManga.forEach(m => {
      const id = key64(m.source);
      const row = counts.get(id) || {id,name:sourceName(m),count:0,unread:0,chapters:0};
      row.count++; row.unread += unreadCount(m); row.chapters += m.chapters.length;
      counts.set(id,row);
    });
    const rows = [...counts.values()].sort((a,b)=>b.count-a.count);
    $('#source-explorer').innerHTML = rows.length ? rows.map(r=>`<button class="explorer-card" data-source-jump="${esc(r.name)}"><strong>${esc(r.name)}</strong><small>Source ID ${esc(r.id)}</small><div class="explorer-metrics"><span>${r.count} manga</span><span>${r.chapters} chapters</span><span>${r.unread} unread</span></div></button>`).join('') : '<div class="empty-state">No source data.</div>';
  }

  function trackerInfo(id) {
    const key = Number(id);
    return TRACKERS[key] || { name:`Tracker ${id ?? 'Unknown'}`, mark:String(id ?? '?') };
  }

  function trackerDate(v) {
    const n=asNum(v); if(!n) return '—'; const d=new Date(n); return Number.isNaN(d.getTime())?'—':d.toLocaleDateString();
  }

  function computeFeedHealth() {
    const feeds = asArray(state.data?.backupFeeds);
    const rows = feeds.map((feed,index) => {
      const source = key64(feed.source);
      const saved = feed.savedSearch || null;
      const savedSource = saved ? key64(saved.source) : '';
      const mode = feed.global ? 'Global' : 'Source';
      const name = saved?.name || 'Popular / Latest';
      return {
        index, feed, source, saved, savedSource, mode, name,
        sourceInLibraryMap: state.sourceMap.has(source),
        sourceMismatch: Boolean(saved && savedSource && source && savedSource !== source),
        blankName: Boolean(saved && !String(saved.name || '').trim()),
      };
    });
    const groups = new Map();
    rows.forEach(r => {
      const s=r.saved;
      const key=[r.source,r.feed.global?'1':'0',normalizeText(s?.name||''),normalizeText(s?.query||''),String(s?.filterList||'')].join('::');
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(r);
    });
    const duplicates=[...groups.values()].filter(g=>g.length>1);
    const sourceMismatch=rows.filter(r=>r.sourceMismatch);
    const blankName=rows.filter(r=>r.blankName);
    const feedOnlySources=rows.filter(r=>r.source && !r.sourceInLibraryMap);
    return {
      rows,
      total:rows.length,
      global:rows.filter(r=>r.feed.global).length,
      sourceSpecific:rows.filter(r=>!r.feed.global).length,
      savedSearch:rows.filter(r=>r.saved).length,
      builtin:rows.filter(r=>!r.saved).length,
      duplicates,
      sourceMismatch,
      blankName,
      feedOnlySources,
      structuralIssues:sourceMismatch.length+blankName.length,
    };
  }

  function renderFeedExplorer() {
    const f=computeFeedHealth();
    $('#feed-summary').innerHTML=[['Feeds',f.total],['Global',f.global],['Source-specific',f.sourceSpecific],['Saved-search feeds',f.savedSearch]].map(([k,v])=>`<div class="stat-card"><strong>${Number(v).toLocaleString()}</strong><span>${esc(k)}</span></div>`).join('');
    if(!f.rows.length){
      $('#feed-explorer').innerHTML=`<div class="empty-state">No feed records in this backup. For Komikku this can mean “Saved searches & feeds” was not included when the backup was created. Mihon backups normally have no Komikku feed extension.</div>`;
      return;
    }
    $('#feed-explorer').innerHTML=f.rows.map(r=>{
      const source=state.sourceMap.get(r.source)||`Source ID ${r.source||'0'}`;
      const flags=[r.mode,r.saved?'Saved search':'Built-in feed',!r.sourceInLibraryMap?'Feed-only source':''].filter(Boolean);
      return `<div class="feed-row"><span class="source-logo">${esc(sourceMark(source))}</span><div class="feed-row-main"><strong>${esc(r.name)}</strong><small>${esc(source)} · ${flags.map(esc).join(' · ')}</small>${r.saved?`<code>${esc(r.saved.query||'(empty query)')}</code>`:''}</div><div class="feed-row-side"><span>${r.feed.global?'GLOBAL':'SOURCE'}</span>${r.sourceMismatch?'<b class="feed-bad">Source mismatch</b>':''}</div></div>`;
    }).join('');
  }

  function renderFeedHealth() {
    const f=computeFeedHealth();
    const cards=[
      ['Feed records',f.total,'info',f.total?'Decoded from backup':'No feed data'],
      ['Duplicate definitions',f.duplicates.length,f.duplicates.length?'warn':'ok',f.duplicates.length?'Restore normally filters existing duplicates':'No duplicate definitions'],
      ['Saved-search source mismatch',f.sourceMismatch.length,f.sourceMismatch.length?'bad':'ok',f.sourceMismatch.length?'Feed source differs from embedded saved search':'No mismatch detected'],
      ['Blank saved-search names',f.blankName.length,f.blankName.length?'bad':'ok',f.blankName.length?'Malformed saved-search metadata':'No blank names'],
      ['Feed-only source refs',f.feedOnlySources.length,'info',f.feedOnlySources.length?'Not necessarily an error; backupSources comes from manga':'All feed sources also appear in library source map'],
      ['Category links',0,'info','BackupFeed does not contain category references'],
    ];
    $('#feed-health-summary').innerHTML=cards.map(([label,count,severity,note])=>`<div class="issue-card" data-severity="${severity}"><strong>${Number(count).toLocaleString()}</strong><span>${esc(label)}</span><small>${esc(note)}</small></div>`).join('');
    const rows=[];
    f.sourceMismatch.forEach(r=>rows.push(`Source mismatch · ${r.name} · feed ${r.source} / saved search ${r.savedSource}`));
    f.blankName.forEach(r=>rows.push(`Blank saved-search name · source ${r.source}`));
    f.duplicates.forEach(g=>rows.push(`Duplicate feed definition · ${g.length} copies · ${g[0].name} · source ${g[0].source}`));
    f.feedOnlySources.slice(0,100).forEach(r=>rows.push(`Feed-only source reference · ${r.name} · source ${r.source} (informational)`));
    $('#feed-health-list').innerHTML=rows.length?rows.map(x=>`<div class="duplicate-item">${esc(x)}</div>`).join(''):'<div class="empty-state">No structural feed issue detected. Feed/category association is not part of the Komikku BackupFeed format.</div>';
  }

  function renderTrackerOverview() {
    const trackers = new Map();
    state.data.backupManga.forEach((m,mangaIndex) => m.tracking.forEach(t => {
      const id = String(t.syncId ?? 'unknown');
      const row = trackers.get(id) || {id,count:0,progress:0,scores:[],statuses:new Map(),entries:[]};
      row.count++; row.progress += asNum(t.lastChapterRead); if (asNum(t.score)>0) row.scores.push(asNum(t.score));
      const st=String(t.status ?? '—'); row.statuses.set(st,(row.statuses.get(st)||0)+1);
      row.entries.push({m,mangaIndex,t}); trackers.set(id,row);
    }));
    const rows = [...trackers.values()].sort((a,b)=>b.count-a.count);
    $('#tracker-overview').innerHTML = rows.length ? rows.map(r=>{
      const avg=r.scores.length?(r.scores.reduce((a,b)=>a+b,0)/r.scores.length).toFixed(1):'—'; const info=trackerInfo(r.id);
      const common=[...r.statuses.entries()].sort((a,b)=>b[1]-a[1])[0];
      return `<button class="explorer-card tracker-explorer-card" data-tracker-jump="${esc(info.name)}"><span class="tracker-logo">${esc(info.mark)}</span><strong>${esc(info.name)}</strong><small>Tracker ID ${esc(r.id)} · ${r.count.toLocaleString()} manga</small><div class="explorer-metrics"><span>Avg score ${avg}</span><span>Progress ${Math.round(r.progress).toLocaleString()}</span><span>Status ${esc(common?.[0]||'—')}</span></div></button>`
    }).join('') : '<div class="empty-state">No tracking entries stored in this backup.</div>';
  }

  function renderActivity() {
    const rows = getActivity().slice(0,200);
    $('#activity-timeline').innerHTML = rows.length ? rows.map(r => `<button class="card-hit" data-manga-index="${r.mangaIndex}"><div class="timeline-row">${displayCover(r.manga)?`<img class="timeline-thumb" src="${esc(displayCover(r.manga))}" alt="" referrerpolicy="no-referrer">`:`<div class="timeline-thumb cover-fallback">◇</div>`}<div><strong>${esc(displayTitle(r.manga))}</strong><small>${esc(sourceName(r.manga))}${r.duration?` · ${formatDuration(r.duration)}`:''}</small></div><div><small>${new Date(r.when).toLocaleString()}</small></div></div></button>`).join('') : '<div class="empty-state">No reading activity stored in this backup.</div>';
  }

  function renderGenreExplorer() {
    const rows=countValues(state.data.backupManga.flatMap(displayGenres));
    $('#genre-explorer').innerHTML=rows.length?rows.slice(0,250).map(([name,count])=>`<button class="explorer-card" data-search-jump="genre:&quot;${esc(name)}&quot;"><strong>${esc(name)}</strong><small>${count.toLocaleString()} manga</small></button>`).join(''):'<div class="empty-state">No genre data.</div>';
  }

  function renderCreatorExplorer() {
    const authors=countValues(state.data.backupManga.map(displayAuthor).filter(Boolean)).slice(0,150);
    const artists=countValues(state.data.backupManga.map(displayArtist).filter(Boolean)).slice(0,150);
    const make=(rows,field)=>rows.map(([name,count])=>`<button class="explorer-card" data-search-jump="${field}:&quot;${esc(name)}&quot;"><strong>${esc(name)}</strong><small>${count.toLocaleString()} manga</small></button>`).join('')||'<div class="muted">No data.</div>';
    $('#author-explorer').innerHTML=make(authors,'author'); $('#artist-explorer').innerHTML=make(artists,'artist');
  }

  function renderSmartCollections() {
    const collections=[
      ['100+ chapters','long','Long-running manga'],['Never read','neverread','No reading history'],['Tracked','tracked','Has tracker entries'],
      ['Completed + unread','completedunread','Completed but still has unread chapters'],['No cover','nocover','Missing cover URL'],['Uncategorized','uncategorized','No category assigned']
    ];
    $('#smart-collections').innerHTML=collections.map(([name,key,sub])=>`<button class="explorer-card" data-smart-jump="${key}"><strong>${name}</strong><small>${sub}</small></button>`).join('');
    const mangas=[...state.data.backupManga];
    const top=[...mangas].sort((a,b)=>readCount(b)-readCount(a)).slice(0,10);
    $('#top-manga').innerHTML=top.map(m=>{const i=state.data.backupManga.indexOf(m);return `<button class="card-hit" data-manga-index="${i}"><div class="recent-row">${displayCover(m)?`<img class="recent-thumb" src="${esc(displayCover(m))}" alt="" loading="lazy" referrerpolicy="no-referrer">`:`<div class="recent-thumb cover-fallback">◇</div>`}<div><strong>${esc(displayTitle(m))}</strong><small>${readCount(m).toLocaleString()} read · ${m.chapters.length.toLocaleString()} chapters</small></div><div><small>${unreadCount(m).toLocaleString()} unread</small></div></div></button>`}).join('')||'<div class="empty-state">No manga.</div>';
  }

  function renderLibraryGrowth() {
    const buckets=new Map();
    state.data.backupManga.forEach(m=>{const n=asNum(m.dateAdded);if(!n)return;const d=new Date(n);if(Number.isNaN(d.getTime()))return;const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;buckets.set(k,(buckets.get(k)||0)+1);});
    const rows=[...buckets.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-36); const max=Math.max(1,...rows.map(r=>r[1]));
    $('#library-growth').innerHTML=rows.length?rows.map(([month,count])=>`<div class="growth-bar" title="${month}: ${count}"><i style="height:${Math.max(4,count/max*100)}%"></i><span>${month.slice(2)}</span><b>${count}</b></div>`).join(''):'<div class="empty-state">No date-added data.</div>';
  }

  function renderHeatmap() {
    const counts=new Map(); const activity=getActivity();
    activity.forEach(r=>{const d=new Date(r.when);if(Number.isNaN(d.getTime()))return;const key=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');counts.set(key,(counts.get(key)||0)+1);});
    const today=new Date(); today.setHours(0,0,0,0); const cells=[]; let total=0,max=0;
    for(let i=363;i>=0;i--){const d=new Date(today.getTime()-i*DAY);const key=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');const c=counts.get(key)||0;total+=c;max=Math.max(max,c);cells.push({key,c});}
    const level=c=>!c?0:c>=Math.max(1,max*.75)?4:c>=Math.max(1,max*.45)?3:c>=Math.max(1,max*.2)?2:1;
    $('#reading-heatmap').innerHTML=cells.map(x=>`<span class="heat-cell" data-level="${level(x.c)}" title="${x.key}: ${x.c} reading event${x.c===1?'':'s'}"></span>`).join('');
    $('#heatmap-summary').textContent=`${total.toLocaleString()} events · peak ${max.toLocaleString()}/day`;
  }

  function switchExploreTab(name) {
    state.exploreTab = name;
    $$('#explore-tabs [data-explore]').forEach(b=>b.classList.toggle('active',b.dataset.explore===name));
    ['categories','sources','feeds','trackers','activity','genres','creators','smart','growth','heatmap','year-review'].forEach(v=>$(`#explore-${v}`)?.classList.toggle('hidden',v!==name));
    if (name === 'categories') renderCategoryExplorer();
    if (name === 'sources') renderSourceExplorer();
    if (name === 'feeds') renderFeedExplorer();
    if (name === 'trackers') renderTrackerOverview();
    if (name === 'activity') renderActivity();
    if (name === 'genres') renderGenreExplorer();
    if (name === 'creators') renderCreatorExplorer();
    if (name === 'smart') renderSmartCollections();
    if (name === 'growth') renderLibraryGrowth();
    if (name === 'heatmap') renderHeatmap();
    if (name === 'year-review') renderYearReview();
  }

  function renderHealth() {
    const h = computeHealth();
    const cls = h.score >= 90 ? 'good' : h.score >= 70 ? 'warn' : 'bad';
    $('#health-summary').innerHTML = `<div class="health-hero"><div class="health-big ${cls}">${h.score}%</div><div><h3>${h.score>=90?'Backup looks healthy':h.score>=70?'Some items need attention':'Backup has several warning signs'}</h3><p class="muted">This is a viewer-side consistency check, not an official Komikku/Mihon validator.</p></div></div><div class="health-rec-mini">${healthRecommendations().slice(0,3).map(([n,t,,tab])=>`<button class="recommendation-row" data-analysis-tab="${tab}"><span class="rec-icon">→</span><span><b>${esc(n)}</b><small>${esc(t)}</small></span></button>`).join('')}</div>`;
    const cards = [
      ['Missing titles',h.issues.missingTitle.length,h.issues.missingTitle.length?'bad':'ok',h.issues.missingTitle.length?'Title metadata needs review':'No issue detected'],
      ['Missing covers',h.issues.missingCover.length,h.issues.missingCover.length?'info':'ok',h.issues.missingCover.length?'Metadata completeness only':'No issue detected'],
      ['No chapters',h.issues.noChapters.length,h.issues.noChapters.length?'info':'ok',h.issues.noChapters.length?'Can be normal in a valid backup':'No issue detected'],
      ['Unknown sources',h.issues.unknownSource.length,h.issues.unknownSource.length?'bad':'ok',h.issues.unknownSource.length?'Review source references':'No issue detected'],
      ['Broken category refs',h.issues.danglingCategory.length,h.issues.danglingCategory.length?'bad':'ok',h.issues.danglingCategory.length?'Review category order references':'No issue detected'],
      ['Strong duplicate groups',h.duplicateGroups,h.duplicateGroups?'warn':'ok',h.duplicateGroups?'Review duplicate entries':'No issue detected'],
    ];
    $('#health-issues').innerHTML = cards.map(([label,count,severity,note])=>`<div class="issue-card" data-severity="${severity}"><strong>${Number(count).toLocaleString()}</strong><span>${esc(label)}</span><small>${esc(note)}</small></div>`).join('');
  }

  function renderDuplicates() {
    const d = computeDuplicates();
    $('#duplicate-summary').textContent = `${d.strong.length} strong duplicate groups · ${d.possible.length} possible title groups`;
    const groups = [
      ...d.strong.map(g=>({type:'Strong',g})),
      ...d.possible.map(g=>({type:'Possible title match',g})),
    ].slice(0,150);
    $('#duplicate-list').innerHTML = groups.length ? groups.map(({type,g})=>`<div class="duplicate-group"><h4>${esc(type)} · ${g.length} entries</h4><div class="duplicate-items">${g.map(x=>`<button class="duplicate-item card-hit" data-manga-index="${x.index}"><strong>${esc(displayTitle(x.m))}</strong> · ${esc(sourceName(x.m))} · ${esc(x.m.url||'no URL')}</button>`).join('')}</div></div>`).join('') : '<div class="empty-state">No duplicate groups detected.</div>';
  }

  function renderInsights() {
    const mangas = state.data.backupManga;
    const chapters = mangas.reduce((n,m)=>n+m.chapters.length,0);
    const unread = mangas.reduce((n,m)=>n+unreadCount(m),0);
    const completed = mangas.filter(m=>(asNum(m.customStatus)||asNum(m.status))===2).length;
    const tracked = mangas.filter(m=>m.tracking.length).length;
    const history = mangas.filter(hasHistory).length;
    const completionRate = mangas.length ? Math.round(completed/mangas.length*100) : 0;
    const unreadRatio = chapters ? Math.round(unread/chapters*100) : 0;
    const cards = [['Completion',`${completionRate}%`],['Unread ratio',`${unreadRatio}%`],['Tracked',tracked],['Read history',history]];
    $('#insight-cards').innerHTML = cards.map(([k,v])=>`<div class="stat-card"><strong>${typeof v==='number'?v.toLocaleString():esc(v)}</strong><span>${esc(k)}</span></div>`).join('');

    renderCountBars('#genre-insights', countValues(mangas.flatMap(displayGenres)), 15);
    renderCountBars('#author-insights', countValues(mangas.map(displayAuthor).filter(Boolean)), 15);
    renderCountBars('#status-insights', countValues(mangas.map(displayStatus)), 10);
    const activity = getActivity();
    const lastTimestamp = activity[0]?.when || 0;
    const rows = [
      ['Total reading events', activity.length.toLocaleString()],
      ['Manga ever opened', history.toLocaleString()],
      ['Latest history', lastTimestamp ? new Date(lastTimestamp).toLocaleString() : '—'],
      ['Average chapters / manga', mangas.length ? (chapters/mangas.length).toFixed(1) : '0'],
      ['Average unread / manga', mangas.length ? (unread/mangas.length).toFixed(1) : '0'],
    ];
    $('#reading-insights').innerHTML = rows.map(([k,v])=>`<div class="detail-item"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');
  }

  function countValues(values) {
    const map = new Map();
    values.forEach(v => { const s=String(v||'').trim(); if(s) map.set(s,(map.get(s)||0)+1); });
    return [...map.entries()].sort((a,b)=>b[1]-a[1]);
  }

  function renderCountBars(selector, rows, limit=15) {
    const shown = rows.slice(0,limit); const max = shown[0]?.[1] || 1;
    $(selector).innerHTML = shown.length ? shown.map(([name,count])=>`<div class="bar-row"><span title="${esc(name)}">${esc(name)}</span><div class="bar-track"><i style="width:${count/max*100}%"></i></div><b>${count}</b></div>`).join('') : '<div class="muted">No data.</div>';
  }

  function renderStale() {
    const days=Number($('#stale-days')?.value||180); const cutoff=Date.now()-days*DAY;
    const rows=state.data.backupManga.map((m,index)=>({m,index,last:lastRead(m)})).filter(x=>!x.last||x.last<cutoff).sort((a,b)=>(a.last||0)-(b.last||0));
    $('#stale-summary').textContent=`${rows.length.toLocaleString()} manga have no reading history or were last read more than ${days} days ago.`;
    $('#stale-list').innerHTML=rows.slice(0,300).map(x=>`<button class="duplicate-item card-hit" data-manga-index="${x.index}"><strong>${esc(displayTitle(x.m))}</strong><span class="muted"> · ${x.last?`last read ${new Date(x.last).toLocaleDateString()}`:'never read'} · ${esc(sourceName(x.m))}</span></button>`).join('')||'<div class="empty-state">No stale manga for this threshold.</div>';
  }

  function sourceHealthRows() {
    const map=new Map();
    state.data.backupManga.forEach(m=>{const id=key64(m.source);const r=map.get(id)||{id,name:sourceName(m),count:0,noCover:0,noChapters:0,unread:0,unknown:!state.sourceMap.has(id)};r.count++;r.noCover+=!displayCover(m);r.noChapters+=!m.chapters.length;r.unread+=unreadCount(m);map.set(id,r);});
    return [...map.values()].sort((a,b)=>b.count-a.count);
  }

  function renderSourceHealth() {
    const rows=sourceHealthRows(); const unknown=rows.filter(r=>r.unknown).reduce((n,r)=>n+r.count,0); const empty=rows.filter(r=>r.noChapters).reduce((n,r)=>n+r.noChapters,0);
    $('#source-health-summary').innerHTML=[['Sources',rows.length],['Unknown entries',unknown],['No-chapter entries',empty],['Total unread',rows.reduce((n,r)=>n+r.unread,0)]].map(([k,v])=>`<div class="stat-card"><strong>${Number(v).toLocaleString()}</strong><span>${k}</span></div>`).join('');
    $('#source-health-list').innerHTML=rows.map(r=>`<div class="source-health-row"><div><strong>${esc(r.name)}</strong><small>ID ${esc(r.id)}${r.unknown?' · Unknown source ID':''}</small></div><div class="source-health-metrics"><span>${r.count} manga</span><span>${r.noCover} no cover</span><span>${r.noChapters} no chapters</span><span>${r.unread} unread</span></div></div>`).join('');
  }

  function computeOrphans() {
    const usedCats=new Set(state.data.backupManga.flatMap(m=>m.categories.map(key64)));
    const emptyCategories=[...state.categoryMap.entries()].filter(([id])=>!usedCats.has(id));
    const orphanHistory=[]; const invalidTracking=[];
    state.data.backupManga.forEach((m,index)=>{const chapterUrls=new Set(m.chapters.map(c=>c.url).filter(Boolean));m.history.forEach(h=>{if(h.url&&!chapterUrls.has(h.url))orphanHistory.push({index,title:displayTitle(m),url:h.url});});m.tracking.forEach(t=>{if(t.syncId==null)invalidTracking.push({index,title:displayTitle(m)});});});
    return {emptyCategories,orphanHistory,invalidTracking};
  }

  function renderOrphans() {
    const o=computeOrphans();
    $('#orphan-summary').innerHTML=[['Unused categories',o.emptyCategories.length],['History without chapter',o.orphanHistory.length],['Tracking without ID',o.invalidTracking.length]].map(([k,v])=>`<div class="issue-card" data-severity="${v?'warn':'ok'}"><strong>${v}</strong><span>${k}</span></div>`).join('');
    const rows=[...o.emptyCategories.map(([id,c])=>`Unused category · ${c.name} (${id})`),...o.orphanHistory.slice(0,100).map(x=>`History URL not in chapter list · ${x.title} · ${x.url}`),...o.invalidTracking.slice(0,100).map(x=>`Tracking entry without syncId · ${x.title}`)];
    $('#orphan-list').innerHTML=rows.map(x=>`<div class="duplicate-item">${esc(x)}</div>`).join('')||'<div class="empty-state">No obvious orphan data.</div>';
  }

  function computeRepairPlan() {
    const changes=[];
    state.data.backupManga.forEach((m,index)=>{const bad=m.categories.filter(id=>!state.categoryMap.has(key64(id)));if(bad.length)changes.push({type:'dangling-category',index,title:displayTitle(m),remove:bad.map(key64)});});
    state.repairPlan={generatedAt:new Date().toISOString(),changes}; return state.repairPlan;
  }

  function renderRepairPreview() {
    const plan=computeRepairPlan();
    $('#repair-preview').innerHTML=plan.changes.length?plan.changes.slice(0,300).map(x=>`<div class="duplicate-item"><strong>${esc(x.title)}</strong> · remove broken category reference${x.remove.length===1?'':'s'}: ${esc(x.remove.join(', '))}</div>`).join(''):'<div class="empty-state">No safe repair suggestions currently detected.</div>';
    $('#apply-safe-repairs').disabled=!plan.changes.length;
  }

  function applySafeRepairs() {
    const plan=state.repairPlan||computeRepairPlan(); if(!plan.changes.length){toast('No safe repairs to apply');return;}
    if(!confirm(`Apply ${plan.changes.length} safe category-reference repair${plan.changes.length===1?'':'s'} to the in-memory backup?`))return;
    plan.changes.forEach(x=>{const m=state.data.backupManga[x.index];if(m)m.categories=m.categories.filter(id=>!x.remove.includes(key64(id)));});
    state.cache={health:null,duplicates:null,activity:null,searchIndex:null}; state.notifications=[]; state.notificationUnread=0; state.notificationSignature=''; state.notificationSeenSignature=''; state.dismissedNotifications.clear(); state.seenNotificationKeys.clear(); renderNotifications(); buildIndexes(); populateFilters(); renderRepairPreview(); renderDashboard(); toast('Safe repairs applied in memory');
  }

  function exportRepairPlan() { const plan=state.repairPlan||computeRepairPlan(); downloadBlob(new Blob([JSON.stringify(plan,null,2)],{type:'application/json'}),datedName('kirin-repair-plan','json')); }

  function switchAnalysisTab(name) {
    state.analysisTab = name;
    $$('#analysis-tabs [data-analysis]').forEach(b=>b.classList.toggle('active',b.dataset.analysis===name));
    ['health','duplicates','compare','insights','stale','source-health','feed-health','orphans','repair','migration','quality'].forEach(v=>$(`#analysis-${v}`)?.classList.toggle('hidden',v!==name));
    if (name === 'health') renderHealth();
    if (name === 'duplicates') renderDuplicates();
    if (name === 'insights') renderInsights();
    if (name === 'stale') renderStale();
    if (name === 'source-health') renderSourceHealth();
    if (name === 'feed-health') renderFeedHealth();
    if (name === 'orphans') renderOrphans();
    if (name === 'repair') renderRepairPreview();
    if (name === 'migration') renderMigrationAssistant();
    if (name === 'quality') renderQualityAnalysis();
  }

  function mangaCompareKey(m) {
    const source = key64(m.source);
    const url = normalizeText(m.url);
    if (url) return `${source}::${url}`;
    return `${source}::title::${normalizeText(displayTitle(m))}`;
  }

  function compareBackups(current, other) {
    const a = new Map(current.backupManga.map(m=>[mangaCompareKey(m),m]));
    const b = new Map(other.backupManga.map(m=>[mangaCompareKey(m),m]));
    const added = [], removed = [], changed = [];
    let newChapters = 0, categoryChanges = 0;

    for (const [key,m] of b) {
      if (!a.has(key)) { added.push(summaryManga(m)); continue; }
      const old = a.get(key);
      const changes = [];
      if (displayComparableTitle(old) !== displayComparableTitle(m)) changes.push('title');
      if ((asNum(old.customStatus)||asNum(old.status)) !== (asNum(m.customStatus)||asNum(m.status))) changes.push('status');
      if (old.chapters.length !== m.chapters.length) {
        const delta = m.chapters.length-old.chapters.length;
        changes.push(`chapters ${delta>=0?'+':''}${delta}`);
        if (delta>0) newChapters += delta;
      }
      const oldCats = old.categories.map(key64).sort().join('|');
      const newCats = m.categories.map(key64).sort().join('|');
      if (oldCats !== newCats) { changes.push('categories'); categoryChanges++; }
      if (unreadCountRaw(old) !== unreadCountRaw(m)) changes.push('read state');
      if (bookmarkCountRaw(old) !== bookmarkCountRaw(m)) changes.push('bookmarks');
      if (changes.length) changed.push({ key, title: displayComparableTitle(m), source: key64(m.source), changes, before:summaryManga(old), after:summaryManga(m), beforeUnread:unreadCountRaw(old), afterUnread:unreadCountRaw(m), beforeBookmarks:bookmarkCountRaw(old), afterBookmarks:bookmarkCountRaw(m) });
    }
    for (const [key,m] of a) if (!b.has(key)) removed.push(summaryManga(m));
    return { added, removed, changed, newChapters, categoryChanges, currentCount:a.size, compareCount:b.size, generatedAt:new Date().toISOString() };
  }

  function displayComparableTitle(m) { return m.customTitle || m.title || '(Untitled)'; }
  function unreadCountRaw(m) { return asArray(m.chapters).reduce((n,c)=>n+(c.read?0:1),0); }
  function bookmarkCountRaw(m) { return asArray(m.chapters).reduce((n,c)=>n+(c.bookmark?1:0),0); }
  function summaryManga(m) { return { title:displayComparableTitle(m), source:key64(m.source), url:m.url||'', chapters:asArray(m.chapters).length }; }

  async function loadComparison(file) {
    if (!file || !state.data) return;
    const status = $('#compare-status');
    status.classList.remove('error');
    status.textContent = `Reading ${file.name}…`;
    try {
      const data = await decodeBackupFile(file, { primary:false });
      state.compareData = data;
      state.compareFileName = file.name;
      state.diff = compareBackups(state.data, data);
      status.textContent = `Compared with ${file.name} ✓ · ${data.backupManga.length.toLocaleString()} manga.`;
      renderComparison();
      buildNotifications();
      toast('Comparison ready');
    } catch (error) {
      console.error(error);
      status.classList.add('error');
      status.textContent = error.message || String(error);
      toast('Comparison failed');
    } finally {
      $('#compare-input').value = '';
    }
  }

  function renderComparison() {
    const d = state.diff; if (!d) return;
    const cards = [['Comparison only',d.added.length],['Current only',d.removed.length],['Changed',d.changed.length],['New chapters',d.newChapters],['Category changes',d.categoryChanges]];
    $('#compare-summary').innerHTML = cards.map(([k,v])=>`<div class="stat-card"><strong>${v.toLocaleString()}</strong><span>${esc(k)}</span></div>`).join('');
    $('#compare-summary').classList.remove('hidden');
    renderCompareTimeline();
    const renderItems = (items,type) => items.slice(0,200).map((x,i)=>type==='changed'?`<button class="diff-row diff-button" data-compare-change="${i}"><strong>${esc(x.title)}</strong><br><span class="muted">${esc(x.changes.join(', '))}</span></button>`:`<div class="diff-row"><strong>${esc(x.title)}</strong><br><span class="muted">${esc(x.url||x.source)}</span></div>`).join('') || '<div class="muted">None</div>';
    $('#compare-details').innerHTML = `<div class="diff-column"><h3>Comparison only +${d.added.length}</h3><div class="diff-list">${renderItems(d.added,'added')}</div></div><div class="diff-column"><h3>Current only −${d.removed.length}</h3><div class="diff-list">${renderItems(d.removed,'removed')}</div></div><div class="diff-column"><h3>Changed ~${d.changed.length}</h3><div class="diff-list">${renderItems(d.changed,'changed')}</div></div><div id="compare-change-detail" class="compare-change-detail"><p class="muted">Select a changed manga to inspect field differences.</p></div>`;
    $('#compare-details').classList.remove('hidden'); $('#export-diff').classList.remove('hidden');
  }

  function renderCompareChangeDetail(i) { const x=state.diff?.changed?.[i], el=$('#compare-change-detail'); if(!x||!el)return; const rows=[['Title',x.before.title,x.after.title],['Chapters',x.before.chapters,x.after.chapters],['Unread',x.beforeUnread,x.afterUnread],['Bookmarks',x.beforeBookmarks,x.afterBookmarks],['Source',x.before.source,x.after.source],['URL',x.before.url,x.after.url]]; el.innerHTML=`<h3>${esc(x.title)}</h3><p class="muted">Changed: ${esc(x.changes.join(', '))}</p><div class="compare-field-grid">${rows.map(([k,a,b])=>`<div class="${String(a)!==String(b)?'changed-field':''}"><b>${esc(k)}</b><span>${esc(a)}</span><span>→</span><span>${esc(b)}</span></div>`).join('')}</div>`; }

  function showManga(index) {
    closeQuickPreview();
    const m = state.data?.backupManga?.[Number(index)]; if (!m) return;
    state.modalMangaIndex = Number(index); state.chapterUi={search:'',filter:'all',sort:'number-desc'};
    const cats=m.categories.map(id=>state.categoryMap.get(key64(id))?.name).filter(Boolean), genres=displayGenres(m), source=sourceName(m);
    const trackingHtml=m.tracking.length?m.tracking.map(t=>{const info=trackerInfo(t.syncId);return `<div class="tracking-card detailed-tracker"><span class="tracker-logo">${esc(info.mark)}</span><div><strong>${esc(info.name)} · ${esc(t.title||displayTitle(m))}</strong><small>Progress ${esc(t.lastChapterRead??0)} / ${esc(t.totalChapters??'—')} · Score ${esc(t.score??'—')} · Status ${esc(t.status??'—')}</small><small>Started ${trackerDate(t.startedReadingDate)} · Finished ${trackerDate(t.finishedReadingDate)}${t.private?' · Private':''}</small>${t.trackingUrl?`<a class="tracker-link" href="${esc(t.trackingUrl)}" target="_blank" rel="noopener noreferrer">Open tracker ↗</a>`:''}</div></div>`}).join(''):'<div class="empty-state">No tracking entries.</div>';
    const mangaLink=/^https?:\/\//i.test(m.url||'')?`<a class="source-open-link" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">Open source page ↗</a>`:'';
    const cover=displayCover(m); const pct=m.chapters.length?Math.round(readCount(m)/m.chapters.length*100):0;
    $('#modal-content').innerHTML=`<div class="detail-hero premium-detail-hero">${cover?`<div class="detail-backdrop" style="background-image:url('${esc(cover).replace(/'/g,'&#39;')}')"></div>`:''}<div>${displayCover(m)?`<img class="detail-cover" src="${esc(displayCover(m))}" alt="" referrerpolicy="no-referrer">`:`<div class="detail-cover cover-fallback">◇</div>`}</div><div><div class="eyebrow">${esc(source)}</div><h2 id="modal-title" class="detail-title">${esc(displayTitle(m))}</h2>${mangaLink}<div class="chips">${cats.map(c=>`<button class="chip chip-button" data-search-jump="category:&quot;${esc(c)}&quot;">${esc(c)}</button>`).join('')}${genres.slice(0,12).map(g=>`<button class="chip chip-button" data-search-jump="genre:&quot;${esc(g)}&quot;">${esc(g)}</button>`).join('')}</div><div class="metadata"><div><b>Author</b>${displayAuthor(m)?`<button class="inline-link" data-search-jump="author:&quot;${esc(displayAuthor(m))}&quot;">${esc(displayAuthor(m))}</button>`:'—'}</div><div><b>Artist</b>${displayArtist(m)?`<button class="inline-link" data-search-jump="artist:&quot;${esc(displayArtist(m))}&quot;">${esc(displayArtist(m))}</button>`:'—'}</div><div><b>Status</b>${esc(displayStatus(m))}</div><div><b>Progress</b>${readCount(m)} / ${m.chapters.length} read</div><div><b>Bookmarks</b>${bookmarkCount(m)}</div><div><b>Tracking</b>${m.tracking.length}</div></div><div class="detail-progress-wrap"><div class="coverage-bar"><i style="width:${pct}%"></i></div><b>${pct}% read</b></div><div class="detail-actions"><button class="danger-btn" data-delete-manga="${index}">Delete manga from backup</button></div></div></div>
      <div class="modal-tabs"><button class="modal-tab active" data-modal-tab="overview">Overview</button><button class="modal-tab" data-modal-tab="chapters">Chapters</button><button class="modal-tab" data-modal-tab="tracking">Tracking${m.tracking.length?` (${m.tracking.length})`:''}</button><button class="modal-tab" data-modal-tab="raw">Raw</button></div>
      <div class="modal-tab-panel" data-modal-panel="overview">${displayDescription(m)?`<p class="description">${esc(displayDescription(m))}</p>`:'<p class="muted">No description stored.</p>'}${m.notes?`<p class="description"><strong>Notes:</strong> ${esc(m.notes)}</p>`:''}<div class="detail-list"><div class="detail-item"><span>Source ID</span><strong>${esc(key64(m.source))}</strong></div><div class="detail-item"><span>Date added</span><strong>${asNum(m.dateAdded)?new Date(asNum(m.dateAdded)).toLocaleString():'—'}</strong></div><div class="detail-item"><span>Last read</span><strong>${lastRead(m)?new Date(lastRead(m)).toLocaleString():'—'}</strong></div><div class="detail-item"><span>Merged references</span><strong>${m.mergedMangaReferences.length}</strong></div></div></div>
      <div class="modal-tab-panel hidden" data-modal-panel="chapters"><div class="chapter-head"><h3>Chapters</h3><span class="muted">${m.chapters.length.toLocaleString()} total</span></div><div class="chapter-toolbar"><label class="searchbox"><span>⌕</span><input id="chapter-search" type="search" placeholder="Search chapter or scanlator"></label><select id="chapter-filter"><option value="all">All</option><option value="unread">Unread</option><option value="read">Read</option><option value="bookmarked">Bookmarked</option></select><select id="chapter-sort"><option value="number-desc">Newest number</option><option value="number-asc">Oldest number</option><option value="upload-desc">Newest upload</option><option value="upload-asc">Oldest upload</option><option value="source-desc">Source order ↓</option><option value="source-asc">Source order ↑</option></select></div><div id="chapter-result-meta" class="result-meta"></div><div id="chapter-list" class="chapter-list"></div></div>
      <div class="modal-tab-panel hidden" data-modal-panel="tracking"><div class="tracking-grid">${trackingHtml}</div></div><div class="modal-tab-panel hidden" data-modal-panel="raw"><pre class="raw-box">${esc(JSON.stringify(m,null,2))}</pre></div>`;
    $('#modal').classList.remove('hidden'); document.body.style.overflow='hidden'; renderChapterPanel();
  }

  function renderChapterPanel() {
    const m=state.data?.backupManga?.[state.modalMangaIndex]; const list=$('#chapter-list'); if(!m||!list)return;
    const q=normalizeText($('#chapter-search')?.value??state.chapterUi.search), filter=$('#chapter-filter')?.value||state.chapterUi.filter, sort=$('#chapter-sort')?.value||state.chapterUi.sort;
    state.chapterUi={search:q,filter,sort}; let chapters=[...m.chapters];
    if(q)chapters=chapters.filter(c=>normalizeText(`${c.name||''} ${c.scanlator||''}`).includes(q));
    if(filter==='unread')chapters=chapters.filter(c=>!c.read); if(filter==='read')chapters=chapters.filter(c=>c.read); if(filter==='bookmarked')chapters=chapters.filter(c=>c.bookmark);
    const num=c=>asNum(c.chapterNumber)||asNum(c.sourceOrder); const up=c=>asNum(c.dateUpload); const so=c=>asNum(c.sourceOrder);
    chapters.sort((a,b)=>sort==='number-asc'?num(a)-num(b):sort==='upload-desc'?up(b)-up(a):sort==='upload-asc'?up(a)-up(b):sort==='source-desc'?so(b)-so(a):sort==='source-asc'?so(a)-so(b):num(b)-num(a));
    const uploadIcon='<svg class="chapter-meta-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M5 14v5h14v-5"/></svg>', eyeIcon='<svg class="chapter-meta-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-5 9.5-5 9.5 5 9.5 5-3.4 5-9.5 5-9.5-5-9.5-5Z"/><circle cx="12" cy="12" r="2.6"/></svg>';
    const fmt=v=>{const n=asNum(v);if(!n)return'';const d=new Date(n);return Number.isNaN(d.getTime())?'':d.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});};
    list.innerHTML=chapters.map(c=>{const h=m.history.find(x=>x.url===c.url), uploaded=fmt(c.dateUpload), lr=fmt(h?.lastRead);return `<div class="chapter-row"><div class="chapter-main"><strong class="chapter-name">${esc(c.name||`Chapter ${c.chapterNumber??''}`)}</strong><div class="chapter-meta">${uploaded?`<span class="chapter-meta-item upload-meta">${uploadIcon}<span>${esc(uploaded)}</span></span>`:''}${lr?`<span class="chapter-meta-item read-meta">${eyeIcon}<span>${esc(lr)}</span></span>`:''}${c.scanlator?`<span class="chapter-meta-item"><span>Scanlator · ${esc(c.scanlator)}</span></span>`:''}${c.lastPageRead?`<span class="chapter-meta-item"><span>Page ${esc(c.lastPageRead)}</span></span>`:''}</div></div><div class="chapter-flags">${c.read?'<span class="flag read">Read</span>':'<span class="flag">Unread</span>'}${c.bookmark?'<span class="flag bookmark">★</span>':''}</div></div>`}).join('')||'<div class="empty-state">No chapters match.</div>';
    if($('#chapter-result-meta'))$('#chapter-result-meta').textContent=`${chapters.length.toLocaleString()} of ${m.chapters.length.toLocaleString()} chapters`;
  }

  function switchModalTab(name) {
    $$('.modal-tab').forEach(b=>b.classList.toggle('active',b.dataset.modalTab===name));
    $$('.modal-tab-panel').forEach(p=>p.classList.toggle('hidden',p.dataset.modalPanel!==name));
    if(name==='chapters') renderChapterPanel();
  }

  function closeModal() {
    $('#modal').classList.add('hidden');
    document.body.style.overflow = '';
    state.modalMangaIndex = null;
  }

  function setMobileMenu(open) {
    const btn = $('#mobile-menu-toggle');
    if (!btn) return;
    const mobile = window.matchMedia('(max-width: 1050px)').matches;
    const next = Boolean(open && mobile && state.data);
    document.body.classList.toggle('mobile-menu-open', next);
    btn.setAttribute('aria-expanded', String(next));
    btn.setAttribute('aria-label', next ? 'Close menu' : 'Open menu');
    btn.setAttribute('title', next ? 'Close menu' : 'Open menu');
    btn.textContent = next ? '×' : '☰';
  }

  function switchView(name) {
    if (!state.data) return;
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    ['dashboard','library','explore','analyze','tools'].forEach(v => $(`#${v}-panel`).classList.toggle('hidden', v !== name));
    if (name === 'dashboard') renderDashboard();
    if (name === 'library') applyFilters(false);
    if (name === 'explore') switchExploreTab(state.exploreTab);
    if (name === 'analyze') switchAnalysisTab(state.analysisTab);
    if (name === 'tools') { $('#debug-output').textContent = state.debug.join('\n'); renderBackupMetadata(); }
    saveSettings({lastView:name});
    setMobileMenu(false);
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function jumpToLibrary({ category = null, source = null } = {}) {
    if (category != null) $('#category-filter').value = category;
    if (source != null) $('#search-input').value = `source:"${source.replace(/"/g,'')}"`;
    state.quickFilter = '';
    updateQuickChipUi();
    switchView('library');
    applyFilters(true);
  }

  function jumpSearch(query) { $('#search-input').value=query; state.quickFilter=''; updateQuickChipUi(); switchView('library'); applyFilters(true); }

  function renderSearchPresets() {
    const el=$('#search-presets'); if(!el)return; const presets=asArray(state.settings.presets);
    el.innerHTML=presets.length?presets.map((x,i)=>`<button class="preset-chip" data-preset-index="${i}" title="${esc(x.query||'Saved filters')}">${esc(x.name)}</button>`).join(''):'<span class="muted preset-empty">No saved filter presets.</span>';
  }

  function saveSearchPreset() {
    if(!state.data)return; const name=prompt('Name this filter preset:'); if(!name)return;
    const preset={name:name.trim().slice(0,40)||'Preset',query:$('#search-input').value,category:$('#category-filter').value,status:$('#status-filter').value,read:$('#read-filter').value,sort:$('#sort-select').value,quick:state.quickFilter};
    const presets=[...asArray(state.settings.presets),preset].slice(-20); saveSettings({presets}); renderSearchPresets(); toast('Filter preset saved');
  }

  function applyPreset(i) { const x=asArray(state.settings.presets)[Number(i)]; if(!x)return; $('#search-input').value=x.query||''; $('#category-filter').value=x.category||'all'; $('#status-filter').value=x.status||'all'; $('#read-filter').value=x.read||'all'; $('#sort-select').value=x.sort||'title'; state.quickFilter=x.quick||''; updateQuickChipUi(); applyFilters(true); }

  function renderBackupMetadata() {
    const el=$('#backup-metadata'); if(!el)return; if(!state.data){el.innerHTML='<div class="muted">No backup loaded.</div>';return;} const m=state.primaryMeta||{};
    const rows=[['File',state.fileName],['File size',m.size!=null?formatBytes(m.size):'—'],['Format',m.format||'—'],['Decoded payload',m.decodedBytes!=null?formatBytes(m.decodedBytes):'—'],['Manga',state.data.backupManga.length.toLocaleString()],['Sources',state.data.backupSources.length.toLocaleString()],['Categories',state.data.backupCategories.length.toLocaleString()],['Schema','Komikku protobuf']];
    el.innerHTML=rows.map(([k,v])=>`<div class="detail-item"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');
  }

  function csvEscape(v){const s=String(v??'');return (s.includes('\"')||s.includes(',')||s.includes('\n'))?`\"${s.replace(/\"/g,'\"\"')}\"`:s;}
  function downloadCsv(rows,name){const text='\ufeff'+rows.map(r=>r.map(csvEscape).join(',')).join('\r\n');downloadBlob(new Blob([text],{type:'text/csv;charset=utf-8'}),name);}
  function exportLibraryCsv(){if(!state.data)return;const rows=[['Title','Author','Artist','Source','Status','Chapters','Read','Unread','Bookmarks','Trackers','Date Added','Last Read','URL']];state.data.backupManga.forEach(m=>rows.push([displayTitle(m),displayAuthor(m),displayArtist(m),sourceName(m),displayStatus(m),m.chapters.length,readCount(m),unreadCount(m),bookmarkCount(m),m.tracking.map(t=>trackerInfo(t.syncId).name).join(' | '),asNum(m.dateAdded)?new Date(asNum(m.dateAdded)).toISOString():'',lastRead(m)?new Date(lastRead(m)).toISOString():'',m.url||'']));downloadCsv(rows,datedName('kirin-library','csv'));}
  function healthRows(){const h=computeHealth();const rows=[['Issue','Count']];[['Missing title',h.issues.missingTitle.length],['Missing cover',h.issues.missingCover.length],['No chapters',h.issues.noChapters.length],['Unknown source',h.issues.unknownSource.length],['Broken category ref',h.issues.danglingCategory.length],['Strong duplicate groups',h.duplicateGroups]].forEach(x=>rows.push(x));return rows;}
  function exportHealthCsv(){downloadCsv(healthRows(),datedName('kirin-health','csv'));}
  function exportHealthJson(){const payload={file:state.fileName,health:computeHealth(),duplicates:computeDuplicates(),orphans:computeOrphans(),sourceHealth:sourceHealthRows()};downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),datedName('kirin-health','json'));}

  function openThemePicker(){updateThemeUi();$('#theme-modal').classList.remove('hidden');document.body.style.overflow='hidden';}
  function closeThemePicker(){ $('#theme-modal').classList.add('hidden'); if($('#modal').classList.contains('hidden')&&$('#report-modal').classList.contains('hidden'))document.body.style.overflow=''; }
  function setTheme(name){if(!(name in THEMES))return;saveSettings({theme:name});updateThemeUi();applyPremiumSettings();closeThemePicker();toast(`Theme: ${THEMES[name].name}`);}

  function applyPerformanceMode(){const mode=state.settings.performanceMode||'auto';const enabled=mode==='on'||(mode==='auto'&&((state.data?.backupManga?.length||0)>=5000||matchMedia('(max-width:680px)').matches));document.body.classList.toggle('performance-mode',enabled);}
  function lockViewer(){if(!state.data)return;setMobileMenu(false);document.body.classList.add('viewer-locked');$('#privacy-lock').classList.remove('hidden');document.body.style.overflow='hidden';}
  function unlockViewer(){document.body.classList.remove('viewer-locked');$('#privacy-lock').classList.add('hidden');document.body.style.overflow='';armAutoLock();}
  function armAutoLock(){clearTimeout(state.lockTimer);const min=Number(state.settings.autoLock||0);if(min>0&&state.data&&!document.body.classList.contains('viewer-locked'))state.lockTimer=setTimeout(lockViewer,min*60000);}

  function exportViewerSettings(){const payload={app:'Kirin Backup Viewer',version:VERSION,settings:state.settings};downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),'kirin-backup-viewer-settings.json');}
  async function importViewerSettings(file){if(!file)return;try{const obj=JSON.parse(await file.text());const incoming=obj.settings||obj;if(!incoming||typeof incoming!=='object')throw new Error('Invalid settings file');state.settings={...defaultSettings,...incoming};localStorage.setItem(SETTINGS_KEY,JSON.stringify(state.settings));applySavedSettings();if(state.data)applyFilters(true);toast('Viewer settings imported');}catch(e){toast(`Import failed: ${e.message}`);}finally{$('#settings-input').value='';}}

  async function installApp(){if(state.installPrompt){state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null;return;}toast('Use browser “Add to Home screen” if install is not offered.');}
  function registerPwa(){
    if('serviceWorker'in navigator){
      navigator.serviceWorker.register('./sw.js?v=155',{updateViaCache:'none'})
        .then(reg=>reg.update())
        .catch(e=>log(`Service worker: ${e.message}`));
    }
    window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.installPrompt=e;});
  }

  async function exportJson() {
    if (!state.data) return;
    const info = BACKUP_APPS[selectedFlavor()];
    downloadBlob(new Blob([JSON.stringify(state.data, null, 2)], {type:'application/json'}), datedName(info.exportBase, 'json'));
  }

  async function exportTachibk() {
    if (!state.data) return;
    try {
      const flavor = selectedFlavor();
      const info = BACKUP_APPS[flavor];
      const Backup = await ensureSchema(flavor);
      const verify = Backup.verify(Backup.fromObject(state.data));
      if (verify) log(`Verify warning: ${verify}`);
      const encoded = Backup.encode(Backup.fromObject(state.data)).finish();
      const zipped = window.pako?.gzip ? window.pako.gzip(encoded) : await gzipNative(encoded);
      downloadBlob(new Blob([zipped], {type:'application/octet-stream'}), datedName(info.exportBase, 'tachibk'));
      toast(`${info.name} .tachibk exported`);
    } catch (error) {
      console.error(error);
      log(`Export failed: ${error.message}`);
      toast(`Export failed: ${error.message}`);
    }
  }

  async function gzipNative(bytes) {
    if (!('CompressionStream' in window)) throw new Error('No GZIP encoder is available.');
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function exportDiff() {
    if (!state.diff) return;
    const payload = { currentBackup: state.fileName, comparisonBackup: state.compareFileName, ...state.diff };
    downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}), datedName('kirin-backup-diff','json'));
  }

  function openSummaryReport() {
    if (!state.data) return;
    const mangas=state.data.backupManga, health=computeHealth(), dup=computeDuplicates(), activity=getActivity();
    const chapters=mangas.reduce((n,m)=>n+m.chapters.length,0), unread=mangas.reduce((n,m)=>n+unreadCount(m),0), bookmarks=mangas.reduce((n,m)=>n+bookmarkCount(m),0);
    const sources=countValues(mangas.map(sourceName)).slice(0,10), genres=countValues(mangas.flatMap(displayGenres)).slice(0,10);
    $('#report-content').innerHTML = `<h1 id="report-title" class="report-title">Kirin Backup Summary</h1><p>${esc(state.fileName)} · generated ${new Date().toLocaleString()}</p><div class="report-grid"><div class="report-card"><strong>${mangas.length}</strong>Manga</div><div class="report-card"><strong>${chapters}</strong>Chapters</div><div class="report-card"><strong>${unread}</strong>Unread</div><div class="report-card"><strong>${health.score}%</strong>Health</div></div><div class="report-section"><h3>Backup health</h3><table class="report-table"><tr><th>Missing covers</th><td>${health.issues.missingCover.length}</td><th>Unknown sources</th><td>${health.issues.unknownSource.length}</td></tr><tr><th>No chapters</th><td>${health.issues.noChapters.length}</td><th>Strong duplicate groups</th><td>${dup.strong.length}</td></tr><tr><th>Bookmarks</th><td>${bookmarks}</td><th>Reading events</th><td>${activity.length}</td></tr></table></div><div class="report-section"><h3>Top sources</h3><table class="report-table">${sources.map(([n,c])=>`<tr><td>${esc(n)}</td><td>${c}</td></tr>`).join('')}</table></div><div class="report-section"><h3>Top genres</h3><table class="report-table">${genres.map(([n,c])=>`<tr><td>${esc(n)}</td><td>${c}</td></tr>`).join('')}</table></div>`;
    $('#report-modal').classList.remove('hidden'); document.body.style.overflow='hidden';
  }

  function closeReport() { $('#report-modal').classList.add('hidden'); document.body.style.overflow=''; }

  function datedName(base, ext) {
    const d = new Date();
    const stamp = [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
    return `${base}-${stamp}.${ext}`;
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`;
    return `${(n/1024/1024).toFixed(1)} MB`;
  }

  function formatDuration(ms) {
    const sec = Math.round(ms/1000); if (sec<60) return `${sec}s`; const min=Math.round(sec/60); if(min<60)return `${min}m`; return `${(min/60).toFixed(1)}h`;
  }


  function sourceMark(name='') {
    const words=String(name).replace(/[^a-z0-9]+/gi,' ').trim().split(/\s+/).filter(Boolean);
    return (words.length>1?words.slice(0,2).map(x=>x[0]).join(''):String(name).slice(0,2)).toUpperCase()||'?';
  }

  function applyPremiumSettings() {
    const s=state.settings;
    const root=document.documentElement;
    if(s.accentColor) root.style.setProperty('--accent',s.accentColor); else root.style.removeProperty('--accent');
    document.body.classList.toggle('surface-glass',s.surfaceStyle==='glass');
    document.body.classList.toggle('ambient-background',s.ambient==='on');
    document.body.classList.toggle('large-text',!!s.largeText);
    document.body.classList.toggle('high-contrast',!!s.highContrast);
    document.body.classList.toggle('reduced-motion',!!s.reducedMotion);
    if($('#accent-color-input')) $('#accent-color-input').value=s.accentColor||THEMES[state.settings.theme]?.meta||'#8499ff';
    if($('#theme-accent-input')) $('#theme-accent-input').value=s.accentColor||THEMES[state.settings.theme]?.meta||'#8499ff';
    if($('#surface-style-select')) $('#surface-style-select').value=s.surfaceStyle||'solid';
    if($('#theme-surface-select')) $('#theme-surface-select').value=s.surfaceStyle||'solid';
    if($('#ambient-select')) $('#ambient-select').value=s.ambient||'off';
    if($('#theme-ambient-select')) $('#theme-ambient-select').value=s.ambient||'off';
    if($('#large-text-toggle')) $('#large-text-toggle').checked=!!s.largeText;
    if($('#high-contrast-toggle')) $('#high-contrast-toggle').checked=!!s.highContrast;
    if($('#reduced-motion-toggle')) $('#reduced-motion-toggle').checked=!!s.reducedMotion;
    if($('#blur-hidden-toggle')) $('#blur-hidden-toggle').checked=!!s.blurOnHidden;
    updateVersionBadge();
  }

  function setAccent(value) { saveSettings({accentColor:value||''}); applyPremiumSettings(); updateThemeUi(); }
  function setSurface(value) { saveSettings({surfaceStyle:value}); applyPremiumSettings(); }
  function setAmbient(value) { saveSettings({ambient:value}); applyPremiumSettings(); }

  function setLoadStage(index,title) {
    const overlay=$('#backup-loading-overlay'); if(!overlay)return;
    overlay.classList.remove('hidden');
    $('#loading-stage-title').textContent=title||'Opening backup';
    $('#loading-progress-bar').style.width=`${Math.max(8,Math.min(100,(index+1)*20))}%`;
    $$('#loading-stage-list span').forEach((x,i)=>x.classList.toggle('active',i<=index));
  }
  function hideLoadProgress(){ $('#backup-loading-overlay')?.classList.add('hidden'); }

  function animateDashboardCounters() {
    $$('#dashboard-cards [data-animate-count]').forEach(el=>{
      const target=Number(el.dataset.animateCount)||0, suffix=el.dataset.suffix||'', duration=460, start=performance.now();
      const tick=now=>{const p=Math.min(1,(now-start)/duration), eased=1-Math.pow(1-p,3);el.textContent=Math.round(target*eased).toLocaleString()+suffix;if(p<1)requestAnimationFrame(tick);};
      requestAnimationFrame(tick);
    });
  }

  function sparklineSvg(values) {
    const vals=values.length?values:[0], max=Math.max(1,...vals), min=Math.min(0,...vals), span=Math.max(1,max-min), w=180,h=40;
    const pts=vals.map((v,i)=>`${vals.length===1?0:i/(vals.length-1)*w},${h-((v-min)/span)*(h-5)-2}`);
    const line=pts.join(' '), area=`0,${h} ${line} ${w},${h}`;
    return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polygon class="area" points="${area}"></polygon><polyline points="${line}"></polyline></svg>`;
  }

  function activityBuckets(days=14) {
    const out=Array(days).fill(0), today=new Date();today.setHours(0,0,0,0);
    getActivity().forEach(r=>{const diff=Math.floor((today-new Date(r.when).setHours(0,0,0,0))/DAY);if(diff>=0&&diff<days)out[days-1-diff]++;});
    return out;
  }
  function addedBuckets(months=12) {
    const now=new Date(), keys=[], map=new Map();
    for(let i=months-1;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);const k=`${d.getFullYear()}-${d.getMonth()}`;keys.push(k);map.set(k,0);}
    state.data.backupManga.forEach(m=>{const n=asNum(m.dateAdded);if(!n)return;const d=new Date(n),k=`${d.getFullYear()}-${d.getMonth()}`;if(map.has(k))map.set(k,map.get(k)+1);});
    return keys.map(k=>map.get(k));
  }

  function computeQualityScore() {
    const mangas=state.data?.backupManga||[], total=Math.max(1,mangas.length), dup=computeDuplicates();
    const dims={
      Covers:Math.round(mangas.filter(m=>displayCover(m)).length/total*100),
      Categories:Math.round(mangas.filter(m=>m.categories.length).length/total*100),
      Chapters:Math.round(mangas.filter(m=>m.chapters.length).length/total*100),
      Sources:Math.round(mangas.filter(m=>state.sourceMap.has(key64(m.source))).length/total*100),
      History:Math.round(mangas.filter(hasHistory).length/total*100),
      Tracking:Math.round(mangas.filter(m=>m.tracking.length).length/total*100),
      Uniqueness:Math.max(0,Math.round(100-(dup.strong.flat().length/total*100))),
    };
    const score=Math.round(dims.Covers*.12+dims.Categories*.08+dims.Chapters*.2+dims.Sources*.2+dims.History*.12+dims.Tracking*.08+dims.Uniqueness*.2);
    return {score,dims};
  }

  function trackerCoverage() {
    const mangas=state.data?.backupManga||[], tracked=mangas.filter(m=>m.tracking.length).length, by=new Map();
    mangas.forEach(m=>m.tracking.forEach(t=>{const n=trackerInfo(t.syncId).name;by.set(n,(by.get(n)||0)+1);}));
    return {tracked,total:mangas.length,pct:mangas.length?Math.round(tracked/mangas.length*100):0,by:[...by.entries()].sort((a,b)=>b[1]-a[1])};
  }

  function sourceReliabilityRows() {
    const map=new Map();
    state.data.backupManga.forEach(m=>{const name=sourceName(m),r=map.get(name)||{name,total:0,noChapters:0,noCover:0,unknown:0};r.total++;if(!m.chapters.length)r.noChapters++;if(!displayCover(m))r.noCover++;if(!state.sourceMap.has(key64(m.source)))r.unknown++;map.set(name,r);});
    return [...map.values()].map(r=>({...r,score:clamp(Math.round(100-(r.noChapters/r.total*45+r.noCover/r.total*15+r.unknown/r.total*60)),0,100)})).sort((a,b)=>b.total-a.total);
  }

  function readingPersona() {
    const mangas=state.data.backupManga, read=mangas.reduce((n,m)=>n+readCount(m),0), bookmarks=mangas.reduce((n,m)=>n+bookmarkCount(m),0), completed=mangas.filter(m=>(asNum(m.customStatus)||asNum(m.status))===2&&unreadCount(m)===0).length, activity=getActivity().length;
    if(activity>1000||read>5000)return {name:'Power Reader',desc:'A large amount of reading history and chapter progress is stored in this backup.'};
    if(bookmarks>Math.max(50,mangas.length*.2))return {name:'Curator',desc:'Bookmarks are used heavily across the library.'};
    if(completed>mangas.length*.35)return {name:'Completionist',desc:'A strong share of the library is fully read and completed.'};
    if(mangas.length>3000)return {name:'Archivist',desc:'This backup is dominated by a very large collected library.'};
    if(activity>mangas.length*.7)return {name:'Active Reader',desc:'Reading history is spread across a large portion of the library.'};
    return {name:'Library Explorer',desc:'A balanced mix of collecting, reading and tracking behavior.'};
  }

  function milestoneData() {
    const mangas=state.data.backupManga, chapters=mangas.reduce((n,m)=>n+m.chapters.length,0), read=mangas.reduce((n,m)=>n+readCount(m),0), tracked=mangas.filter(m=>m.tracking.length).length, events=getActivity().length;
    return [['1K Library',mangas.length>=1000,`${mangas.length.toLocaleString()} manga`],['10K Chapters',chapters>=10000,`${chapters.toLocaleString()} chapters`],['5K Read',read>=5000,`${read.toLocaleString()} read`],['500 Tracked',tracked>=500,`${tracked.toLocaleString()} tracked`],['1K Events',events>=1000,`${events.toLocaleString()} history events`],['100 Categories',state.data.backupCategories.length>=100,`${state.data.backupCategories.length} categories`]];
  }

  function healthRecommendations() {
    const h=computeHealth(), rec=[];
    if(h.issues.unknownSource.length)rec.push(['Source migration',`${h.issues.unknownSource.length.toLocaleString()} manga reference unknown sources.`,'Open Migration Assistant','migration']);
    if(h.issues.noChapters.length)rec.push(['Chapter completeness',`${h.issues.noChapters.length.toLocaleString()} manga have no stored chapter records. This can be normal when chapter backup was disabled or chapters were never fetched.`,'View Source Health','source-health']);
    if(h.issues.danglingCategory.length)rec.push(['Category repair',`${h.issues.danglingCategory.length.toLocaleString()} manga contain dangling category references.`,'Preview repair','repair']);
    if(h.duplicateGroups)rec.push(['Duplicates',`${h.duplicateGroups.toLocaleString()} strong duplicate groups found.`,'Review duplicates','duplicates']);
    if(h.issues.missingCover.length)rec.push(['Cover quality',`${h.issues.missingCover.length.toLocaleString()} manga have no stored cover URL.`,'Quality details','quality']);
    const fh=computeFeedHealth(); if(fh.structuralIssues)rec.push(['Feed integrity',`${fh.structuralIssues.toLocaleString()} structural feed issue${fh.structuralIssues===1?'':'s'} detected.`,'Open Feed Health','feed-health']);
    if(!rec.length)rec.push(['All clear','No high-priority consistency warning was detected.','Health check','health']);
    return rec;
  }

  function renderPremiumDashboard() {
    if(!state.data)return;
    const mangas=state.data.backupManga,h=computeHealth(),q=computeQualityScore(),tc=trackerCoverage(),sr=sourceReliabilityRows(),persona=readingPersona();
    const issues=h.integrityFlags;
    $('#smart-status-banner').innerHTML=`<div><strong>${h.score>=90?'Backup looks healthy':h.score>=70?'Backup needs a quick review':'Backup has important warnings'}</strong><small>${esc(BACKUP_APPS[selectedFlavor()].name)} · ${mangas.length.toLocaleString()} manga · ${issues.toLocaleString()} issue flags</small></div><span class="status-pill ${h.score>=90?'good':h.score>=70?'warn':''}">${h.score}% health</span>`;
    const cc=[['Health',`${h.score}%`,h.score>=90?'Clean':'Review',h.score>=90?'good':h.score>=70?'warn':'bad'],['Quality',`${q.score}%`,q.score>=85?'Premium':'Improve',q.score>=85?'good':'warn'],['Tracking',`${tc.pct}%`,`${tc.tracked.toLocaleString()} manga`,tc.pct>=30?'good':'warn'],['Sources',`${sr.filter(x=>x.score>=90).length}/${sr.length}`, 'Reliable',sr.some(x=>x.score<60)?'warn':'good'],['Duplicates',computeDuplicates().strong.length.toLocaleString(),'Strong groups',computeDuplicates().strong.length?'warn':'good']];
    $('#command-center').innerHTML=cc.map(x=>`<div class="command-status ${x[3]}"><b>${x[0]}</b><strong>${x[1]}</strong><small>${x[2]}</small></div>`).join('');
    $('#backup-vault').innerHTML=[['Application',BACKUP_APPS[selectedFlavor()].name],['File',state.fileName],['Size',formatBytes(state.primaryMeta?.size||0)],['Format',state.primaryMeta?.format||'—'],['Opened',new Date().toLocaleString()],['Comparison',state.compareData?state.compareFileName:'Not loaded']].map(x=>`<div class="detail-item"><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong></div>`).join('');
    const a=activityBuckets(14), growth=addedBuckets(12), unread=mangas.map(unreadCount).sort((a,b)=>b-a).slice(0,20).reverse();
    $('#dashboard-mini-charts').innerHTML=[['Reading · 14d',a,a.reduce((x,y)=>x+y,0).toLocaleString()],['Library growth · 12m',growth,growth.reduce((x,y)=>x+y,0).toLocaleString()],['Unread spread',unread,Math.max(0,...unread).toLocaleString()]].map(([n,v,t])=>`<div class="mini-chart-row"><span>${esc(n)}</span>${sparklineSvg(v)}<strong>${t}</strong></div>`).join('');
    $('#dashboard-quality').innerHTML=`<div class="quality-ring-wrap"><div class="quality-ring" style="--score:${q.score}"><strong>${q.score}%</strong></div><div><b>${q.score>=90?'Excellent metadata quality':q.score>=75?'Good library quality':'Quality can improve'}</b><p class="muted">Covers ${q.dims.Covers}% · Sources ${q.dims.Sources}% · Unique ${q.dims.Uniqueness}%</p></div></div>`;
    $('#dashboard-tracker-coverage').innerHTML=`<div class="tracker-coverage-layout"><div class="coverage-ring" style="--score:${tc.pct}"><strong>${tc.pct}%</strong></div><div><b>${tc.tracked.toLocaleString()} of ${tc.total.toLocaleString()} manga tracked</b><div class="brand-list section-spacer-small">${tc.by.slice(0,4).map(([n,c])=>`<div class="brand-row"><span class="brand-logo">${esc(trackerInfoByName(n).mark)}</span><div><b>${esc(n)}</b><small>${c.toLocaleString()} manga</small></div><strong>${Math.round(c/Math.max(1,mangas.length)*100)}%</strong></div>`).join('')||'<span class="muted">No tracking entries.</span>'}</div></div></div>`;
    $('#dashboard-source-reliability').innerHTML=`<div class="brand-list">${sr.slice(0,5).map(r=>`<div class="brand-row"><span class="source-logo">${esc(sourceMark(r.name))}</span><div><b>${esc(r.name)}</b><small>${r.total.toLocaleString()} manga</small></div><strong>${r.score}%</strong></div>`).join('')||'<span class="muted">No source data.</span>'}</div>`;
    $('#dashboard-persona').innerHTML=`<div class="persona-card"><span class="eyebrow">READING PROFILE</span><strong>${esc(persona.name)}</strong><p>${esc(persona.desc)}</p></div>`;
    $('#dashboard-milestones').innerHTML=milestoneData().map(([n,ok,s])=>`<div class="milestone ${ok?'unlocked':''}"><b>${ok?'✓':'○'} ${esc(n)}</b><small>${esc(s)}</small></div>`).join('');
    renderTopListCards(); applyDashboardWidgetSettings(); animateDashboardCounters();
  }

  function trackerInfoByName(name){for(const k of Object.keys(TRACKERS))if(TRACKERS[k].name===name)return TRACKERS[k];return {mark:sourceMark(name)};}

  function topListDefinitions(){
    const ms=[...state.data.backupManga];
    return [
      ['Most Read','read',[...ms].sort((a,b)=>readCount(b)-readCount(a)),m=>`${readCount(m).toLocaleString()} read`],
      ['Most Unread','unread',[...ms].sort((a,b)=>unreadCount(b)-unreadCount(a)),m=>`${unreadCount(m).toLocaleString()} unread`],
      ['Oldest Added','oldest',[...ms].filter(m=>asNum(m.dateAdded)).sort((a,b)=>asNum(a.dateAdded)-asNum(b.dateAdded)),m=>new Date(asNum(m.dateAdded)).toLocaleDateString()],
      ['Newest Added','newest',[...ms].filter(m=>asNum(m.dateAdded)).sort((a,b)=>asNum(b.dateAdded)-asNum(a.dateAdded)),m=>new Date(asNum(m.dateAdded)).toLocaleDateString()],
      ['Most Chapters','chapters',[...ms].sort((a,b)=>b.chapters.length-a.chapters.length),m=>`${m.chapters.length.toLocaleString()} chapters`],
      ['Most Bookmarked','bookmarks',[...ms].sort((a,b)=>bookmarkCount(b)-bookmarkCount(a)),m=>`${bookmarkCount(m).toLocaleString()} bookmarks`],
    ];
  }
  function renderTopListCards(){const el=$('#dashboard-top-lists');if(!el)return;el.innerHTML=topListDefinitions().map(([name,key,arr,fmt])=>{const m=arr[0];return `<button class="top-list-card" data-top-list="${key}"><strong>${esc(name)}</strong><small>${m?`${esc(displayTitle(m))} · ${esc(fmt(m))}`:'No data'}</small></button>`}).join('');}
  function openTopList(key){const def=topListDefinitions().find(x=>x[1]===key);if(!def)return;const [name,,arr,fmt]=def;openGenericModal(`<div class="eyebrow">TOP 10</div><h2 id="modal-title">${esc(name)}</h2><div class="top-ranking-list">${arr.slice(0,10).map((m,i)=>`<button class="card-hit top-ranking-row" data-manga-index="${state.data.backupManga.indexOf(m)}"><span>${i+1}</span><div><strong>${esc(displayTitle(m))}</strong><small>${esc(sourceName(m))}</small></div><strong>${esc(fmt(m))}</strong></button>`).join('')}</div>`);}

  function applyDashboardWidgetSettings(){
    const pinned=new Set(Array.isArray(state.settings.pinnedWidgets)?state.settings.pinnedWidgets:Object.keys(DASHBOARD_WIDGETS));
    const order=Array.isArray(state.settings.widgetOrder)?state.settings.widgetOrder:Object.keys(DASHBOARD_WIDGETS);
    $$('#premium-dashboard-grid [data-dashboard-widget]').forEach(el=>{const k=el.dataset.dashboardWidget;el.classList.toggle('hidden',!pinned.has(k));el.style.order=String(Math.max(0,order.indexOf(k)));});
  }
  function openDashboardCustomizer(){
    const pinned=new Set(state.settings.pinnedWidgets||Object.keys(DASHBOARD_WIDGETS));
    openGenericModal(`<div class="eyebrow">DASHBOARD</div><h2 id="modal-title">Customize widgets</h2><p class="muted">Pin the widgets you want. Drag visible widgets directly on the dashboard to reorder them.</p><div class="widget-manager">${Object.entries(DASHBOARD_WIDGETS).map(([k,n])=>`<label class="widget-manager-row"><span><strong>${esc(n)}</strong><small>${pinned.has(k)?'Visible':'Hidden'}</small></span><input type="checkbox" data-widget-toggle="${k}" ${pinned.has(k)?'checked':''}></label>`).join('')}</div>`);
  }
  function toggleDashboardWidget(key,on){const set=new Set(state.settings.pinnedWidgets||Object.keys(DASHBOARD_WIDGETS));if(on)set.add(key);else set.delete(key);saveSettings({pinnedWidgets:[...set]});applyDashboardWidgetSettings();}
  function reorderDashboardWidgets(from,to){let order=[...(state.settings.widgetOrder||Object.keys(DASHBOARD_WIDGETS))];const a=order.indexOf(from),b=order.indexOf(to);if(a<0||b<0||a===b)return;order.splice(a,1);order.splice(b,0,from);saveSettings({widgetOrder:order});applyDashboardWidgetSettings();}

  function notificationKey(n){return n.id||`${n.title}|${n.text}|${n.tab||''}`;}

  function buildNotifications(){
    if(!state.data){
      state.notifications=[];
      state.notificationUnread=0;
      state.notificationSignature='';
      renderNotifications();
      return;
    }

    const h=computeHealth(),q=computeQualityScore(),notes=[];
    notes.push({id:'health',type:h.score>=90?'good':'warn',title:`Backup health ${h.score}%`,text:h.score>=90?'No major consistency issue detected.':'Open Health Check for recommended review.',tab:'health'});
    if(h.issues.unknownSource.length)notes.push({id:'unknown-sources',type:'bad',title:'Unknown sources',text:`${h.issues.unknownSource.length.toLocaleString()} manga may need migration.`,tab:'migration'});
    if(computeDuplicates().strong.length)notes.push({id:'duplicates',type:'warn',title:'Duplicate groups',text:`${computeDuplicates().strong.length.toLocaleString()} strong duplicate groups detected.`,tab:'duplicates'});
    if(q.score<80)notes.push({id:'quality',type:'warn',title:'Library quality',text:`Quality score is ${q.score}%. Review missing metadata.`,tab:'quality'});
    const feedHealth=computeFeedHealth(); if(feedHealth.structuralIssues)notes.push({id:'feed-health',type:'bad',title:'Feed integrity',text:`${feedHealth.structuralIssues.toLocaleString()} structural feed issue${feedHealth.structuralIssues===1?'':'s'} detected.`,tab:'feed-health'});
    if(state.compareData)notes.push({id:'comparison',type:'good',title:'Comparison ready',text:`Compared against ${state.compareFileName}.`,tab:'compare'});

    state.notifications=notes.filter(n=>!state.dismissedNotifications.has(notificationKey(n)));
    state.notificationSignature=state.notifications.map(notificationKey).join('||');

    // Unread is based on notification IDs that have never been seen.
    // Rebuilding the same Health/Quality notifications will NOT revive the red badge.
    state.notificationUnread=state.notifications.reduce(
      (count,n)=>count+(state.seenNotificationKeys.has(notificationKey(n))?0:1),0
    );
    renderNotifications();
  }

  function renderNotifications(){
    const list=$('#notification-list'),count=$('#notification-count');if(!list||!count)return;
    const notes=state.notifications||[];

    count.textContent=String(state.notificationUnread||0);
    count.classList.toggle('hidden',!(state.notificationUnread>0));

    list.innerHTML=notes.length
      ?notes.map((n,i)=>`<div class="notification-item ${n.type||''}">
          <button class="notification-main" type="button" data-notification-index="${i}" aria-label="Open ${esc(n.title)}">
            <strong>${esc(n.title)}</strong><small>${esc(n.text)}</small>
          </button>
          <button class="notification-dismiss" type="button" data-dismiss-notification="${i}" title="Delete notification" aria-label="Delete ${esc(n.title)} notification"><span class="notification-x-glyph" aria-hidden="true">×</span></button>
        </div>`).join('')
      :'<div class="empty-state compact-empty"><strong>All caught up</strong><br><span>No notifications.</span></div>';
  }

  function markCurrentNotificationsRead(){
    (state.notifications||[]).forEach(n=>state.seenNotificationKeys.add(notificationKey(n)));
    state.notificationUnread=0;
    state.notificationSeenSignature=state.notificationSignature;
    renderNotifications();
  }

  function syncDrawerBackdrop(){
    const notificationOpen=!$('#notification-drawer').classList.contains('hidden');
    const previewOpen=!$('#quick-preview-drawer').classList.contains('hidden');
    $('#drawer-backdrop')?.classList.toggle('hidden',!(notificationOpen||previewOpen));
  }

  function toggleNotifications(open){
    const drawer=$('#notification-drawer');
    if(open){
      closeQuickPreview();
      drawer.classList.remove('hidden');
      // Requirement: red badge disappears immediately after pressing notification.
      markCurrentNotificationsRead();
    }else{
      drawer.classList.add('hidden');
    }
    syncDrawerBackdrop();
  }

  function dismissNotification(index){
    const i=Number(index),n=state.notifications?.[i];if(!n)return;
    const key=notificationKey(n);
    state.dismissedNotifications.add(key);
    state.seenNotificationKeys.add(key);
    state.notifications.splice(i,1);
    state.notificationSignature=state.notifications.map(notificationKey).join('||');
    state.notificationUnread=state.notifications.reduce(
      (count,item)=>count+(state.seenNotificationKeys.has(notificationKey(item))?0:1),0
    );
    renderNotifications();
  }

  function clearAllNotifications(){
    (state.notifications||[]).forEach(n=>{
      const key=notificationKey(n);
      state.dismissedNotifications.add(key);
      state.seenNotificationKeys.add(key);
    });
    state.notifications=[];
    state.notificationSignature='';
    state.notificationSeenSignature='';
    state.notificationUnread=0;
    renderNotifications();
    toast('All notifications cleared');
  }

  function openQuickPreview(index){
    const m=state.data?.backupManga?.[Number(index)];if(!m)return;
    $('#notification-drawer').classList.add('hidden');
    state.previewMangaIndex=Number(index);
    const cover=displayCover(m),pct=m.chapters.length?Math.round(readCount(m)/m.chapters.length*100):0;
    $('#quick-preview-content').innerHTML=`<div class="quick-preview-hero" style="--quick-cover:${cover?`url('${esc(cover).replace(/'/g,'&#39;')}')`:'linear-gradient(135deg,var(--surface2),var(--surface3))'}"><div><span>${esc(sourceName(m))}</span><h3>${esc(displayTitle(m))}</h3><small>${esc(displayStatus(m))}</small></div></div><div class="quick-preview-stats"><div><strong>${m.chapters.length}</strong><small>Chapters</small></div><div><strong>${unreadCount(m)}</strong><small>Unread</small></div><div><strong>${m.tracking.length}</strong><small>Trackers</small></div></div><div class="coverage-bar"><i style="width:${pct}%"></i></div><p class="muted">${esc((displayDescription(m)||'No description stored.').slice(0,400))}</p><div class="quick-preview-actions"><button class="primary-btn" data-open-preview-details="${index}">Open full details</button><button class="danger-btn" data-delete-manga="${index}">Delete manga</button></div>`;
    $('#quick-preview-drawer').classList.remove('hidden');
    syncDrawerBackdrop();
  }
  function closeQuickPreview(){state.previewMangaIndex=null;$('#quick-preview-drawer').classList.add('hidden');syncDrawerBackdrop();}

  function refreshAfterBackupMutation(message='Backup updated'){
    state.cache={health:null,duplicates:null,activity:null,searchIndex:null};
    state.repairPlan=null;
    buildIndexes();
    populateFilters();
    applyFilters(true);
    renderDashboard();
    renderBackupMetadata();
    if(state.compareData){
      state.diff=compareBackups(state.data,state.compareData);
      if(!$('#analysis-compare').classList.contains('hidden'))renderComparison();
    }
    if(!$('#explore-panel').classList.contains('hidden'))switchExploreTab(state.exploreTab);
    if(!$('#analyze-panel').classList.contains('hidden'))switchAnalysisTab(state.analysisTab);
    buildNotifications();
    toast(message);
  }

  function deleteMangaAt(index){
    const i=Number(index),m=state.data?.backupManga?.[i];if(!m)return;
    if(!confirm(`Delete "${displayTitle(m)}" from the backup currently loaded in memory?\n\nThe original backup file is not changed unless you export a new backup.`))return;
    state.data.backupManga.splice(i,1);
    closeQuickPreview();
    closeModal();
    refreshAfterBackupMutation('Manga removed from loaded backup');
  }

  function deleteFilteredManga(){
    if(!state.data)return;
    const items=[...state.filtered];
    if(!items.length){toast('No filtered manga to delete');return;}
    if(!confirm(`Delete ${items.length.toLocaleString()} currently filtered manga from the loaded backup?\n\nThe original file stays unchanged until you export a new backup.`))return;
    const remove=new Set(items);
    state.data.backupManga=state.data.backupManga.filter(m=>!remove.has(m));
    refreshAfterBackupMutation(`${items.length.toLocaleString()} filtered manga removed`);
  }

  function deleteAllManga(){
    if(!state.data)return;
    const count=state.data.backupManga.length;
    if(!count){toast('No manga to delete');return;}
    if(!confirm(`Delete ALL ${count.toLocaleString()} manga from the backup currently loaded in memory?\n\nThis cannot be undone inside this session. Your original backup file remains unchanged unless you export a new backup.`))return;
    state.data.backupManga=[];
    closeQuickPreview();
    closeModal();
    refreshAfterBackupMutation('All manga removed from loaded backup');
  }

  function commandDefinitions(){return [
    ['Dashboard','⌂','Open Command Dashboard',()=>switchView('dashboard'),'D'],['Library','▦','Browse the library',()=>switchView('library'),'G'],['Explore','⌘','Open Backup Explorer',()=>switchView('explore'),'E'],['Analyze','◎','Open Backup Analyzer',()=>switchView('analyze'),'A'],['Tools','⚙','Open Backup Tools',()=>switchView('tools'),'T'],['Health Check','♥','Analyze backup health',()=>{switchView('analyze');switchAnalysisTab('health');},''],['Migration Assistant','↗','Review source migration candidates',()=>{switchView('analyze');switchAnalysisTab('migration');},''],['Quality Score','◇','Review library quality',()=>{switchView('analyze');switchAnalysisTab('quality');},''],['Compare Backups','⇄','Compare another backup',()=>{switchView('analyze');switchAnalysisTab('compare');},''],['Export Premium Report','↧','Download standalone HTML report',exportPremiumReport,''],['Theme / Appearance','◐','Theme, accent and surface',openThemePicker,''],['Focus Mode','□','Library-only distraction free mode',toggleFocusMode,'F'],['Presentation Mode','▶','Full-screen style dashboard',togglePresentationMode,'P'],['Notifications','♢','Open status center',()=>toggleNotifications(true),''],['What’s New','✦','Show v1.5.0 changes',openWhatsNew,''],['About','i','Project and privacy information',openAbout,''],
  ];}
  function getCommandResults(q=''){
    const query=normalizeText(q),res=[];
    commandDefinitions().forEach((x,i)=>{if(!query||normalizeText(`${x[0]} ${x[2]}`).includes(query))res.push({kind:'command',title:x[0],sub:x[2],icon:x[1],action:x[3],key:x[4]});});
    if(state.data){state.data.backupManga.forEach((m,i)=>{if(res.length>40)return;const text=normalizeText(`${displayTitle(m)} ${displayAuthor(m)} ${sourceName(m)} ${displayGenres(m).join(' ')}`);if(query&&text.includes(query))res.push({kind:'manga',title:displayTitle(m),sub:`${sourceName(m)} · ${m.chapters.length} chapters`,icon:'M',action:()=>showManga(i),key:''});});
      [...state.categoryMap.values()].forEach(c=>{if(query&&normalizeText(c.name).includes(query))res.push({kind:'category',title:c.name,sub:'Category',icon:'C',action:()=>{const id=[...state.categoryMap.entries()].find(([,v])=>v===c)?.[0];jumpToLibrary({category:id});},key:''});});
      [...new Set(state.data.backupManga.map(sourceName))].forEach(n=>{if(query&&normalizeText(n).includes(query))res.push({kind:'source',title:n,sub:'Source',icon:sourceMark(n),action:()=>jumpToLibrary({source:n}),key:''});});}
    return res.slice(0,50);
  }
  function renderCommandPalette(){const q=$('#command-input')?.value||'';state.commandResults=getCommandResults(q);state.commandIndex=clamp(state.commandIndex,0,Math.max(0,state.commandResults.length-1));$('#command-results').innerHTML=state.commandResults.length?state.commandResults.map((r,i)=>`<button class="command-result ${i===state.commandIndex?'active':''}" data-command-index="${i}"><span class="command-result-icon">${esc(r.icon)}</span><span><strong>${esc(r.title)}</strong><small>${esc(r.sub)}</small></span>${r.key?`<kbd>${esc(r.key)}</kbd>`:''}</button>`).join(''):'<div class="empty-state">No result.</div>';}
  function openCommandPalette(){state.commandIndex=0;$('#command-palette').classList.remove('hidden');$('#command-input').value='';renderCommandPalette();setTimeout(()=>$('#command-input').focus(),0);}
  function closeCommandPalette(){$('#command-palette').classList.add('hidden');}
  function runCommandIndex(i){const r=state.commandResults[Number(i)];if(!r)return;closeCommandPalette();r.action();}

  function toggleFocusMode(){if(!state.data)return;const on=!document.body.classList.contains('focus-mode');document.body.classList.toggle('focus-mode',on);$('#focus-exit').classList.toggle('hidden',!on);if(on){switchView('library');toast('Focus Mode on');}else toast('Focus Mode off');}
  function togglePresentationMode(){if(!state.data)return;const on=!document.body.classList.contains('presentation-mode');document.body.classList.toggle('presentation-mode',on);$('#presentation-exit').classList.toggle('hidden',!on);if(on){switchView('dashboard');toast('Presentation Mode on');}else toast('Presentation Mode off');}

  function renderCompareTimeline(){const d=state.diff,el=$('#compare-timeline');if(!d||!el)return;el.innerHTML=`<div class="timeline-segment"><span>Current backup</span><strong>${d.currentCount.toLocaleString()} manga</strong></div><div class="timeline-segment"><span>Changes detected</span><strong>${(d.added.length+d.removed.length+d.changed.length).toLocaleString()}</strong></div><div class="timeline-segment"><span>Comparison backup</span><strong>${d.compareCount.toLocaleString()} manga</strong></div>`;el.classList.remove('hidden');}

  function renderMigrationAssistant(){const unknown=new Map(),noChapters=[];state.data.backupManga.forEach((m,i)=>{if(!state.sourceMap.has(key64(m.source))){const k=key64(m.source)||'Unknown';const arr=unknown.get(k)||[];arr.push({m,i});unknown.set(k,arr);}if(!m.chapters.length)noChapters.push({m,i});});const rows=[...unknown.entries()].sort((a,b)=>b[1].length-a[1].length);$('#migration-summary').innerHTML=[['Unknown source IDs',rows.length],['Affected manga',rows.reduce((n,x)=>n+x[1].length,0)],['No chapter data',noChapters.length],['Known sources',state.sourceMap.size]].map(([k,v])=>`<div class="stat-card"><strong>${Number(v).toLocaleString()}</strong><span>${esc(k)}</span></div>`).join('');$('#migration-list').innerHTML=rows.length?rows.map(([id,items])=>`<div class="duplicate-group"><h4>Source ID ${esc(id)}</h4><p class="muted">${items.length.toLocaleString()} manga may require source migration.</p><div class="duplicate-items">${items.slice(0,10).map(x=>`<button class="diff-row diff-button" data-manga-index="${x.i}">${esc(displayTitle(x.m))}</button>`).join('')}${items.length>10?`<div class="muted">+ ${items.length-10} more</div>`:''}</div></div>`).join(''):'<div class="empty-state">No unknown source IDs. Source references look consistent.</div>';}
  function exportMigrationCsv(){const rows=[['Source ID','Stored Source','Title','Manga URL','Chapters']];state.data.backupManga.forEach(m=>{if(!state.sourceMap.has(key64(m.source)))rows.push([key64(m.source),sourceName(m),displayTitle(m),m.url||'',m.chapters.length]);});downloadCsv(rows,datedName('kirin-migration-report','csv'));}

  function renderQualityAnalysis(){const q=computeQualityScore();$('#quality-hero').innerHTML=`<div class="health-summary"><div class="health-hero"><div class="health-big ${q.score>=90?'good':q.score>=75?'warn':'bad'}">${q.score}%</div><div><h3>${q.score>=90?'Excellent library quality':q.score>=75?'Good quality with room to improve':'Metadata quality needs attention'}</h3><p class="muted">A local quality score based on covers, categories, chapters, valid sources, history, tracking and duplicate consistency.</p></div></div></div>`;$('#quality-dimensions').innerHTML=Object.entries(q.dims).map(([k,v])=>`<div class="issue-card" data-severity="${v>=90?'ok':v>=70?'warn':'bad'}"><strong>${v}%</strong><span>${esc(k)}</span></div>`).join('');$('#health-recommendations').innerHTML=`<h3>Recommendations</h3>`+healthRecommendations().map(([n,t,a,tab])=>`<button class="recommendation-row" data-analysis-tab="${tab}"><span class="rec-icon">→</span><span><b>${esc(n)}</b><small>${esc(t)}</small></span><strong>${esc(a)}</strong></button>`).join('');}

  function renderYearReview(){const sel=$('#year-review-select'),content=$('#year-review-content');if(!sel||!content)return;const act=getActivity(),years=[...new Set(act.map(x=>new Date(x.when).getFullYear()).filter(Boolean))].sort((a,b)=>b-a);if(!years.length){sel.innerHTML='<option>No history</option>';content.innerHTML='<div class="empty-state">No reading history available.</div>';return;}const prev=Number(sel.value);sel.innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');sel.value=years.includes(prev)?String(prev):String(years[0]);const year=Number(sel.value),rows=act.filter(x=>new Date(x.when).getFullYear()===year),unique=new Set(rows.map(x=>x.mangaIndex)),duration=rows.reduce((n,x)=>n+x.duration,0),months=Array(12).fill(0);rows.forEach(x=>months[new Date(x.when).getMonth()]++);const max=Math.max(1,...months),top=[...unique].map(i=>state.data.backupManga[i]).sort((a,b)=>readCount(b)-readCount(a)).slice(0,5);content.innerHTML=`<div class="year-review-hero">${[['Reading events',rows.length],['Manga touched',unique.size],['Read duration',duration?formatDuration(duration):'—'],['Peak month',new Date(year,months.indexOf(max),1).toLocaleString(undefined,{month:'long'})]].map(([k,v])=>`<div class="stat-card"><strong>${typeof v==='number'?v.toLocaleString():esc(v)}</strong><span>${esc(k)}</span></div>`).join('')}</div><div class="year-review-months">${months.map((c,i)=>`<div class="year-review-month"><i style="height:${Math.max(3,c/max*100)}%" title="${c} events"></i><span>${new Date(2000,i,1).toLocaleString(undefined,{month:'narrow'})}</span></div>`).join('')}</div><h3 class="section-spacer">Top manga in ${year}</h3><div class="mini-list">${top.map(m=>`<button class="card-hit" data-manga-index="${state.data.backupManga.indexOf(m)}"><div class="mini-row">${coverHtml(m,'mini-thumb')}<div><strong>${esc(displayTitle(m))}</strong><small>${esc(sourceName(m))}</small></div><small>${readCount(m)} read</small></div></button>`).join('')}</div>`;}

  function openGenericModal(html){$('#modal-content').innerHTML=html;$('#modal').classList.remove('hidden');document.body.style.overflow='hidden';state.modalMangaIndex=null;}
  function openAbout(){openGenericModal(`<div class="eyebrow">ABOUT</div><h2 id="modal-title">Kirin Backup Viewer v${VERSION}</h2><div class="detail-list"><div class="detail-item"><span>Supported apps</span><strong>Komikku + Mihon</strong></div><div class="detail-item"><span>Processing</span><strong>Client-side</strong></div><div class="detail-item"><span>App type</span><strong>Static PWA</strong></div><div class="detail-item"><span>License</span><strong>GPL-2.0</strong></div><div class="detail-item"><span>Offline status</span><strong id="about-offline">${navigator.serviceWorker?.controller?'Service worker active':'Needs initial online load'}</strong></div></div><p class="muted">Backup contents are decoded in this browser tab. No custom backend is required for viewer operation.</p><a class="primary-btn inline-button-link" href="https://github.com/Lanzkila/Komikku-Viewers" target="_blank" rel="noopener">GitHub repository ↗</a>`);}
  function openWhatsNew(){saveSettings({seenVersion:VERSION});updateVersionBadge();openGenericModal(`<div class="eyebrow">WHAT'S NEW</div><h2 id="modal-title">v${VERSION} Premium Suite</h2><div class="list-stack">${CHANGELOG_SUMMARY.map(x=>`<div class="recommendation-row"><span class="rec-icon">✦</span><span><b>${esc(x)}</b><small>Added in v${VERSION}</small></span></div>`).join('')}</div>`);}
  function updateVersionBadge(){const b=$('#version-badge');if(b)b.classList.toggle('seen-version',state.settings.seenVersion===VERSION);}
  function openShortcuts(){openGenericModal(`<div class="eyebrow">KEYBOARD</div><h2 id="modal-title">Shortcuts</h2><div class="detail-list">${[['Command palette','Ctrl + K'],['Universal search','Ctrl + K, then type'],['Library search','/'],['Dashboard / Library','D / G'],['Explore / Analyze / Tools','E / A / T'],['Focus Mode','F'],['Presentation Mode','P'],['Shortcut overlay','?'],['Close overlay','Esc']].map(([k,v])=>`<div class="detail-item"><span>${k}</span><strong>${v}</strong></div>`).join('')}</div>`);}

  function premiumReportHtml(safe=false){const mangas=state.data.backupManga,h=computeHealth(),q=computeQualityScore(),tc=trackerCoverage(),persona=readingPersona(),sources=sourceReliabilityRows().slice(0,10),tops=topListDefinitions();const css=`body{font-family:system-ui;margin:0;background:#f4f6fa;color:#1b2333}.wrap{max-width:1100px;margin:auto;padding:40px}.hero{background:#101726;color:white;border-radius:24px;padding:32px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}.card{background:white;border:1px solid #dde3ed;border-radius:16px;padding:18px}.card strong{font-size:28px;display:block}table{width:100%;border-collapse:collapse;background:white}td,th{padding:10px;border-bottom:1px solid #e5e8ef;text-align:left}.muted{color:#67748b}@media(max-width:700px){.grid{grid-template-columns:1fr 1fr}.wrap{padding:18px}}`;const totalCh=mangas.reduce((n,m)=>n+m.chapters.length,0),read=mangas.reduce((n,m)=>n+readCount(m),0);return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Kirin ${safe?'Share-safe ':'Premium '}Report</title><style>${css}</style></head><body><div class="wrap"><div class="hero"><small>KIRIN BACKUP VIEWER · v${VERSION}</small><h1>${safe?'Share-safe Backup Report':'Premium Backup Report'}</h1><p>${safe?'Sanitized summary with internal URLs and source IDs omitted.':esc(state.fileName)} · ${new Date().toLocaleString()}</p></div><div class="grid">${[['Manga',mangas.length],['Chapters',totalCh],['Read',read],['Health',h.score+'%'],['Quality',q.score+'%'],['Tracked',tc.pct+'%'],['Sources',sources.length],['Persona',persona.name]].map(([k,v])=>`<div class="card"><strong>${v}</strong><span>${k}</span></div>`).join('')}</div><h2>Top sources</h2><table>${sources.map(r=>`<tr><td>${safe?'Source '+sourceMark(r.name):esc(r.name)}</td><td>${r.total} manga</td><td>${r.score}% reliability</td></tr>`).join('')}</table><h2>Top rankings</h2>${tops.map(([name,,arr,fmt])=>`<div class="card"><h3>${name}</h3><ol>${arr.slice(0,5).map(m=>`<li>${esc(displayTitle(m))} <span class="muted">${esc(fmt(m))}</span></li>`).join('')}</ol></div>`).join('')}<p class="muted">Generated locally by Kirin Backup Viewer. ${safe?'No manga/source URLs or raw source IDs are included.':''}</p></div></body></html>`;}
  function exportPremiumReport(){if(!state.data){toast('Open a backup first');return;}downloadBlob(new Blob([premiumReportHtml(false)],{type:'text/html'}),datedName('kirin-premium-report','html'));}
  function exportShareSafeReport(){if(!state.data){toast('Open a backup first');return;}downloadBlob(new Blob([premiumReportHtml(true)],{type:'text/html'}),datedName('kirin-share-safe-report','html'));}

  async function updatePwaStatus(){let core=false,full=false;try{if('caches'in window){const keys=await caches.keys();const hasCache=keys.some(k=>k.includes('kirin-backup'));const coreHit=await caches.match('./assets/js/app.js');const longHit=await caches.match('https://cdn.jsdelivr.net/npm/long@5.2.3/umd/index.min.js');const protoHit=await caches.match('https://cdn.jsdelivr.net/npm/protobufjs@7.5.4/dist/protobuf.min.js');core=!!navigator.serviceWorker?.controller&&hasCache&&!!coreHit;full=core&&!!longHit&&!!protoHit;}}catch{} const text=full?'Full offline ready':core?'Core cached · decoder cache pending':'Initial online load required';['offline-ready-badge','offline-tool-status'].forEach(id=>{const el=$(`#${id}`);if(el){el.textContent=text;el.classList.toggle('offline-ready',full);}});}
  function handleVisibilitySecurity(){if(!state.settings.blurOnHidden||!state.data){document.body.classList.remove('session-blurred');$('#privacy-blur-shield').classList.add('hidden');return;}const hidden=document.hidden;document.body.classList.toggle('session-blurred',hidden);$('#privacy-blur-shield').classList.toggle('hidden',!hidden);}

  function closeBackup() {
    setMobileMenu(false); document.body.classList.remove('focus-mode','presentation-mode','session-blurred'); $('#focus-exit')?.classList.add('hidden'); $('#presentation-exit')?.classList.add('hidden'); $('#privacy-blur-shield')?.classList.add('hidden'); closeQuickPreview(); toggleNotifications(false);
    state.data = null; state.loadedFlavor = null; state.fileName = ''; state.filtered = []; state.page = 1; state.compareData=null; state.diff=null; state.compareFileName='';
    state.cache={health:null,duplicates:null,activity:null,searchIndex:null}; state.notifications=[]; renderNotifications(); state.quickFilter=''; state.primaryMeta=null; state.repairPlan=null; clearTimeout(state.lockTimer);
    $('#app-view').classList.add('hidden'); $('#loader-view').classList.remove('hidden'); document.body.classList.remove('has-backup');
    closeModal(); closeReport(); closeThemePicker(); unlockViewer(); updateBackupFlavorUi(); const info=BACKUP_APPS[state.settings.backupFlavor]||BACKUP_APPS.komikku; diag(`Ready · choose a ${info.name} .tachibk backup.`); window.scrollTo({top:0,behavior:'smooth'});
  }

  function clearViewerSettings() {
    localStorage.removeItem(SETTINGS_KEY); localStorage.removeItem('kirin-komikku-viewer-settings-v13'); localStorage.removeItem('kirin-komikku-viewer-settings-v12'); state.settings={...defaultSettings,presets:[]}; applySavedSettings(); if(state.data)applyFilters(true); toast('Viewer settings cleared');
  }

  function updateScrollJumpControls(){
    const top=$('#scroll-page-top'),bottom=$('#scroll-page-bottom');if(!top||!bottom)return;
    const y=window.scrollY||document.documentElement.scrollTop||0;
    const max=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
    top.disabled=y<80;
    bottom.disabled=max-y<80;
  }
  function scrollPageTop(){window.scrollTo({top:0,behavior:state.settings.reducedMotion?'auto':'smooth'});}
  function scrollPageBottom(){window.scrollTo({top:document.documentElement.scrollHeight,behavior:state.settings.reducedMotion?'auto':'smooth'});}

  function bind() {
    $('#choose-file').addEventListener('click', e=>{e.stopPropagation();$('#file-input').click();});
    $$('[data-backup-flavor]').forEach(btn=>btn.addEventListener('click',()=>setBackupFlavor(btn.dataset.backupFlavor)));
    $('#new-backup').addEventListener('click',()=>state.data?closeBackup():$('#file-input').click()); $('#open-another').addEventListener('click',()=>$('#file-input').click()); $('#file-input').addEventListener('change',e=>openFile(e.target.files?.[0]));
    $('#mobile-menu-toggle').addEventListener('click',e=>{e.stopPropagation();setMobileMenu(!document.body.classList.contains('mobile-menu-open'));});
    const dz=$('#drop-zone'); dz.addEventListener('click',e=>{if(!e.target.closest('button'))$('#file-input').click();}); dz.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#file-input').click();}}); ['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('drag');})); ['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('drag');})); dz.addEventListener('drop',e=>openFile(e.dataTransfer.files?.[0]));

    let searchTimer; $('#search-input').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>applyFilters(true),document.body.classList.contains('performance-mode')?260:120);});
    ['category-filter','status-filter','read-filter','sort-select'].forEach(id=>$(`#${id}`).addEventListener('change',()=>{if(id==='sort-select')saveSettings({sort:$('#sort-select').value});if(id==='status-filter')saveSettings({status:$('#status-filter').value});if(id==='read-filter')saveSettings({read:$('#read-filter').value});applyFilters(true);}));
    $('#view-mode-select').addEventListener('change',()=>{saveSettings({viewMode:$('#view-mode-select').value});renderLibrary();}); $('#card-size-select').addEventListener('change',()=>{saveSettings({cardSize:$('#card-size-select').value});renderLibrary();}); $('#page-size-select').addEventListener('change',()=>{state.pageSize=Number($('#page-size-select').value)||30;saveSettings({pageSize:state.pageSize});applyFilters(true);});
    $('#quick-chips').addEventListener('click',e=>{const btn=e.target.closest('[data-quick]');if(!btn)return;const q=btn.dataset.quick;if(q==='clear'){state.quickFilter='';$('#search-input').value='';$('#category-filter').value='all';$('#status-filter').value='all';$('#read-filter').value='all';}else state.quickFilter=state.quickFilter===q?'':q;updateQuickChipUi();applyFilters(true);});
    $('#save-search-preset').addEventListener('click',saveSearchPreset); $('#clear-search-presets').addEventListener('click',()=>{saveSettings({presets:[]});renderSearchPresets();});

    $('#prev-page').addEventListener('click',()=>{state.page--;renderLibrary();window.scrollTo({top:120,behavior:'smooth'});}); $('#next-page').addEventListener('click',()=>{state.page++;renderLibrary();window.scrollTo({top:120,behavior:'smooth'});});
    $$('.nav-btn').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view))); $$('#explore-tabs [data-explore]').forEach(b=>b.addEventListener('click',()=>switchExploreTab(b.dataset.explore))); $$('#analysis-tabs [data-analysis]').forEach(b=>b.addEventListener('click',()=>switchAnalysisTab(b.dataset.analysis)));
    $('#dashboard-health-jump').addEventListener('click',()=>{switchView('analyze');switchAnalysisTab('health');}); $('#choose-compare').addEventListener('click',()=>$('#compare-input').click()); $('#compare-input').addEventListener('change',e=>loadComparison(e.target.files?.[0])); $('#export-diff').addEventListener('click',exportDiff);
    $('#export-json').addEventListener('click',exportJson); $('#export-tachibk').addEventListener('click',exportTachibk); $('#export-library-csv').addEventListener('click',exportLibraryCsv); $('#export-health-csv').addEventListener('click',exportHealthCsv); $('#export-health-json').addEventListener('click',exportHealthJson); $('#summary-report').addEventListener('click',openSummaryReport); $('#print-report').addEventListener('click',()=>window.print());
    $('#open-theme-picker').addEventListener('click',openThemePicker); $('#theme-toggle').addEventListener('click',openThemePicker); $('#performance-mode-select').addEventListener('change',()=>{saveSettings({performanceMode:$('#performance-mode-select').value});applyPerformanceMode();}); $('#lock-viewer').addEventListener('click',lockViewer); $('#unlock-viewer').addEventListener('click',unlockViewer); $('#auto-lock-select').addEventListener('change',()=>{saveSettings({autoLock:Number($('#auto-lock-select').value)||0});armAutoLock();});
    $('#export-settings').addEventListener('click',exportViewerSettings); $('#import-settings').addEventListener('click',()=>$('#settings-input').click()); $('#settings-input').addEventListener('change',e=>importViewerSettings(e.target.files?.[0])); $('#install-app').addEventListener('click',installApp); $('#clear-settings').addEventListener('click',clearViewerSettings); $('#clear-session').addEventListener('click',closeBackup); $('#stale-days').addEventListener('change',renderStale); $('#apply-safe-repairs').addEventListener('click',applySafeRepairs); $('#export-repair-plan').addEventListener('click',exportRepairPlan);
    $('#install-home').addEventListener('click',installApp); $('#command-palette-button').addEventListener('click',openCommandPalette); $('#notification-button').addEventListener('click',()=>toggleNotifications($('#notification-drawer').classList.contains('hidden'))); $('#version-badge').addEventListener('click',openWhatsNew);
    $('#clear-all-notifications').addEventListener('click',clearAllNotifications);
    $('#drawer-backdrop').addEventListener('click',()=>{toggleNotifications(false);closeQuickPreview();});
    $('#delete-filtered-manga').addEventListener('click',deleteFilteredManga);
    $('#delete-all-manga').addEventListener('click',deleteAllManga);
    $('#scroll-page-top').addEventListener('click',scrollPageTop); $('#scroll-page-bottom').addEventListener('click',scrollPageBottom); window.addEventListener('scroll',updateScrollJumpControls,{passive:true});
    $('#customize-dashboard').addEventListener('click',openDashboardCustomizer); $('#focus-mode-button').addEventListener('click',toggleFocusMode); $('#presentation-mode-button').addEventListener('click',togglePresentationMode); $('#focus-exit').addEventListener('click',toggleFocusMode); $('#presentation-exit').addEventListener('click',togglePresentationMode);
    $('#accent-color-input').addEventListener('input',e=>setAccent(e.target.value)); $('#theme-accent-input').addEventListener('input',e=>setAccent(e.target.value)); $('#reset-accent').addEventListener('click',()=>setAccent('')); $('#surface-style-select').addEventListener('change',e=>setSurface(e.target.value)); $('#theme-surface-select').addEventListener('change',e=>setSurface(e.target.value)); $('#ambient-select').addEventListener('change',e=>setAmbient(e.target.value)); $('#theme-ambient-select').addEventListener('change',e=>setAmbient(e.target.value));
    $('#large-text-toggle').addEventListener('change',e=>{saveSettings({largeText:e.target.checked});applyPremiumSettings();}); $('#high-contrast-toggle').addEventListener('change',e=>{saveSettings({highContrast:e.target.checked});applyPremiumSettings();}); $('#reduced-motion-toggle').addEventListener('change',e=>{saveSettings({reducedMotion:e.target.checked});applyPremiumSettings();}); $('#blur-hidden-toggle').addEventListener('change',e=>{saveSettings({blurOnHidden:e.target.checked});handleVisibilitySecurity();});
    $('#export-premium-report').addEventListener('click',exportPremiumReport); $('#export-share-report').addEventListener('click',exportShareSafeReport); $('#open-about').addEventListener('click',openAbout); $('#open-whats-new').addEventListener('click',openWhatsNew); $('#open-shortcuts').addEventListener('click',openShortcuts); $('#export-migration-csv').addEventListener('click',exportMigrationCsv); $('#year-review-select').addEventListener('change',renderYearReview);
    $('#command-input').addEventListener('input',()=>{state.commandIndex=0;renderCommandPalette();}); document.addEventListener('visibilitychange',handleVisibilitySecurity);
    $('#premium-dashboard-grid').addEventListener('dragstart',e=>{const w=e.target.closest('[data-dashboard-widget]');if(!w)return;state.dragWidget=w.dataset.dashboardWidget;w.classList.add('dragging');}); $('#premium-dashboard-grid').addEventListener('dragend',e=>{e.target.closest('[data-dashboard-widget]')?.classList.remove('dragging');$$('#premium-dashboard-grid .drag-over').forEach(x=>x.classList.remove('drag-over'));state.dragWidget=null;}); $('#premium-dashboard-grid').addEventListener('dragover',e=>{const w=e.target.closest('[data-dashboard-widget]');if(!w||!state.dragWidget)return;e.preventDefault();w.classList.add('drag-over');}); $('#premium-dashboard-grid').addEventListener('dragleave',e=>e.target.closest('[data-dashboard-widget]')?.classList.remove('drag-over')); $('#premium-dashboard-grid').addEventListener('drop',e=>{const w=e.target.closest('[data-dashboard-widget]');if(!w||!state.dragWidget)return;e.preventDefault();reorderDashboardWidgets(state.dragWidget,w.dataset.dashboardWidget);$$('#premium-dashboard-grid .drag-over').forEach(x=>x.classList.remove('drag-over'));});

    document.addEventListener('input',e=>{if(e.target.matches('#chapter-search'))renderChapterPanel();}); document.addEventListener('change',e=>{if(e.target.matches('#chapter-filter,#chapter-sort'))renderChapterPanel();});
    document.addEventListener('click',e=>{
      armAutoLock(); if(document.body.classList.contains('mobile-menu-open')&&!e.target.closest('#primary-nav')&&!e.target.closest('#mobile-menu-toggle'))setMobileMenu(false);
      const qp=e.target.closest('[data-quick-preview]');if(qp){e.preventDefault();e.stopPropagation();openQuickPreview(qp.dataset.quickPreview);return;} const openPrev=e.target.closest('[data-open-preview-details]');if(openPrev){closeQuickPreview();showManga(openPrev.dataset.openPreviewDetails);} if(e.target.closest('[data-close-preview]'))closeQuickPreview(); if(e.target.closest('[data-close-notifications]'))toggleNotifications(false); if(e.target.closest('[data-close-command]'))closeCommandPalette();
      const dismiss=e.target.closest('[data-dismiss-notification]');if(dismiss){e.preventDefault();e.stopPropagation();dismissNotification(dismiss.dataset.dismissNotification);return;}
      const deleteManga=e.target.closest('[data-delete-manga]');if(deleteManga){e.preventDefault();e.stopPropagation();deleteMangaAt(deleteManga.dataset.deleteManga);return;}
      const cmd=e.target.closest('[data-command-index]');if(cmd)runCommandIndex(cmd.dataset.commandIndex); const top=e.target.closest('[data-top-list]');if(top)openTopList(top.dataset.topList); const wt=e.target.closest('[data-widget-toggle]');if(wt)toggleDashboardWidget(wt.dataset.widgetToggle,wt.checked); const note=e.target.closest('[data-notification-index]');if(note){
        e.preventDefault();
        const n=state.notifications[Number(note.dataset.notificationIndex)];
        markCurrentNotificationsRead();
        toggleNotifications(false);
        if(n?.tab){
          switchView('analyze');
          requestAnimationFrame(()=>switchAnalysisTab(n.tab));
        }
        return;
      }
      const hit=e.target.closest('[data-manga-index]');if(hit)showManga(hit.dataset.mangaIndex); const mt=e.target.closest('[data-modal-tab]');if(mt)switchModalTab(mt.dataset.modalTab);
      const categoryJump=e.target.closest('[data-category-jump]');if(categoryJump)jumpToLibrary({category:categoryJump.dataset.categoryJump}); const sourceJump=e.target.closest('[data-source-jump]');if(sourceJump)jumpToLibrary({source:sourceJump.dataset.sourceJump});
      const searchJump=e.target.closest('[data-search-jump]');if(searchJump){closeModal();jumpSearch(searchJump.dataset.searchJump.replace(/&quot;/g,'"'));} const smart=e.target.closest('[data-smart-jump]');if(smart){state.quickFilter=smart.dataset.smartJump;updateQuickChipUi();switchView('library');applyFilters(true);} const preset=e.target.closest('[data-preset-index]');if(preset)applyPreset(preset.dataset.presetIndex);
      const trackerJump=e.target.closest('[data-tracker-jump]');if(trackerJump)jumpSearch(`tracker:"${trackerJump.dataset.trackerJump}"`); const compare=e.target.closest('[data-compare-change]');if(compare)renderCompareChangeDetail(Number(compare.dataset.compareChange));
      const viewJump=e.target.closest('[data-view-jump]');if(viewJump)switchView(viewJump.dataset.viewJump); const exploreJump=e.target.closest('[data-explore-tab]');if(exploreJump){switchView('explore');switchExploreTab(exploreJump.dataset.exploreTab);} const analysisJump=e.target.closest('[data-analysis-tab]');if(analysisJump){switchView('analyze');switchAnalysisTab(analysisJump.dataset.analysisTab);}
      const theme=e.target.closest('[data-theme-choice]');if(theme)setTheme(theme.dataset.themeChoice); if(e.target.closest('[data-close-theme]'))closeThemePicker(); if(e.target.closest('[data-close-modal]'))closeModal(); if(e.target.closest('[data-close-report]'))closeReport();
    });
    document.addEventListener('contextmenu',e=>{const hit=e.target.closest('[data-manga-index]');if(hit&&state.data){e.preventDefault();openQuickPreview(hit.dataset.mangaIndex);}});
    ['mousemove','touchstart','keydown'].forEach(ev=>document.addEventListener(ev,armAutoLock,{passive:true}));
    document.addEventListener('keydown',e=>{
      if(!$('#command-palette').classList.contains('hidden')){if(e.key==='Escape'){closeCommandPalette();return;}if(e.key==='ArrowDown'){e.preventDefault();state.commandIndex=clamp(state.commandIndex+1,0,Math.max(0,state.commandResults.length-1));renderCommandPalette();return;}if(e.key==='ArrowUp'){e.preventDefault();state.commandIndex=clamp(state.commandIndex-1,0,Math.max(0,state.commandResults.length-1));renderCommandPalette();return;}if(e.key==='Enter'){e.preventDefault();runCommandIndex(state.commandIndex);return;}}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCommandPalette();return;}
      if(e.key==='Escape'){setMobileMenu(false);closeModal();closeReport();closeThemePicker();closeQuickPreview();toggleNotifications(false);if(document.body.classList.contains('focus-mode'))toggleFocusMode();if(document.body.classList.contains('presentation-mode'))togglePresentationMode();return;}
      if(e.target.matches('input,textarea,select'))return;const k=e.key.toLowerCase();if(k==='/'){e.preventDefault();switchView('library');$('#search-input').focus();}if(k==='?'){e.preventDefault();openShortcuts();}if(state.data&&k==='d')switchView('dashboard');if(state.data&&k==='g')switchView('library');if(state.data&&k==='e')switchView('explore');if(state.data&&k==='a')switchView('analyze');if(state.data&&k==='t')switchView('tools');if(state.data&&k==='f')toggleFocusMode();if(state.data&&k==='p')togglePresentationMode();});
    window.addEventListener('resize',()=>{if(!window.matchMedia('(max-width:1050px)').matches)setMobileMenu(false);applyPerformanceMode();updateScrollJumpControls();});
  }

  window.addEventListener('DOMContentLoaded', async () => {
    bind(); applySavedSettings(); registerPwa(); updateBackupFlavorUi(); updatePwaStatus(); updateScrollJumpControls();
    const year = $('#footer-year'); if (year) year.textContent = String(new Date().getFullYear());
    const flavor = state.settings.backupFlavor in BACKUP_APPS ? state.settings.backupFlavor : 'komikku';
    const info = BACKUP_APPS[flavor];
    try { await ensureSchema(flavor); diag(`Ready ✓ · ${info.name} schema loaded · GZIP/raw protobuf supported.`); }
    catch (error) { diag(error.message, true); }
  });
})();
