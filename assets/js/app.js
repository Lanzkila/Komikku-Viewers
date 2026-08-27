(() => {
  'use strict';

  const SETTINGS_KEY = 'kirin-komikku-viewer-settings-v13';
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
  };

  const state = {
    data: null,
    fileName: '',
    sourceMap: new Map(),
    categoryMap: new Map(),
    filtered: [],
    page: 1,
    pageSize: 30,
    debug: [],
    BackupType: null,
    schemaRoot: null,
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
  const DAY = 86400000;

  function loadSettings() {
    try {
      const current = localStorage.getItem(SETTINGS_KEY);
      const legacy = localStorage.getItem('kirin-komikku-viewer-settings-v12');
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
    applyPerformanceMode();
    renderSearchPresets();
    armAutoLock();
  }

  async function ensureSchema() {
    if (state.BackupType) return state.BackupType;
    if (!window.protobuf) throw new Error('ProtobufJS did not load. Check your internet connection, then reload the page.');
    if (window.Long && protobuf.util) {
      protobuf.util.Long = window.Long;
      protobuf.configure();
    }
    const schemaUrl = new URL('./schemas/schema-komikku.proto', document.baseURI).href;
    log(`Loading Komikku schema: ${schemaUrl}`);
    const response = await fetch(schemaUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load schema-komikku.proto (HTTP ${response.status}).`);
    const schemaText = await response.text();
    const parsed = protobuf.parse(schemaText, { keepCase: true });
    state.schemaRoot = parsed.root;
    state.BackupType = parsed.root.lookupType('Backup');
    log('Komikku protobuf schema loaded.');
    return state.BackupType;
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
    if (primary) { state.debug = []; diag(`Reading ${file.name} · ${formatBytes(file.size)}…`); }
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

    const Backup = await ensureSchema();
    let payload = bytes;
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      meta.format = 'GZIP protobuf';
      if (primary) diag('GZIP header detected · decompressing…');
      payload = await gunzip(bytes);
      meta.decodedBytes = payload.length;
      log(`${primary ? 'Primary' : 'Compare'} GZIP OK · ${formatBytes(payload.length)} protobuf payload.`);
    } else log(`${primary ? 'Primary' : 'Compare'} has no GZIP header · decoding as raw protobuf.`);

    if (primary) diag('Decoding Komikku protobuf…');
    let message;
    try { message = Backup.decode(payload); }
    catch (error) { throw new Error(`Komikku protobuf decode failed: ${error.message}`); }
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
      state.fileName = file.name;
      state.compareData = null;
      state.compareFileName = '';
      state.diff = null;
      state.cache = { health: null, duplicates: null, activity: null, searchIndex: null };
      state.quickFilter = '';
      state.page = 1;
      buildIndexes();
      $('#loader-view').classList.add('hidden');
      $('#app-view').classList.remove('hidden');
      document.body.classList.add('has-backup');
      $('#backup-name').textContent = file.name;
      $('#backup-summary').textContent = `${data.backupManga.length.toLocaleString()} manga · ${data.backupCategories.length} categories · ${data.backupSources.length} sources`;
      diag(`Komikku backup loaded ✓ · ${data.backupManga.length.toLocaleString()} manga.`);
      populateFilters();
      applySavedSettings();
      updateQuickChipUi();
      renderDashboard();
      renderBackupMetadata();
      applyPerformanceMode();
      const restoredView = ['dashboard','library','explore','analyze','tools'].includes(state.settings.lastView) ? state.settings.lastView : 'dashboard';
      switchView(restoredView);
    } catch (error) {
      console.error(error);
      diag(error.message || String(error), true);
      toast('Could not open this backup');
    } finally {
      $('#file-input').value = '';
    }
  }

  function buildIndexes() {
    state.sourceMap = new Map(state.data.backupSources.map(s => [key64(s.sourceId), s.name || key64(s.sourceId)]));
    state.categoryMap = new Map();
    state.data.backupCategories.forEach((c, i) => {
      const id = c.id != null ? key64(c.id) : key64(c.order != null ? c.order : i);
      state.categoryMap.set(id, c);
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
      return `<article class="manga-card"><button class="card-hit" data-manga-index="${idx}"><div class="cover">${coverHtml(m)}<span class="badge">${unreadCount(m)} unread</span></div><div class="manga-card-body"><div class="manga-title">${esc(displayTitle(m))}</div><div class="manga-sub"><span>${esc(displayStatus(m))}</span><span>${read}/${total}</span></div><div class="progress"><i style="width:${pct}%"></i></div></div></button></article>`;
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
    const weighted = issues.missingTitle.length*4 + issues.missingCover.length*.5 + issues.noChapters.length*1.5 + issues.unknownSource.length*3 + issues.danglingCategory.length*2 + duplicateData.strong.length*3;
    const denominator = Math.max(1, mangas.length * 4);
    const score = clamp(Math.round(100 - (weighted / denominator * 100)), 0, 100);
    const result = { score, issues, duplicateGroups: duplicateData.strong.length };
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
    $('#dashboard-cards').innerHTML = stats.map(([label,val,sub]) => `<div class="stat-card"><strong>${typeof val==='number'?val.toLocaleString():esc(val)}</strong><span>${esc(label)}</span><small>${esc(sub)}</small></div>`).join('');

    const issueCount = Object.values(health.issues).reduce((n,a)=>n+a.length,0);
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
    ['categories','sources','trackers','activity','genres','creators','smart','growth','heatmap'].forEach(v=>$(`#explore-${v}`)?.classList.toggle('hidden',v!==name));
    if (name === 'categories') renderCategoryExplorer();
    if (name === 'sources') renderSourceExplorer();
    if (name === 'trackers') renderTrackerOverview();
    if (name === 'activity') renderActivity();
    if (name === 'genres') renderGenreExplorer();
    if (name === 'creators') renderCreatorExplorer();
    if (name === 'smart') renderSmartCollections();
    if (name === 'growth') renderLibraryGrowth();
    if (name === 'heatmap') renderHeatmap();
  }

  function renderHealth() {
    const h = computeHealth();
    const cls = h.score >= 90 ? 'good' : h.score >= 70 ? 'warn' : 'bad';
    $('#health-summary').innerHTML = `<div class="health-hero"><div class="health-big ${cls}">${h.score}%</div><div><h3>${h.score>=90?'Backup looks healthy':h.score>=70?'Some items need attention':'Backup has several warning signs'}</h3><p class="muted">This is a viewer-side consistency check, not Komikku's official validator.</p></div></div>`;
    const cards = [
      ['Missing titles',h.issues.missingTitle.length,'bad'],['Missing covers',h.issues.missingCover.length,h.issues.missingCover.length?'warn':'ok'],['No chapters',h.issues.noChapters.length,h.issues.noChapters.length?'warn':'ok'],['Unknown sources',h.issues.unknownSource.length,h.issues.unknownSource.length?'bad':'ok'],['Broken category refs',h.issues.danglingCategory.length,h.issues.danglingCategory.length?'bad':'ok'],['Strong duplicate groups',h.duplicateGroups,h.duplicateGroups?'warn':'ok'],
    ];
    $('#health-issues').innerHTML = cards.map(([label,count,severity])=>`<div class="issue-card" data-severity="${severity}"><strong>${Number(count).toLocaleString()}</strong><span>${esc(label)}</span><small>${count?'Review recommended':'No issue detected'}</small></div>`).join('');
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
    state.cache={health:null,duplicates:null,activity:null,searchIndex:null}; buildIndexes(); populateFilters(); renderRepairPreview(); renderDashboard(); toast('Safe repairs applied in memory');
  }

  function exportRepairPlan() { const plan=state.repairPlan||computeRepairPlan(); downloadBlob(new Blob([JSON.stringify(plan,null,2)],{type:'application/json'}),datedName('komikku-repair-plan','json')); }

  function switchAnalysisTab(name) {
    state.analysisTab = name;
    $$('#analysis-tabs [data-analysis]').forEach(b=>b.classList.toggle('active',b.dataset.analysis===name));
    ['health','duplicates','compare','insights','stale','source-health','orphans','repair'].forEach(v=>$(`#analysis-${v}`)?.classList.toggle('hidden',v!==name));
    if (name === 'health') renderHealth();
    if (name === 'duplicates') renderDuplicates();
    if (name === 'insights') renderInsights();
    if (name === 'stale') renderStale();
    if (name === 'source-health') renderSourceHealth();
    if (name === 'orphans') renderOrphans();
    if (name === 'repair') renderRepairPreview();
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
    const renderItems = (items,type) => items.slice(0,200).map((x,i)=>type==='changed'?`<button class="diff-row diff-button" data-compare-change="${i}"><strong>${esc(x.title)}</strong><br><span class="muted">${esc(x.changes.join(', '))}</span></button>`:`<div class="diff-row"><strong>${esc(x.title)}</strong><br><span class="muted">${esc(x.url||x.source)}</span></div>`).join('') || '<div class="muted">None</div>';
    $('#compare-details').innerHTML = `<div class="diff-column"><h3>Comparison only +${d.added.length}</h3><div class="diff-list">${renderItems(d.added,'added')}</div></div><div class="diff-column"><h3>Current only −${d.removed.length}</h3><div class="diff-list">${renderItems(d.removed,'removed')}</div></div><div class="diff-column"><h3>Changed ~${d.changed.length}</h3><div class="diff-list">${renderItems(d.changed,'changed')}</div></div><div id="compare-change-detail" class="compare-change-detail"><p class="muted">Select a changed manga to inspect field differences.</p></div>`;
    $('#compare-details').classList.remove('hidden'); $('#export-diff').classList.remove('hidden');
  }

  function renderCompareChangeDetail(i) { const x=state.diff?.changed?.[i], el=$('#compare-change-detail'); if(!x||!el)return; const rows=[['Title',x.before.title,x.after.title],['Chapters',x.before.chapters,x.after.chapters],['Unread',x.beforeUnread,x.afterUnread],['Bookmarks',x.beforeBookmarks,x.afterBookmarks],['Source',x.before.source,x.after.source],['URL',x.before.url,x.after.url]]; el.innerHTML=`<h3>${esc(x.title)}</h3><p class="muted">Changed: ${esc(x.changes.join(', '))}</p><div class="compare-field-grid">${rows.map(([k,a,b])=>`<div><b>${esc(k)}</b><span>${esc(a)}</span><span>→</span><span>${esc(b)}</span></div>`).join('')}</div>`; }

  function showManga(index) {
    const m = state.data?.backupManga?.[Number(index)]; if (!m) return;
    state.modalMangaIndex = Number(index); state.chapterUi={search:'',filter:'all',sort:'number-desc'};
    const cats=m.categories.map(id=>state.categoryMap.get(key64(id))?.name).filter(Boolean), genres=displayGenres(m), source=sourceName(m);
    const trackingHtml=m.tracking.length?m.tracking.map(t=>{const info=trackerInfo(t.syncId);return `<div class="tracking-card detailed-tracker"><span class="tracker-logo">${esc(info.mark)}</span><div><strong>${esc(info.name)} · ${esc(t.title||displayTitle(m))}</strong><small>Progress ${esc(t.lastChapterRead??0)} / ${esc(t.totalChapters??'—')} · Score ${esc(t.score??'—')} · Status ${esc(t.status??'—')}</small><small>Started ${trackerDate(t.startedReadingDate)} · Finished ${trackerDate(t.finishedReadingDate)}${t.private?' · Private':''}</small>${t.trackingUrl?`<a class="tracker-link" href="${esc(t.trackingUrl)}" target="_blank" rel="noopener noreferrer">Open tracker ↗</a>`:''}</div></div>`}).join(''):'<div class="empty-state">No tracking entries.</div>';
    const mangaLink=/^https?:\/\//i.test(m.url||'')?`<a class="source-open-link" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">Open source page ↗</a>`:'';
    $('#modal-content').innerHTML=`<div class="detail-hero"><div>${displayCover(m)?`<img class="detail-cover" src="${esc(displayCover(m))}" alt="" referrerpolicy="no-referrer">`:`<div class="detail-cover cover-fallback">◇</div>`}</div><div><div class="eyebrow">${esc(source)}</div><h2 id="modal-title" class="detail-title">${esc(displayTitle(m))}</h2>${mangaLink}<div class="chips">${cats.map(c=>`<button class="chip chip-button" data-search-jump="category:&quot;${esc(c)}&quot;">${esc(c)}</button>`).join('')}${genres.slice(0,12).map(g=>`<button class="chip chip-button" data-search-jump="genre:&quot;${esc(g)}&quot;">${esc(g)}</button>`).join('')}</div><div class="metadata"><div><b>Author</b>${displayAuthor(m)?`<button class="inline-link" data-search-jump="author:&quot;${esc(displayAuthor(m))}&quot;">${esc(displayAuthor(m))}</button>`:'—'}</div><div><b>Artist</b>${displayArtist(m)?`<button class="inline-link" data-search-jump="artist:&quot;${esc(displayArtist(m))}&quot;">${esc(displayArtist(m))}</button>`:'—'}</div><div><b>Status</b>${esc(displayStatus(m))}</div><div><b>Progress</b>${readCount(m)} / ${m.chapters.length} read</div><div><b>Bookmarks</b>${bookmarkCount(m)}</div><div><b>Tracking</b>${m.tracking.length}</div></div></div></div>
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
  function exportLibraryCsv(){if(!state.data)return;const rows=[['Title','Author','Artist','Source','Status','Chapters','Read','Unread','Bookmarks','Trackers','Date Added','Last Read','URL']];state.data.backupManga.forEach(m=>rows.push([displayTitle(m),displayAuthor(m),displayArtist(m),sourceName(m),displayStatus(m),m.chapters.length,readCount(m),unreadCount(m),bookmarkCount(m),m.tracking.map(t=>trackerInfo(t.syncId).name).join(' | '),asNum(m.dateAdded)?new Date(asNum(m.dateAdded)).toISOString():'',lastRead(m)?new Date(lastRead(m)).toISOString():'',m.url||'']));downloadCsv(rows,datedName('komikku-library','csv'));}
  function healthRows(){const h=computeHealth();const rows=[['Issue','Count']];[['Missing title',h.issues.missingTitle.length],['Missing cover',h.issues.missingCover.length],['No chapters',h.issues.noChapters.length],['Unknown source',h.issues.unknownSource.length],['Broken category ref',h.issues.danglingCategory.length],['Strong duplicate groups',h.duplicateGroups]].forEach(x=>rows.push(x));return rows;}
  function exportHealthCsv(){downloadCsv(healthRows(),datedName('komikku-health','csv'));}
  function exportHealthJson(){const payload={file:state.fileName,health:computeHealth(),duplicates:computeDuplicates(),orphans:computeOrphans(),sourceHealth:sourceHealthRows()};downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),datedName('komikku-health','json'));}

  function openThemePicker(){updateThemeUi();$('#theme-modal').classList.remove('hidden');document.body.style.overflow='hidden';}
  function closeThemePicker(){ $('#theme-modal').classList.add('hidden'); if($('#modal').classList.contains('hidden')&&$('#report-modal').classList.contains('hidden'))document.body.style.overflow=''; }
  function setTheme(name){if(!(name in THEMES))return;saveSettings({theme:name});updateThemeUi();closeThemePicker();toast(`Theme: ${THEMES[name].name}`);}

  function applyPerformanceMode(){const mode=state.settings.performanceMode||'auto';const enabled=mode==='on'||(mode==='auto'&&((state.data?.backupManga?.length||0)>=5000||matchMedia('(max-width:680px)').matches));document.body.classList.toggle('performance-mode',enabled);}
  function lockViewer(){if(!state.data)return;setMobileMenu(false);document.body.classList.add('viewer-locked');$('#privacy-lock').classList.remove('hidden');document.body.style.overflow='hidden';}
  function unlockViewer(){document.body.classList.remove('viewer-locked');$('#privacy-lock').classList.add('hidden');document.body.style.overflow='';armAutoLock();}
  function armAutoLock(){clearTimeout(state.lockTimer);const min=Number(state.settings.autoLock||0);if(min>0&&state.data&&!document.body.classList.contains('viewer-locked'))state.lockTimer=setTimeout(lockViewer,min*60000);}

  function exportViewerSettings(){const payload={app:'Kirin Komikku Viewer',version:'1.3.0',settings:state.settings};downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),'kirin-komikku-viewer-settings.json');}
  async function importViewerSettings(file){if(!file)return;try{const obj=JSON.parse(await file.text());const incoming=obj.settings||obj;if(!incoming||typeof incoming!=='object')throw new Error('Invalid settings file');state.settings={...defaultSettings,...incoming};localStorage.setItem(SETTINGS_KEY,JSON.stringify(state.settings));applySavedSettings();if(state.data)applyFilters(true);toast('Viewer settings imported');}catch(e){toast(`Import failed: ${e.message}`);}finally{$('#settings-input').value='';}}

  async function installApp(){if(state.installPrompt){state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null;return;}toast('Use browser “Add to Home screen” if install is not offered.');}
  function registerPwa(){if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(e=>log(`Service worker: ${e.message}`));window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.installPrompt=e;});}

  async function exportJson() {
    if (!state.data) return;
    downloadBlob(new Blob([JSON.stringify(state.data, null, 2)], {type:'application/json'}), datedName('komikku-backup', 'json'));
  }

  async function exportTachibk() {
    if (!state.data) return;
    try {
      const Backup = await ensureSchema();
      const verify = Backup.verify(Backup.fromObject(state.data));
      if (verify) log(`Verify warning: ${verify}`);
      const encoded = Backup.encode(Backup.fromObject(state.data)).finish();
      const zipped = window.pako?.gzip ? window.pako.gzip(encoded) : await gzipNative(encoded);
      downloadBlob(new Blob([zipped], {type:'application/octet-stream'}), datedName('komikku-backup', 'tachibk'));
      toast('Komikku .tachibk exported');
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
    downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}), datedName('komikku-backup-diff','json'));
  }

  function openSummaryReport() {
    if (!state.data) return;
    const mangas=state.data.backupManga, health=computeHealth(), dup=computeDuplicates(), activity=getActivity();
    const chapters=mangas.reduce((n,m)=>n+m.chapters.length,0), unread=mangas.reduce((n,m)=>n+unreadCount(m),0), bookmarks=mangas.reduce((n,m)=>n+bookmarkCount(m),0);
    const sources=countValues(mangas.map(sourceName)).slice(0,10), genres=countValues(mangas.flatMap(displayGenres)).slice(0,10);
    $('#report-content').innerHTML = `<h1 id="report-title" class="report-title">Komikku Backup Summary</h1><p>${esc(state.fileName)} · generated ${new Date().toLocaleString()}</p><div class="report-grid"><div class="report-card"><strong>${mangas.length}</strong>Manga</div><div class="report-card"><strong>${chapters}</strong>Chapters</div><div class="report-card"><strong>${unread}</strong>Unread</div><div class="report-card"><strong>${health.score}%</strong>Health</div></div><div class="report-section"><h3>Backup health</h3><table class="report-table"><tr><th>Missing covers</th><td>${health.issues.missingCover.length}</td><th>Unknown sources</th><td>${health.issues.unknownSource.length}</td></tr><tr><th>No chapters</th><td>${health.issues.noChapters.length}</td><th>Strong duplicate groups</th><td>${dup.strong.length}</td></tr><tr><th>Bookmarks</th><td>${bookmarks}</td><th>Reading events</th><td>${activity.length}</td></tr></table></div><div class="report-section"><h3>Top sources</h3><table class="report-table">${sources.map(([n,c])=>`<tr><td>${esc(n)}</td><td>${c}</td></tr>`).join('')}</table></div><div class="report-section"><h3>Top genres</h3><table class="report-table">${genres.map(([n,c])=>`<tr><td>${esc(n)}</td><td>${c}</td></tr>`).join('')}</table></div>`;
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

  function closeBackup() {
    setMobileMenu(false);
    state.data = null; state.fileName = ''; state.filtered = []; state.page = 1; state.compareData=null; state.diff=null; state.compareFileName='';
    state.cache={health:null,duplicates:null,activity:null,searchIndex:null}; state.quickFilter=''; state.primaryMeta=null; state.repairPlan=null; clearTimeout(state.lockTimer);
    $('#app-view').classList.add('hidden'); $('#loader-view').classList.remove('hidden'); document.body.classList.remove('has-backup');
    closeModal(); closeReport(); closeThemePicker(); unlockViewer(); diag('Ready · choose a Komikku .tachibk backup.'); window.scrollTo({top:0,behavior:'smooth'});
  }

  function clearViewerSettings() {
    localStorage.removeItem(SETTINGS_KEY); localStorage.removeItem('kirin-komikku-viewer-settings-v12'); state.settings={...defaultSettings,presets:[]}; applySavedSettings(); if(state.data)applyFilters(true); toast('Viewer settings cleared');
  }

  function bind() {
    $('#choose-file').addEventListener('click', e=>{e.stopPropagation();$('#file-input').click();});
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

    document.addEventListener('input',e=>{if(e.target.matches('#chapter-search'))renderChapterPanel();}); document.addEventListener('change',e=>{if(e.target.matches('#chapter-filter,#chapter-sort'))renderChapterPanel();});
    document.addEventListener('click',e=>{
      armAutoLock(); if(document.body.classList.contains('mobile-menu-open')&&!e.target.closest('#primary-nav')&&!e.target.closest('#mobile-menu-toggle'))setMobileMenu(false);
      const hit=e.target.closest('[data-manga-index]');if(hit)showManga(hit.dataset.mangaIndex); const mt=e.target.closest('[data-modal-tab]');if(mt)switchModalTab(mt.dataset.modalTab);
      const categoryJump=e.target.closest('[data-category-jump]');if(categoryJump)jumpToLibrary({category:categoryJump.dataset.categoryJump}); const sourceJump=e.target.closest('[data-source-jump]');if(sourceJump)jumpToLibrary({source:sourceJump.dataset.sourceJump});
      const searchJump=e.target.closest('[data-search-jump]');if(searchJump){closeModal();jumpSearch(searchJump.dataset.searchJump.replace(/&quot;/g,'"'));} const smart=e.target.closest('[data-smart-jump]');if(smart){state.quickFilter=smart.dataset.smartJump;updateQuickChipUi();switchView('library');applyFilters(true);} const preset=e.target.closest('[data-preset-index]');if(preset)applyPreset(preset.dataset.presetIndex);
      const trackerJump=e.target.closest('[data-tracker-jump]');if(trackerJump)jumpSearch(`tracker:"${trackerJump.dataset.trackerJump}"`); const compare=e.target.closest('[data-compare-change]');if(compare)renderCompareChangeDetail(Number(compare.dataset.compareChange));
      const viewJump=e.target.closest('[data-view-jump]');if(viewJump)switchView(viewJump.dataset.viewJump); const exploreJump=e.target.closest('[data-explore-tab]');if(exploreJump){switchView('explore');switchExploreTab(exploreJump.dataset.exploreTab);} const analysisJump=e.target.closest('[data-analysis-tab]');if(analysisJump){switchView('analyze');switchAnalysisTab(analysisJump.dataset.analysisTab);}
      const theme=e.target.closest('[data-theme-choice]');if(theme)setTheme(theme.dataset.themeChoice); if(e.target.closest('[data-close-theme]'))closeThemePicker(); if(e.target.closest('[data-close-modal]'))closeModal(); if(e.target.closest('[data-close-report]'))closeReport();
    });
    ['mousemove','touchstart','keydown'].forEach(ev=>document.addEventListener(ev,armAutoLock,{passive:true}));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){setMobileMenu(false);closeModal();closeReport();closeThemePicker();return;}if(e.target.matches('input,textarea,select'))return;const k=e.key.toLowerCase();if(k==='/'){e.preventDefault();switchView('library');$('#search-input').focus();}if(state.data&&k==='d')switchView('dashboard');if(state.data&&k==='g')switchView('library');if(state.data&&k==='e')switchView('explore');if(state.data&&k==='a')switchView('analyze');if(state.data&&k==='t')switchView('tools');});
    window.addEventListener('resize',()=>{if(!window.matchMedia('(max-width:1050px)').matches)setMobileMenu(false);applyPerformanceMode();});
  }

  window.addEventListener('DOMContentLoaded', async () => {
    bind(); applySavedSettings(); registerPwa();
    try { await ensureSchema(); diag('Ready ✓ · Komikku schema loaded · GZIP/raw protobuf supported.'); }
    catch (error) { diag(error.message, true); }
  });
})();
