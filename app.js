
// ===== ユーティリティ =====
const uuid = () => crypto.randomUUID?.() || ([1e7]+-1e3+-4e3+-8e3+-1e11)
  .replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
const now = () => Date.now();

// 画像を最大幅1024pxで縮小し、JPEG品質0.85でDataURL化
async function imageFileToDataUrl(file, { maxW = 1024, quality = 0.85 } = {}) {
  if (!file) return "";
  const img = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const scale = Math.min(1, maxW / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

// ===== IndexedDB =====
const DB_NAME = 'cardAlbumDB';
const DB_VER  = 3; // ★ スキーマ簡略化（cards/albumsのみ使用）
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (ev) => {
      db = ev.target.result;
      // 既存のストアがなければ作成
      if (!db.objectStoreNames.contains('cards')) {
        db.createObjectStore('cards', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('albums')) {
        db.createObjectStore('albums', { keyPath: 'id' });
      }
      // 以前のattributesストアがあってもそのまま残して問題なし（未使用）
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}
function tx(storeName, mode='readonly') {
  const t = db.transaction(storeName, mode);
  return t.objectStore(storeName);
}
function put(store, obj) {
  return new Promise((resolve, reject) => {
    const req = tx(store, 'readwrite').put(obj);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}
function getAll(store) {
  return new Promise((resolve, reject) => {
    const req = tx(store, 'readonly').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
function del(store, key) {
  return new Promise((resolve, reject) => {
    const req = tx(store, 'readwrite').delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// ===== UI 要素 =====
const els = {
  // カード（登録）
  cardForm: document.getElementById('cardForm'),
  cardName: document.getElementById('cardName'),
  cardImage: document.getElementById('cardImage'),
  cardPreview: document.getElementById('cardPreview'),
  cardStatus: document.getElementById('cardStatus'),
  cardList: document.getElementById('cardList'),

  // アルバム（新規）
  albumForm: document.getElementById('albumForm'),
  albumTitle: document.getElementById('albumTitle'),
  albumCardPicker: document.getElementById('albumCardPicker'),
  albumCount: document.getElementById('albumCount'),
  albumStatus: document.getElementById('albumStatus'),

  // アルバム一覧
  albumList: document.getElementById('albumList'),

  // バックアップ
  exportBtn: document.getElementById('exportBtn'),
  importFile: document.getElementById('importFile'),
  importBtn: document.getElementById('importBtn'),
  backupStatus: document.getElementById('backupStatus'),

  // カード編集モーダル
  cardEditModal: document.getElementById('cardEditModal'),
  cardEditClose: document.getElementById('cardEditClose'),
  cardEditForm: document.getElementById('cardEditForm'),
  cardEditId: document.getElementById('cardEditId'),
  cardEditName: document.getElementById('cardEditName'),
  cardEditImage: document.getElementById('cardEditImage'),
  cardEditPreview: document.getElementById('cardEditPreview'),
  cardDeleteBtn: document.getElementById('cardDeleteBtn'),
  cardEditStatus: document.getElementById('cardEditStatus'),

  // アルバム編集モーダル
  albumEditModal: document.getElementById('albumEditModal'),
  albumEditClose: document.getElementById('albumEditClose'),
  albumEditForm: document.getElementById('albumEditForm'),
  albumEditId: document.getElementById('albumEditId'),
  albumEditTitle: document.getElementById('albumEditTitle'),
  albumEditPicker: document.getElementById('albumEditPicker'),
  albumEditCount: document.getElementById('albumEditCount'),
  albumDeleteBtn: document.getElementById('albumDeleteBtn'),
  albumEditStatus: document.getElementById('albumEditStatus'),
};

let selectedCardIds = new Set();

// ===== レンダリング =====
function renderCards(cards) {
  els.cardList.innerHTML = '';
  cards.sort((a,b) => b.createdAt - a.createdAt).forEach(card => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      ${card.imageDataUrl}
      <div class="meta">
        <div><strong>${card.name}</strong></div>
        <div class="tags">ID: ${card.id}</div>
      </div>
      <div class="actions">
        <button class="ghost" data-id="${card.id}" data-act="edit">編集</button>
        <button class="danger" data-id="${card.id}" data-act="delete">削除</button>
      </div>
    `;
    // 編集／削除ボタン
    div.querySelector('[data-act="edit"]').addEventListener('click', () => openCardEdit(card));
    div.querySelector('[data-act="delete"]').addEventListener('click', () => deleteCard(card.id));
    els.cardList.appendChild(div);
  });
}

function renderAlbumPicker(cards, targetEl, selectedSet, countEl) {
  targetEl.innerHTML = '';
  cards.sort((a,b) => b.createdAt - a.createdAt).forEach(card => {
    const div = document.createElement('div');
    div.className = 'card selectable' + (selectedSet.has(card.id) ? ' selected' : '');
    div.innerHTML = `
      ${card.imageDataUrl}
      <div class="meta">
        <div><strong>${card.name}</strong></div>
      </div>
    `;
    div.addEventListener('click', () => {
      if (selectedSet.has(card.id)) {
        selectedSet.delete(card.id);
      } else {
        if (selectedSet.size >= 20) {
          alert('アルバムは最大20枚までです。');
          return;
        }
        selectedSet.add(card.id);
      }
      renderAlbumPicker(cards, targetEl, selectedSet, countEl);
      if (countEl) countEl.textContent = `選択枚数: ${selectedSet.size} / 20`;
    });
    targetEl.appendChild(div);
  });
  if (countEl) countEl.textContent = `選択枚数: ${selectedSet.size} / 20`;
}

async function renderAlbums(albums) {
  els.albumList.innerHTML = '';
  const allCards = await getAll('cards');

  albums.sort((a,b) => b.createdAt - a.createdAt).forEach(album => {
    const firstCard = allCards.find(c => c.id === album.cardIds[0]);
    const coverUrl = firstCard?.imageDataUrl || '';
    const div = document.createElement('div');
    div.className = 'album';
    div.innerHTML = `
      <div class="albumCover">
        ${coverUrl}
        <div class="count">枚数: ${album.cardIds.length}</div>
      </div>
      <div class="meta">
        <div><strong>${album.title}</strong></div>
      </div>
      <div class="actions">
        <button class="ghost" data-id="${album.id}" data-act="view">表示</button>
        <button class="ghost" data-id="${album.id}" data-act="edit">編集</button>
        <button class="danger" data-id="${album.id}" data-act="delete">削除</button>
      </div>
    `;
    // ボタンイベント
    div.querySelector('[data-act="view"]').addEventListener('click', () => showAlbumDetail(album, allCards));
    div.querySelector('[data-act="edit"]').addEventListener('click', () => openAlbumEdit(album));
    div.querySelector('[data-act="delete"]').addEventListener('click', () => deleteAlbum(album.id));
    els.albumList.appendChild(div);
  });
}

// アルバム詳細（10枚×2段、スマホは列数縮小）
function showAlbumDetail(album, allCards) {
  const cards = album.cardIds.map(id => allCards.find(c => c.id === id)).filter(Boolean);
  const w = window.open('', '_blank');
  const html = `
    <html lang="ja"><head><meta charset="utf-8"><title>${album.title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif; margin:0; background:#111; color:#eee; }
    header { padding:12px 16px; border-bottom:1px solid #333; }
    .wrap { padding:12px 16px; }
    .grid20 { display:grid; grid-template-columns: repeat(10, 1fr); gap:8px; }
    .grid20 .item { background:#0b0e14; border:1px solid #333; border-radius:8px; overflow:hidden; }
    .grid20 img { width:100%; aspect-ratio: 1 / 1; object-fit:cover; display:block; }
    .grid20 .meta { padding:6px; color:#ccc; font-size:12px; text-align:center; }
    @media (max-width: 900px) { .grid20 { grid-template-columns: repeat(5, 1fr); } }
    @media (max-width: 600px) { .grid20 { grid-template-columns: repeat(2, 1fr); } }
    </style>
    </head><body>
      <header>
        <h1 style="margin:0;font-size:18px;">${album.title}</h1>
      </header>
      <div class="wrap">
        <div class="grid20">
          ${cards.map(c => `
            <div class="item">
              ${c.imageDataUrl}
              <div class="meta">${c.name}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </body></html>
  `;
  w.document.write(html);
  w.document.close();
}

// ===== カード編集 =====
function openCardEdit(card) {
  els.cardEditId.value = card.id;
  els.cardEditName.value = card.name;
  els.cardEditPreview.innerHTML = `${card.imageDataUrl}`;
  els.cardEditStatus.textContent = '';
  els.cardEditModal.classList.remove('hidden');
}
els.cardEditClose.addEventListener('click', () => {
  els.cardEditModal.classList.add('hidden');
  els.cardEditForm.reset();
  els.cardEditPreview.innerHTML = '';
});
els.cardEditImage.addEventListener('change', () => {
  const file = els.cardEditImage.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  els.cardEditPreview.innerHTML = `${url}`;
});

els.cardEditForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    const id = els.cardEditId.value;
    const name = els.cardEditName.value.trim();
    const file = els.cardEditImage.files[0];

    if (!name) return;
    const cards = await getAll('cards');
    const card = cards.find(c => c.id === id);
    if (!card) throw new Error('カードが見つかりません');

    let imageDataUrl = card.imageDataUrl;
    if (file) imageDataUrl = await imageFileToDataUrl(file, { maxW: 1024, quality: 0.85 });

    const updated = { ...card, name, imageDataUrl };
    await put('cards', updated);

    els.cardEditStatus.textContent = '保存しました。';
    // 再描画
    renderCards(await getAll('cards'));
    renderAlbumPicker(await getAll('cards'), els.albumCardPicker, selectedCardIds, els.albumCount);
  } catch (e) {
    console.error(e);
    els.cardEditStatus.textContent = '保存に失敗しました。';
  }
});

async function deleteCard(cardId) {
  if (!confirm('このカードを削除しますか？（アルバムからも除外されます）')) return;
  await del('cards', cardId);
  // アルバムからも除外
  const albums = await getAll('albums');
  for (const a of albums) {
    const newIds = a.cardIds.filter(id => id !== cardId);
    if (newIds.length !== a.cardIds.length) {
      a.cardIds = newIds;
      await put('albums', a);
    }
  }
  // 再描画
  renderCards(await getAll('cards'));
  renderAlbumPicker(await getAll('cards'), els.albumCardPicker, selectedCardIds, els.albumCount);
  renderAlbums(await getAll('albums'));
}

// ===== アルバム編集 =====
function openAlbumEdit(album) {
  els.albumEditId.value = album.id;
  els.albumEditTitle.value = album.title;
  els.albumEditStatus.textContent = '';
  // ピッカー初期化（既存選択を反映）
  getAll('cards').then(cards => {
    const set = new Set(album.cardIds);
    renderAlbumPicker(cards, els.albumEditPicker, set, els.albumEditCount);
    // 保存時にこのSetを使えるようにDOMに紐付け
    els.albumEditPicker._selectedSet = set;
  });
  els.albumEditModal.classList.remove('hidden');
}

els.albumEditClose.addEventListener('click', () => {
  els.albumEditModal.classList.add('hidden');
  els.albumEditForm.reset();
  els.albumEditCount.textContent = '';
  els.albumEditPicker.innerHTML = '';
});

els.albumEditForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    const id = els.albumEditId.value;
    const title = els.albumEditTitle.value.trim();
    if (!title) return;
    const albums = await getAll('albums');
    const album = albums.find(a => a.id === id);
    if (!album) throw new Error('アルバムが見つかりません');

    // 選択されたカード（モーダル内ピッカーのSetを参照）
    const set = els.albumEditPicker._selectedSet || new Set(album.cardIds);
    const cardIds = Array.from(set);

    if (cardIds.length === 0) {
      alert('カードを1枚以上選択してください。');
      return;
    }
    if (cardIds.length > 20) {
      alert('アルバムは最大20枚までです。');
      return;
    }

    const updated = { ...album, title, cardIds };
    await put('albums', updated);

    els.albumEditStatus.textContent = '保存しました。';
    renderAlbums(await getAll('albums'));
  } catch (e) {
    console.error(e);
    els.albumEditStatus.textContent = '保存に失敗しました。';
  }
});

async function deleteAlbum(albumId) {
  if (!confirm('このアルバムを削除しますか？')) return;
  await del('albums', albumId);
  renderAlbums(await getAll('albums'));
}

// ===== 初期化 =====
(async function init() {
  await openDB();
  const cards = await getAll('cards');
  const albums = await getAll('albums');

  renderCards(cards);
  renderAlbumPicker(cards, els.albumCardPicker, selectedCardIds, els.albumCount);
  renderAlbums(albums);

  // 画像選択プレビュー（カード登録）
  els.cardImage.addEventListener('change', () => {
    const file = els.cardImage.files[0];
    if (!file) { els.cardPreview.innerHTML = ''; return; }
    const url = URL.createObjectURL(file);
    els.cardPreview.innerHTML = `${url}`;
    els.cardName.focus();
  });

  // カード登録
  els.cardForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      const name = els.cardName.value.trim();
      const file = els.cardImage.files[0];
      if (!name || !file) { return; }
      const dataUrl = await imageFileToDataUrl(file, { maxW: 1024, quality: 0.85 });
      const card = { id: uuid(), name, imageDataUrl: dataUrl, createdAt: now() };
      await put('cards', card);
      els.cardStatus.textContent = 'カードを登録しました。';
      els.cardForm.reset();
      els.cardPreview.innerHTML = '';
      const updated = await getAll('cards');
      renderCards(updated);
      renderAlbumPicker(updated, els.albumCardPicker, selectedCardIds, els.albumCount);
    } catch (e) {
      console.error(e);
      els.cardStatus.textContent = '登録に失敗しました。';
    }
  });

  // アルバム作成
  els.albumForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      const title = els.albumTitle.value.trim();
      if (!title) return;
      const ids = Array.from(selectedCardIds);
      if (ids.length === 0) {
        alert('カードを1枚以上選択してください。');
        return;
      }
      const album = { id: uuid(), title, cardIds: ids, createdAt: now() };
      await put('albums', album);
      els.albumStatus.textContent = 'アルバムを作成しました。';
      els.albumForm.reset();
      selectedCardIds.clear();
      renderAlbumPicker(await getAll('cards'), els.albumCardPicker, selectedCardIds, els.albumCount);
      renderAlbums(await getAll('albums'));
    } catch (e) {
      console.error(e);
      els.albumStatus.textContent = '作成に失敗しました。';
    }
  });

  // エクスポート
  els.exportBtn.addEventListener('click', async () => {
    try {
      const cards = await getAll('cards');
      const albums = await getAll('albums');
      const blob = new Blob([JSON.stringify({ cards, albums }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `card-album-backup-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      els.backupStatus.textContent = 'エクスポートしました。';
    } catch (e) {
      console.error(e);
      els.backupStatus.textContent = 'エクスポートに失敗しました。';
    }
  });

  // インポート
  els.importBtn.addEventListener('click', async () => {
    const file = els.importFile.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const cards = Array.isArray(data.cards) ? data.cards : [];
      const albums = Array.isArray(data.albums) ? data.albums : [];
      for (const c of cards) await put('cards', c);
      for (const a of albums) await put('albums', a);
      els.backupStatus.textContent = 'インポートしました。';
      renderCards(await getAll('cards'));
      renderAlbumPicker(await getAll('cards'), els.albumCardPicker, selectedCardIds, els.albumCount);
      renderAlbums(await getAll('albums'));
    } catch (e) {
      console.error(e);
      els.backupStatus.textContent = 'インポートに失敗しました。';
    }
  });
})();
