(() => {
  'use strict';

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
  };

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (v = '') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const asArray = v => Array.isArray(v) ? v : [];
  const asNum = v => Number(v || 0);
  const key64 = v => v == null ? '' : String(v);
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  const statusNames = {0:'Unknown',1:'Ongoing',2:'Completed',3:'Licensed',4:'Publishing finished',5:'Cancelled',6:'On hiatus'};

  function log(message) {
    const line = `${new Date().toLocaleTimeString()}  ${message}`;
    state.debug.push(line);
    if (state.debug.length > 60) state.debug.shift();
    const out = $('#debug-output');
    if (out) out.textContent = state.debug.join('\n');
  }

  function diag(message, error = false) {
    const el = $('#diagnostic');
    el.textContent = message;
    el.classList.toggle('error', !!error);
    log(message);
  }

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.add('hidden'), 2400);
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

  async function readBackup(file) {
    state.debug = [];
    diag(`Reading ${file.name} · ${formatBytes(file.size)}…`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const header = [...bytes.slice(0, 8)].map(n => n.toString(16).padStart(2, '0')).join(' ');
    log(`File header: ${header || '(empty)'}`);
    if (!bytes.length) throw new Error('The selected file is empty.');

    if (isJsonBytes(bytes) || file.name.toLowerCase().endsWith('.json')) {
      log('Detected JSON backup.');
      const text = new TextDecoder().decode(bytes);
      return normalizeData(JSON.parse(text));
    }

    const Backup = await ensureSchema();
    let payload = bytes;
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      diag('GZIP header detected · decompressing…');
      payload = await gunzip(bytes);
      log(`GZIP OK · ${formatBytes(payload.length)} protobuf payload.`);
    } else {
      log('No GZIP header · decoding as raw protobuf, matching Komikku decoder behavior.');
    }

    diag('Decoding Komikku protobuf…');
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
    log(`Protobuf OK · ${asArray(data.backupManga).length} manga decoded.`);
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
      const data = await readBackup(file);
      state.data = data;
      state.fileName = file.name;
      buildIndexes();
      $('#loader-view').classList.add('hidden');
      $('#app-view').classList.remove('hidden');
      document.body.classList.add('has-backup');
      $('#backup-name').textContent = file.name;
      $('#backup-summary').textContent = `${data.backupManga.length.toLocaleString()} manga · ${data.backupCategories.length} categories · ${data.backupSources.length} sources`;
      diag(`Komikku backup loaded ✓ · ${data.backupManga.length.toLocaleString()} manga.`);
      populateFilters();
      updateAllViews();
      switchView('library');
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
  function unreadCount(m) { return m.chapters.reduce((n, c) => n + (c.read ? 0 : 1), 0); }
  function readCount(m) { return m.chapters.length - unreadCount(m); }
  function bookmarkCount(m) { return m.chapters.reduce((n, c) => n + (c.bookmark ? 1 : 0), 0); }
  function lastRead(m) { return Math.max(0, ...m.history.map(h => asNum(h.lastRead))); }

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

  function applyFilters(resetPage = false) {
    if (!state.data) return;
    if (resetPage) state.page = 1;
    const q = $('#search-input').value.trim().toLowerCase();
    const cat = $('#category-filter').value;
    const status = $('#status-filter').value;
    const read = $('#read-filter').value;
    const sort = $('#sort-select').value;

    let list = state.data.backupManga.filter(m => {
      if (q) {
        const hay = [displayTitle(m), displayAuthor(m), displayArtist(m), ...displayGenres(m)].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (cat !== 'all' && !m.categories.some(c => key64(c) === cat)) return false;
      const actualStatus = asNum(m.customStatus) || asNum(m.status);
      if (status !== 'all' && actualStatus !== Number(status)) return false;
      if (read === 'unread' && unreadCount(m) === 0) return false;
      if (read === 'read' && unreadCount(m) !== 0) return false;
      if (read === 'bookmarked' && bookmarkCount(m) === 0) return false;
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

  function renderRecent() {
    const list = [...state.data.backupManga].filter(m => lastRead(m) > 0).sort((a,b) => lastRead(b)-lastRead(a)).slice(0,100);
    $('#recent-list').innerHTML = list.length ? list.map(m => {
      const idx = state.data.backupManga.indexOf(m);
      const date = new Date(lastRead(m));
      return `<button class="card-hit" data-manga-index="${idx}"><article class="recent-row">${displayCover(m)?`<img class="recent-thumb" src="${esc(displayCover(m))}" alt="" loading="lazy" referrerpolicy="no-referrer">`:`<div class="recent-thumb cover-fallback">◇</div>`}<div><strong>${esc(displayTitle(m))}</strong><small>${esc(state.sourceMap.get(key64(m.source)) || key64(m.source))} · ${unreadCount(m)} unread</small></div><div><small>${date.toLocaleString()}</small></div></article></button>`;
    }).join('') : '<div class="empty-state">No reading history found in this backup.</div>';
  }

  function renderStats() {
    const mangas = state.data.backupManga;
    const chapters = mangas.reduce((n,m) => n + m.chapters.length, 0);
    const unread = mangas.reduce((n,m) => n + unreadCount(m), 0);
    const bookmarks = mangas.reduce((n,m) => n + bookmarkCount(m), 0);
    const stats = [['Manga',mangas.length],['Chapters',chapters],['Unread',unread],['Bookmarks',bookmarks]];
    $('#stat-cards').innerHTML = stats.map(([label,val]) => `<div class="stat-card"><strong>${Number(val).toLocaleString()}</strong><span>${label}</span></div>`).join('');

    const counts = new Map();
    mangas.forEach(m => {
      const name = state.sourceMap.get(key64(m.source)) || key64(m.source) || 'Unknown source';
      counts.set(name, (counts.get(name)||0)+1);
    });
    const sourceRows = [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,25);
    const max = sourceRows[0]?.[1] || 1;
    $('#source-stats').innerHTML = sourceRows.map(([name,count]) => `<div class="bar-row"><span title="${esc(name)}">${esc(name)}</span><div class="bar-track"><i style="width:${count/max*100}%"></i></div><b>${count}</b></div>`).join('') || '<div class="muted">No source data.</div>';

    const items = [
      ['Categories', state.data.backupCategories.length],
      ['Hidden categories', state.data.backupCategories.filter(c=>c.hidden).length],
      ['Saved searches', state.data.backupSavedSearches.length],
      ['Global/latest feeds', state.data.backupFeeds.length],
      ['Extension stores', state.data.backupExtensionStores.length],
      ['App preferences', state.data.backupPreferences.length],
      ['Source preferences', state.data.backupSourcePreferences.length],
      ['Merged manga refs', mangas.reduce((n,m)=>n+m.mergedMangaReferences.length,0)],
    ];
    $('#komikku-stats').innerHTML = items.map(([k,v]) => `<div class="detail-item"><span>${esc(k)}</span><strong>${Number(v).toLocaleString()}</strong></div>`).join('');
  }

  function updateAllViews() {
    applyFilters(true);
    renderRecent();
    renderStats();
    const out = $('#debug-output');
    if (out) out.textContent = state.debug.join('\n');
  }

  function showManga(index) {
    const m = state.data?.backupManga?.[Number(index)];
    if (!m) return;
    const cats = m.categories.map(id => state.categoryMap.get(key64(id))?.name).filter(Boolean);
    const genres = displayGenres(m);
    const source = state.sourceMap.get(key64(m.source)) || key64(m.source) || 'Unknown';
    const track = m.tracking.length ? `${m.tracking.length} tracker entr${m.tracking.length===1?'y':'ies'}` : 'Not tracked';
    const chapters = [...m.chapters].sort((a,b) => asNum(b.chapterNumber)-asNum(a.chapterNumber) || asNum(b.sourceOrder)-asNum(a.sourceOrder));
    $('#modal-content').innerHTML = `
      <div class="detail-hero">
        <div>${displayCover(m)?`<img class="detail-cover" src="${esc(displayCover(m))}" alt="" referrerpolicy="no-referrer">`:`<div class="detail-cover cover-fallback">◇</div>`}</div>
        <div><div class="eyebrow">${esc(source)}</div><h2 id="modal-title" class="detail-title">${esc(displayTitle(m))}</h2>
          <div class="chips">${cats.map(c=>`<span class="chip">${esc(c)}</span>`).join('')}${genres.slice(0,12).map(g=>`<span class="chip">${esc(g)}</span>`).join('')}</div>
          <div class="metadata">
            <div><b>Author</b>${esc(displayAuthor(m)||'—')}</div><div><b>Artist</b>${esc(displayArtist(m)||'—')}</div>
            <div><b>Status</b>${esc(displayStatus(m))}</div><div><b>Progress</b>${readCount(m)} / ${m.chapters.length} read</div>
            <div><b>Bookmarks</b>${bookmarkCount(m)}</div><div><b>Tracking</b>${esc(track)}</div>
          </div>
        </div>
      </div>
      ${displayDescription(m)?`<p class="description">${esc(displayDescription(m))}</p>`:''}
      ${m.notes?`<p class="description"><strong>Notes:</strong> ${esc(m.notes)}</p>`:''}
      <div class="chapter-head"><h3>Chapters</h3><span class="muted">${chapters.length.toLocaleString()} total</span></div>
      <div class="chapter-list">${chapters.length ? chapters.map(c => `<div class="chapter-row"><div><strong>${esc(c.name || `Chapter ${c.chapterNumber ?? ''}`)}</strong><small>${c.scanlator?esc(c.scanlator):''}${c.lastPageRead?` · page ${esc(c.lastPageRead)}`:''}</small></div><div class="chapter-flags">${c.read?'<span class="flag read">Read</span>':'<span class="flag">Unread</span>'}${c.bookmark?'<span class="flag bookmark">★</span>':''}</div></div>`).join('') : '<div class="empty-state">No chapters stored in this backup.</div>'}</div>`;
    $('#modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    $('#modal').classList.add('hidden');
    document.body.style.overflow = '';
  }

  function switchView(name) {
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    ['library','recent','stats','tools'].forEach(v => $(`#${v}-panel`).classList.toggle('hidden', v !== name));
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

  function closeBackup() {
    state.data = null; state.fileName = ''; state.filtered = []; state.page = 1;
    document.body.classList.remove('has-backup');
    $('#app-view').classList.add('hidden');
    $('#loader-view').classList.remove('hidden');
    diag('Ready · choose a Komikku .tachibk backup.');
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function bind() {
    $('#choose-file').addEventListener('click', e => { e.stopPropagation(); $('#file-input').click(); });
    $('#new-backup').addEventListener('click', () => state.data ? closeBackup() : $('#file-input').click());
    $('#open-another').addEventListener('click', () => $('#file-input').click());
    $('#file-input').addEventListener('change', e => openFile(e.target.files?.[0]));

    const dz = $('#drop-zone');
    dz.addEventListener('click', e => { if (!e.target.closest('button')) $('#file-input').click(); });
    dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file-input').click(); } });
    ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', e => openFile(e.dataTransfer.files?.[0]));

    ['search-input','category-filter','status-filter','read-filter','sort-select'].forEach(id => {
      const el = $(`#${id}`);
      el.addEventListener(id === 'search-input' ? 'input' : 'change', () => applyFilters(true));
    });

    $('#prev-page').addEventListener('click', () => { state.page--; renderLibrary(); window.scrollTo({top:120,behavior:'smooth'}); });
    $('#next-page').addEventListener('click', () => { state.page++; renderLibrary(); window.scrollTo({top:120,behavior:'smooth'}); });
    $$('.nav-btn').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
    $('#export-json').addEventListener('click', exportJson);
    $('#export-tachibk').addEventListener('click', exportTachibk);
    $('#clear-session').addEventListener('click', closeBackup);
    document.addEventListener('click', e => {
      const hit = e.target.closest('[data-manga-index]');
      if (hit) showManga(hit.dataset.mangaIndex);
      if (e.target.closest('[data-close-modal]')) closeModal();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
    const syncThemeButton = () => {
      const light = document.documentElement.classList.contains('light');
      $('#theme-toggle').textContent = light ? '☾' : '☀';
      $('#theme-toggle').title = light ? 'Switch to dark theme' : 'Switch to light theme';
      $('#theme-toggle').setAttribute('aria-label', $('#theme-toggle').title);
    };
    $('#theme-toggle').addEventListener('click', () => {
      document.documentElement.classList.toggle('light');
      localStorage.setItem('kirin-komikku-theme', document.documentElement.classList.contains('light') ? 'light' : 'dark');
      syncThemeButton();
    });
    if (localStorage.getItem('kirin-komikku-theme') === 'light') document.documentElement.classList.add('light');
    syncThemeButton();
  }

  window.addEventListener('DOMContentLoaded', async () => {
    bind();
    try {
      await ensureSchema();
      diag('Ready ✓ · Komikku schema loaded · GZIP/raw protobuf supported.');
    } catch (error) {
      diag(error.message, true);
    }
  });
})();
