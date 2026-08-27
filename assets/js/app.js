(() => {
  'use strict';

  const SETTINGS_KEY = 'kirin-komikku-viewer-settings-v12';
  const defaultSettings = {
    theme: 'dark',
    sort: 'title',
    status: 'all',
    read: 'all',
    viewMode: 'grid',
    cardSize: 'medium',
    pageSize: 30,
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
    cache: { health: null, duplicates: null, activity: null },
    settings: loadSettings(),
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

  function loadSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return { ...defaultSettings, ...raw };
    } catch {
      return { ...defaultSettings };
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
    const light = document.documentElement.classList.contains('light');
    const btn = $('#theme-toggle');
    if (btn) btn.textContent = light ? '☾' : '☼';
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = light ? '#f5f7fb' : '#0b0d12';
  }

  function applySavedSettings() {
    document.documentElement.classList.toggle('light', state.settings.theme === 'light');
    updateThemeUi();
    state.pageSize = Number(state.settings.pageSize) || 30;
    if ($('#sort-select')) $('#sort-select').value = state.settings.sort || 'title';
    if ($('#status-filter')) $('#status-filter').value = state.settings.status || 'all';
    if ($('#read-filter')) $('#read-filter').value = state.settings.read || 'all';
    if ($('#view-mode-select')) $('#view-mode-select').value = state.settings.viewMode || 'grid';
    if ($('#card-size-select')) $('#card-size-select').value = state.settings.cardSize || 'medium';
    if ($('#page-size-select')) $('#page-size-select').value = String(state.pageSize);
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
    if (primary) {
      state.debug = [];
      diag(`Reading ${file.name} · ${formatBytes(file.size)}…`);
    } else {
      log(`Comparison: reading ${file.name} · ${formatBytes(file.size)}.`);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const header = [...bytes.slice(0, 8)].map(n => n.toString(16).padStart(2, '0')).join(' ');
    log(`${primary ? 'Primary' : 'Compare'} header: ${header || '(empty)'}`);
    if (!bytes.length) throw new Error('The selected file is empty.');

    if (isJsonBytes(bytes) || file.name.toLowerCase().endsWith('.json')) {
      const text = new TextDecoder().decode(bytes);
      log(`${primary ? 'Primary' : 'Compare'} detected JSON backup.`);
      return normalizeData(JSON.parse(text));
    }

    const Backup = await ensureSchema();
    let payload = bytes;
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      if (primary) diag('GZIP header detected · decompressing…');
      payload = await gunzip(bytes);
      log(`${primary ? 'Primary' : 'Compare'} GZIP OK · ${formatBytes(payload.length)} protobuf payload.`);
    } else {
      log(`${primary ? 'Primary' : 'Compare'} has no GZIP header · decoding as raw protobuf.`);
    }

    if (primary) diag('Decoding Komikku protobuf…');
    let message;
    try {
      message = Backup.decode(payload);
    } catch (error) {
      throw new Error(`Komikku protobuf decode failed: ${error.message}`);
    }

    const data = Backup.toObject(message, {
      longs: String,
      enums: String,
      bytes: String,
      defaults: false,
      arrays: true,
      objects: true,
    });
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
      state.cache = { health: null, duplicates: null, activity: null };
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
      switchView('dashboard');
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
    if (q === 'nohistory') return !hasHistory(m);
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

  function renderTrackerOverview() {
    const trackers = new Map();
    state.data.backupManga.forEach((m,mangaIndex) => m.tracking.forEach(t => {
      const id = String(t.syncId ?? 'unknown');
      const row = trackers.get(id) || {id,count:0,progress:0,scores:[],entries:[]};
      row.count++; row.progress += asNum(t.lastChapterRead); if (asNum(t.score)>0) row.scores.push(asNum(t.score));
      row.entries.push({m,mangaIndex,t}); trackers.set(id,row);
    }));
    const rows = [...trackers.values()].sort((a,b)=>b.count-a.count);
    $('#tracker-overview').innerHTML = rows.length ? rows.map(r=>{const avg=r.scores.length?(r.scores.reduce((a,b)=>a+b,0)/r.scores.length).toFixed(1):'—';return `<div class="explorer-card"><strong>Tracker ID ${esc(r.id)}</strong><small>${r.count} manga tracked</small><div class="explorer-metrics"><span>Avg score ${avg}</span><span>Total progress ${Math.round(r.progress)}</span></div></div>`}).join('') : '<div class="empty-state">No tracking entries stored in this backup.</div>';
  }

  function renderActivity() {
    const rows = getActivity().slice(0,200);
    $('#activity-timeline').innerHTML = rows.length ? rows.map(r => `<button class="card-hit" data-manga-index="${r.mangaIndex}"><div class="timeline-row">${displayCover(r.manga)?`<img class="timeline-thumb" src="${esc(displayCover(r.manga))}" alt="" referrerpolicy="no-referrer">`:`<div class="timeline-thumb cover-fallback">◇</div>`}<div><strong>${esc(displayTitle(r.manga))}</strong><small>${esc(sourceName(r.manga))}${r.duration?` · ${formatDuration(r.duration)}`:''}</small></div><div><small>${new Date(r.when).toLocaleString()}</small></div></div></button>`).join('') : '<div class="empty-state">No reading activity stored in this backup.</div>';
  }

  function switchExploreTab(name) {
    state.exploreTab = name;
    $$('#explore-tabs [data-explore]').forEach(b=>b.classList.toggle('active',b.dataset.explore===name));
    ['categories','sources','trackers','activity'].forEach(v=>$(`#explore-${v}`).classList.toggle('hidden',v!==name));
    if (name === 'categories') renderCategoryExplorer();
    if (name === 'sources') renderSourceExplorer();
    if (name === 'trackers') renderTrackerOverview();
    if (name === 'activity') renderActivity();
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

  function switchAnalysisTab(name) {
    state.analysisTab = name;
    $$('#analysis-tabs [data-analysis]').forEach(b=>b.classList.toggle('active',b.dataset.analysis===name));
    ['health','duplicates','compare','insights'].forEach(v=>$(`#analysis-${v}`).classList.toggle('hidden',v!==name));
    if (name === 'health') renderHealth();
    if (name === 'duplicates') renderDuplicates();
    if (name === 'insights') renderInsights();
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
      if (changes.length) changed.push({ key, title: displayComparableTitle(m), source: key64(m.source), changes });
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
    const d = state.diff;
    if (!d) return;
    const cards = [['Comparison only',d.added.length],['Current only',d.removed.length],['Changed',d.changed.length],['New chapters',d.newChapters],['Category changes',d.categoryChanges]];
    $('#compare-summary').innerHTML = cards.map(([k,v])=>`<div class="stat-card"><strong>${v.toLocaleString()}</strong><span>${esc(k)}</span></div>`).join('');
    $('#compare-summary').classList.remove('hidden');
    const renderItems = (items,type) => items.slice(0,200).map(x=>`<div class="diff-row"><strong>${esc(x.title)}</strong>${type==='changed'?`<br><span class="muted">${esc(x.changes.join(', '))}</span>`:`<br><span class="muted">${esc(x.url||x.source)}</span>`}</div>`).join('') || '<div class="muted">None</div>';
    $('#compare-details').innerHTML = `<div class="diff-column"><h3>Comparison only +${d.added.length}</h3><div class="diff-list">${renderItems(d.added,'added')}</div></div><div class="diff-column"><h3>Current only −${d.removed.length}</h3><div class="diff-list">${renderItems(d.removed,'removed')}</div></div><div class="diff-column"><h3>Changed ~${d.changed.length}</h3><div class="diff-list">${renderItems(d.changed,'changed')}</div></div>`;
    $('#compare-details').classList.remove('hidden');
    $('#export-diff').classList.remove('hidden');
  }

  function showManga(index) {
    const m = state.data?.backupManga?.[Number(index)];
    if (!m) return;
    state.modalMangaIndex = Number(index);
    const cats = m.categories.map(id => state.categoryMap.get(key64(id))?.name).filter(Boolean);
    const genres = displayGenres(m);
    const source = sourceName(m);
    const chapters = [...m.chapters].sort((a,b) => asNum(b.chapterNumber)-asNum(a.chapterNumber) || asNum(b.sourceOrder)-asNum(a.sourceOrder));
    const trackingHtml = m.tracking.length ? m.tracking.map(t=>`<div class="tracking-card"><strong>${esc(t.title || displayTitle(m))}</strong><small>Tracker ID ${esc(t.syncId ?? '—')} · Progress ${esc(t.lastChapterRead ?? 0)} / ${esc(t.totalChapters ?? '—')} · Score ${esc(t.score ?? '—')}</small>${t.trackingUrl?`<small>${esc(t.trackingUrl)}</small>`:''}</div>`).join('') : '<div class="empty-state">No tracking entries.</div>';
    const chapterHtml = chapters.length ? chapters.map(c => `<div class="chapter-row"><div><strong>${esc(c.name || `Chapter ${c.chapterNumber ?? ''}`)}</strong><small>${c.scanlator?esc(c.scanlator):''}${c.lastPageRead?` · page ${esc(c.lastPageRead)}`:''}${c.dateUpload?` · ${new Date(asNum(c.dateUpload)).toLocaleDateString()}`:''}</small></div><div class="chapter-flags">${c.read?'<span class="flag read">Read</span>':'<span class="flag">Unread</span>'}${c.bookmark?'<span class="flag bookmark">★</span>':''}</div></div>`).join('') : '<div class="empty-state">No chapters stored in this backup.</div>';

    $('#modal-content').innerHTML = `
      <div class="detail-hero">
        <div>${displayCover(m)?`<img class="detail-cover" src="${esc(displayCover(m))}" alt="" referrerpolicy="no-referrer">`:`<div class="detail-cover cover-fallback">◇</div>`}</div>
        <div><div class="eyebrow">${esc(source)}</div><h2 id="modal-title" class="detail-title">${esc(displayTitle(m))}</h2>
          <div class="chips">${cats.map(c=>`<span class="chip">${esc(c)}</span>`).join('')}${genres.slice(0,12).map(g=>`<span class="chip">${esc(g)}</span>`).join('')}</div>
          <div class="metadata"><div><b>Author</b>${esc(displayAuthor(m)||'—')}</div><div><b>Artist</b>${esc(displayArtist(m)||'—')}</div><div><b>Status</b>${esc(displayStatus(m))}</div><div><b>Progress</b>${readCount(m)} / ${m.chapters.length} read</div><div><b>Bookmarks</b>${bookmarkCount(m)}</div><div><b>Tracking</b>${m.tracking.length}</div></div>
        </div>
      </div>
      <div class="modal-tabs"><button class="modal-tab active" data-modal-tab="overview">Overview</button><button class="modal-tab" data-modal-tab="chapters">Chapters</button><button class="modal-tab" data-modal-tab="tracking">Tracking</button><button class="modal-tab" data-modal-tab="raw">Raw</button></div>
      <div class="modal-tab-panel" data-modal-panel="overview">${displayDescription(m)?`<p class="description">${esc(displayDescription(m))}</p>`:'<p class="muted">No description stored.</p>'}${m.notes?`<p class="description"><strong>Notes:</strong> ${esc(m.notes)}</p>`:''}<div class="detail-list"><div class="detail-item"><span>Source ID</span><strong>${esc(key64(m.source))}</strong></div><div class="detail-item"><span>Date added</span><strong>${asNum(m.dateAdded)?new Date(asNum(m.dateAdded)).toLocaleString():'—'}</strong></div><div class="detail-item"><span>Last read</span><strong>${lastRead(m)?new Date(lastRead(m)).toLocaleString():'—'}</strong></div><div class="detail-item"><span>Merged references</span><strong>${m.mergedMangaReferences.length}</strong></div></div></div>
      <div class="modal-tab-panel hidden" data-modal-panel="chapters"><div class="chapter-head"><h3>Chapters</h3><span class="muted">${chapters.length.toLocaleString()} total</span></div><div class="chapter-list">${chapterHtml}</div></div>
      <div class="modal-tab-panel hidden" data-modal-panel="tracking"><div class="tracking-grid">${trackingHtml}</div></div>
      <div class="modal-tab-panel hidden" data-modal-panel="raw"><pre class="raw-box">${esc(JSON.stringify(m,null,2))}</pre></div>`;
    $('#modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function switchModalTab(name) {
    $$('.modal-tab').forEach(b=>b.classList.toggle('active',b.dataset.modalTab===name));
    $$('.modal-tab-panel').forEach(p=>p.classList.toggle('hidden',p.dataset.modalPanel!==name));
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
    if (name === 'tools') $('#debug-output').textContent = state.debug.join('\n');
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
    state.cache={health:null,duplicates:null,activity:null}; state.quickFilter='';
    $('#app-view').classList.add('hidden'); $('#loader-view').classList.remove('hidden'); document.body.classList.remove('has-backup');
    closeModal(); closeReport(); diag('Ready · choose a Komikku .tachibk backup.'); window.scrollTo({top:0,behavior:'smooth'});
  }

  function clearViewerSettings() {
    localStorage.removeItem(SETTINGS_KEY);
    state.settings = { ...defaultSettings };
    document.documentElement.classList.remove('light');
    applySavedSettings();
    if (state.data) applyFilters(true);
    toast('Viewer settings cleared');
  }

  function bind() {
    $('#choose-file').addEventListener('click', e => { e.stopPropagation(); $('#file-input').click(); });
    $('#new-backup').addEventListener('click', () => state.data ? closeBackup() : $('#file-input').click());
    $('#open-another').addEventListener('click', () => $('#file-input').click());
    $('#file-input').addEventListener('change', e => openFile(e.target.files?.[0]));
    $('#mobile-menu-toggle').addEventListener('click', e => {
      e.stopPropagation();
      setMobileMenu(!document.body.classList.contains('mobile-menu-open'));
    });

    const dz = $('#drop-zone');
    dz.addEventListener('click', e => { if (!e.target.closest('button')) $('#file-input').click(); });
    dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file-input').click(); } });
    ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', e => openFile(e.dataTransfer.files?.[0]));

    $('#search-input').addEventListener('input', () => applyFilters(true));
    ['category-filter','status-filter','read-filter','sort-select'].forEach(id => {
      $(`#${id}`).addEventListener('change', () => {
        if (id === 'sort-select') saveSettings({sort:$('#sort-select').value});
        if (id === 'status-filter') saveSettings({status:$('#status-filter').value});
        if (id === 'read-filter') saveSettings({read:$('#read-filter').value});
        applyFilters(true);
      });
    });
    $('#view-mode-select').addEventListener('change',()=>{saveSettings({viewMode:$('#view-mode-select').value});renderLibrary();});
    $('#card-size-select').addEventListener('change',()=>{saveSettings({cardSize:$('#card-size-select').value});renderLibrary();});
    $('#page-size-select').addEventListener('change',()=>{state.pageSize=Number($('#page-size-select').value)||30;saveSettings({pageSize:state.pageSize});applyFilters(true);});
    $('#quick-chips').addEventListener('click',e=>{const btn=e.target.closest('[data-quick]');if(!btn)return;const q=btn.dataset.quick;if(q==='clear'){state.quickFilter='';$('#search-input').value='';$('#category-filter').value='all';$('#status-filter').value='all';$('#read-filter').value='all';}else state.quickFilter=state.quickFilter===q?'':q;updateQuickChipUi();applyFilters(true);});

    $('#prev-page').addEventListener('click', () => { state.page--; renderLibrary(); window.scrollTo({top:120,behavior:'smooth'}); });
    $('#next-page').addEventListener('click', () => { state.page++; renderLibrary(); window.scrollTo({top:120,behavior:'smooth'}); });
    $$('.nav-btn').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
    $$('#explore-tabs [data-explore]').forEach(b=>b.addEventListener('click',()=>switchExploreTab(b.dataset.explore)));
    $$('#analysis-tabs [data-analysis]').forEach(b=>b.addEventListener('click',()=>switchAnalysisTab(b.dataset.analysis)));

    $('#dashboard-health-jump').addEventListener('click',()=>{switchView('analyze');switchAnalysisTab('health');});
    $('#choose-compare').addEventListener('click',()=>$('#compare-input').click());
    $('#compare-input').addEventListener('change',e=>loadComparison(e.target.files?.[0]));
    $('#export-diff').addEventListener('click',exportDiff);
    $('#export-json').addEventListener('click', exportJson);
    $('#export-tachibk').addEventListener('click', exportTachibk);
    $('#summary-report').addEventListener('click',openSummaryReport);
    $('#print-report').addEventListener('click',()=>window.print());
    $('#clear-settings').addEventListener('click',clearViewerSettings);
    $('#clear-session').addEventListener('click', closeBackup);

    document.addEventListener('click', e => {
      if (document.body.classList.contains('mobile-menu-open') && !e.target.closest('#primary-nav') && !e.target.closest('#mobile-menu-toggle')) setMobileMenu(false);
      const hit = e.target.closest('[data-manga-index]');
      if (hit) showManga(hit.dataset.mangaIndex);
      const modalTab=e.target.closest('[data-modal-tab]'); if(modalTab) switchModalTab(modalTab.dataset.modalTab);
      const categoryJump=e.target.closest('[data-category-jump]'); if(categoryJump) jumpToLibrary({category:categoryJump.dataset.categoryJump});
      const sourceJump=e.target.closest('[data-source-jump]'); if(sourceJump) jumpToLibrary({source:sourceJump.dataset.sourceJump});
      const viewJump=e.target.closest('[data-view-jump]'); if(viewJump) switchView(viewJump.dataset.viewJump);
      const exploreJump=e.target.closest('[data-explore-tab]'); if(exploreJump){switchView('explore');switchExploreTab(exploreJump.dataset.exploreTab);}
      const analysisJump=e.target.closest('[data-analysis-tab]'); if(analysisJump){switchView('analyze');switchAnalysisTab(analysisJump.dataset.analysisTab);}
      if (e.target.closest('[data-close-modal]')) closeModal();
      if (e.target.closest('[data-close-report]')) closeReport();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { setMobileMenu(false); closeModal(); closeReport(); } });

    window.addEventListener('resize', () => { if (!window.matchMedia('(max-width: 1050px)').matches) setMobileMenu(false); });

    $('#theme-toggle').addEventListener('click', () => {
      document.documentElement.classList.toggle('light');
      const theme=document.documentElement.classList.contains('light')?'light':'dark'; saveSettings({theme}); updateThemeUi();
    });
  }

  window.addEventListener('DOMContentLoaded', async () => {
    bind(); applySavedSettings();
    try { await ensureSchema(); diag('Ready ✓ · Komikku schema loaded · GZIP/raw protobuf supported.'); }
    catch (error) { diag(error.message, true); }
  });
})();
