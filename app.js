
 ===== ユーティリティ =====
const uuid = () = crypto.randomUUID.()  ([1e7]+-1e3+-4e3+-8e3+-1e11).replace([018]g,c=(c^crypto.getRandomValues(new Uint8Array(1))[0]&15c4).toString(16));
const now = () = Date.now();

function parseTags(text) {
  return (text  )
    .split(,)
    .map(s = s.trim())
    .filter(s = s.length  0);
}

 画像を最大幅1024pxで縮小し、JPEG品質0.85でDataURL化
async function imageFileToDataUrl(file, { maxW = 1024, quality = 0.85 } = {}) {
  const img = await new Promise((resolve, reject) = {
    const reader = new FileReader();
    reader.onload = () = {
      const i = new Image();
      i.onload = () = resolve(i);
      i.onerror = reject;
      i.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const scale = Math.min(1, maxW  img.width);
  const w = Math.round(img.width  scale);
  const h = Math.round(img.height  scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('imagejpeg', quality);
}

 ===== IndexedDB ラッパ（cards  albums） =====
const DB_NAME = 'cardAlbumDB';
const DB_VER  = 1;
let db;

function openDB() {
  return new Promise((resolve, reject) = {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (ev) = {
      db = ev.target.result;
      if (!db.objectStoreNames.contains('cards')) {
        db.createObjectStore('cards', { keyPath 'id' });
      }
      if (!db.objectStoreNames.contains('albums')) {
        db.createObjectStore('albums', { keyPath 'id' });
      }
    };
    req.onsuccess = () = { db = req.result; resolve(db); };
    req.onerror = () = reject(req.error);
  });
}
function tx(storeName, mode='readonly') {
  const t = db.transaction(storeName, mode);
  return t.objectStore(storeName);
}
function put(store, obj) {
  return new Promise((resolve, reject) = {
    const req = tx(store, 'readwrite').put(obj);
    req.onsuccess = () = resolve(true);
    req.onerror = () = reject(req.error);
  });
}
function getAll(store) {
  return new Promise((resolve, reject) = {
    const req = tx(store, 'readonly').getAll();
    req.onsuccess = () = resolve(req.result  []);
    req.onerror = () = reject(req.error);
  });
}
function get(store, key) {
  return new Promise((resolve, reject) = {
    const req = tx(store, 'readonly').get(key);
    req.onsuccess = () = resolve(req.result  null);
    req.onerror = () = reject(req.error);
  });
}
function del(store, key) {
  return new Promise((resolve, reject) = {
    const req = tx(store, 'readwrite').delete(key);
    req.onsuccess = () = resolve(true);
    req.onerror = () = reject(req.error);
  });
}

 ===== UI ロジック =====
const els = {
  cardForm document.getElementById('cardForm'),
  cardName document.getElementById('cardName'),
  cardGenres document.getElementById('cardGenres'),
  cardImage document.getElementById('cardImage'),
  cardStatus document.getElementById('cardStatus'),
  cardList document.getElementById('cardList'),

  albumForm document.getElementById('albumForm'),
  albumTitle document.getElementById('albumTitle'),
  albumGenres document.getElementById('albumGenres'),
  albumCardPicker document.getElementById('albumCardPicker'),
  albumCount document.getElementById('albumCount'),
  albumStatus document.getElementById('albumStatus'),

  searchForm document.getElementById('searchForm'),
  searchKeyword document.getElementById('searchKeyword'),
  searchClear document.getElementById('searchClear'),
  albumList document.getElementById('albumList'),

  exportBtn document.getElementById('exportBtn'),
  importFile document.getElementById('importFile'),
  importBtn document.getElementById('importBtn'),
  backupStatus document.getElementById('backupStatus'),
};

let selectedCardIds = new Set();

function renderCards(cards) {
  els.cardList.innerHTML = '';
  cards.sort((a,b) = b.createdAt - a.createdAt).forEach(card = {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      ${card.imageDataUrl}
      div class=meta
        divstrong${card.name}strongdiv
        div class=tags${card.genres.join(', ')  '—'}div
        div class=tagsID ${card.id}div
      div
    `;
    els.cardList.appendChild(div);
  });
}

function renderAlbumPicker(cards) {
  els.albumCardPicker.innerHTML = '';
  cards.sort((a,b) = b.createdAt - a.createdAt).forEach(card = {
    const div = document.createElement('div');
    div.className = 'card selectable' + (selectedCardIds.has(card.id)  ' selected'  '');
    div.innerHTML = `
      ${card.imageDataUrl}
      div class=meta
        divstrong${card.name}strongdiv
        div class=tags${card.genres.join(', ')  '—'}div
      div
    `;
    div.addEventListener('click', () = {
      if (selectedCardIds.has(card.id)) {
        selectedCardIds.delete(card.id);
      } else {
        if (selectedCardIds.size = 20) {
          alert('アルバムは最大20枚までです。');
          return;
        }
        selectedCardIds.add(card.id);
      }
      renderAlbumPicker(cards);
      els.albumCount.textContent = `選択枚数 ${selectedCardIds.size}  20`;
    });
    els.albumCardPicker.appendChild(div);
  });
  els.albumCount.textContent = `選択枚数 ${selectedCardIds.size}  20`;
}

async function renderAlbums(albums, { filterGenre = null } = {}) {
  els.albumList.innerHTML = '';
  const allCards = await getAll('cards');
  function hasGenre(album, g) {
    const gLower = g.toLowerCase();
    const albumHit = album.genres.some(x = x.toLowerCase().includes(gLower));
    const cardHit = album.cardIds.some(id = {
      const c = allCards.find(x = x.id === id);
      return c  c.genres.some(t = t.toLowerCase().includes(gLower))  false;
    });
    return albumHit  cardHit;
  }

  const toShow = (filterGenre)
     albums.filter(a = hasGenre(a, filterGenre))
     albums;

  toShow.sort((a,b) = b.createdAt - a.createdAt).forEach(album = {
     カバー画像 = 最初のカード
    const firstCard = allCards.find(c = c.id === album.cardIds[0]);
    const coverUrl = firstCard.imageDataUrl  '';
    const div = document.createElement('div');
    div.className = 'album';
    div.innerHTML = `
      div class=albumCover
        ${coverUrl}
        div class=count枚数 ${album.cardIds.length}div
      div
      div class=meta
        divstrong${album.title}strongdiv
        div class=tags${album.genres.join(', ')  '—'}div
      div
    `;
    div.addEventListener('click', () = showAlbumDetail(album, allCards));
    els.albumList.appendChild(div);
  });
}

function showAlbumDetail(album, allCards) {
  const cards = album.cardIds.map(id = allCards.find(c = c.id === id)).filter(Boolean);
  const w = window.open('', '_blank');
  const html = `
    html lang=jaheadmeta charset=utf-8title${album.title}title
    style
    body { font-family system-ui, -apple-system, Segoe UI, Roboto, Hiragino Kaku Gothic ProN, Noto Sans JP, sans-serif; margin20px; }
    .grid { displaygrid; grid-template-columns repeat(auto-fill, minmax(220px,1fr)); gap12px; }
    .card { border1px solid #ddd; border-radius8px; overflowhidden; }
    .card img { width100%; height180px; object-fitcover; displayblock; }
    .meta { padding8px; color#333; }
    .tags { color#666; font-size12px; }
    style
    headbody
      h1${album.title}h1
      divジャンル ${album.genres.join(', ')  '—'}div
      hr
      div class=grid
        ${cards.map(c = `
          div class=card
            ${c.imageDataUrl}
            div class=meta
              divstrong${c.name}strongdiv
              div class=tags${c.genres.join(', ')  '—'}div
            div
          div
        `).join('')}
      div
    bodyhtml
  `;
  w.document.write(html);
  w.document.close();
}

 ===== イベント =====
(async function init() {
  await openDB();
  const cards = await getAll('cards');
  renderCards(cards);
  renderAlbumPicker(cards);
  const albums = await getAll('albums');
  renderAlbums(albums);

   カード登録
  els.cardForm.addEventListener('submit', async (ev) = {
    ev.preventDefault();
    try {
      const name = els.cardName.value.trim();
      const genres = parseTags(els.cardGenres.value);
      const file = els.cardImage.files[0];
      if (!name  !file) { return; }
      const dataUrl = await imageFileToDataUrl(file, { maxW 1024, quality 0.85 });
      const card = { id uuid(), name, genres, imageDataUrl dataUrl, createdAt now() };
      await put('cards', card);
      els.cardStatus.textContent = 'カードを登録しました。';
      els.cardForm.reset();
      const updated = await getAll('cards');
      renderCards(updated);
      renderAlbumPicker(updated);
    } catch (e) {
      console.error(e);
      els.cardStatus.textContent = '登録に失敗しました。';
    }
  });

   アルバム作成
  els.albumForm.addEventListener('submit', async (ev) = {
    ev.preventDefault();
    try {
      const title = els.albumTitle.value.trim();
      const genres = parseTags(els.albumGenres.value);
      if (!title) return;
      const ids = Array.from(selectedCardIds);
      if (ids.length === 0) {
        alert('カードを1枚以上選択してください。');
        return;
      }
      const album = { id uuid(), title, genres, cardIds ids, createdAt now() };
      await put('albums', album);
      els.albumStatus.textContent = 'アルバムを作成しました。';
      els.albumForm.reset();
      selectedCardIds.clear();
      const albums = await getAll('albums');
      renderAlbums(albums);
      const cards = await getAll('cards');
      renderAlbumPicker(cards);
    } catch (e) {
      console.error(e);
      els.albumStatus.textContent = '作成に失敗しました。';
    }
  });

   検索
  els.searchForm.addEventListener('submit', async (ev) = {
    ev.preventDefault();
    const kw = els.searchKeyword.value.trim();
    const albums = await getAll('albums');
    await renderAlbums(albums, { filterGenre kw  null });
  });
  els.searchClear.addEventListener('click', async () = {
    els.searchKeyword.value = '';
    const albums = await getAll('albums');
    await renderAlbums(albums);
  });

   エクスポート
  els.exportBtn.addEventListener('click', async () = {
    try {
      const cards = await getAll('cards');
      const albums = await getAll('albums');
      const blob = new Blob([JSON.stringify({ cards, albums }, null, 2)], { type 'applicationjson' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `card-album-backup-${new Date().toISOString().slice(0,19).replace([T]g,'-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      els.backupStatus.textContent = 'エクスポートしました。';
    } catch (e) {
      console.error(e);
      els.backupStatus.textContent = 'エクスポートに失敗しました。';
    }
  });

   インポート
  els.importBtn.addEventListener('click', async () = {
    const file = els.importFile.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const cards = Array.isArray(data.cards)  data.cards  [];
      const albums = Array.isArray(data.albums)  data.albums  [];
       既存に追記（重複IDは上書き）
      for (const c of cards) await put('cards', c);
      for (const a of albums) await put('albums', a);
      els.backupStatus.textContent = 'インポートしました。';
      renderCards(await getAll('cards'));
      renderAlbumPicker(await getAll('cards'));
      renderAlbums(await getAll('albums'));
    } catch (e) {
      console.error(e);
      els.backupStatus.textContent = 'インポートに失敗しました。';
    }
  });
})();
