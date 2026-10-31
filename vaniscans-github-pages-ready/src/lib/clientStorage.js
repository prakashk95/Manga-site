const DB_NAME = 'VaniScans_Next_DB';
const DB_VERSION = 1;
const STORE_MANGAS = 'mangas';
const STORE_CHAPTERS = 'chapters';

// Cryptographic SHA-256 Hashes for Admin Gateway

function pureJsSha256(ascii) {
    function rightRotate(value, amount) {
        return (value >>> amount) | (value << (32 - amount));
    }
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    const lengthProperty = 'length';
    let i, j;
    let result = '';
    const words = [];
    const asciiBitLength = ascii[lengthProperty] * 8;
    let hash = (pureJsSha256.h = pureJsSha256.h || []);
    const k = (pureJsSha256.k = pureJsSha256.k || []);
    let primeCounter = k[lengthProperty];
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
        if (!isComposite[candidate]) {
            for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
            hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
            k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
        }
    }
    ascii += '\x80';
    while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00';
    for (i = 0; i < ascii[lengthProperty]; i++) {
        j = ascii.charCodeAt(i);
        if (j >> 8) return '';
        words[i >> 2] |= j << (((3 - i) % 4) * 8);
    }
    words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
    words[words[lengthProperty]] = asciiBitLength;
    for (j = 0; j < words[lengthProperty]; ) {
        const w = words.slice(j, (j += 16));
        const oldHash = hash;
        hash = hash.slice(0, 8);
        for (i = 0; i < 64; i++) {
            const w15 = w[i - 15], w2 = w[i - 2];
            const a = hash[0], e = hash[4];
            const temp1 =
                hash[7] +
                (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
                ((e & hash[5]) ^ (~e & hash[6])) +
                k[i] +
                (w[i] =
                    i < 16
                        ? w[i]
                        : (w[i - 16] +
                              (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                              w[i - 7] +
                              (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
                          0);
            const temp2 =
                (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
                ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
            hash = [(temp1 + temp2) | 0].concat(hash);
            hash[4] = (hash[4] + temp1) | 0;
        }
        for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) {
        for (j = 3; j + 1; j--) {
            const b = (hash[i] >> (j * 8)) & 255;
            result += (b < 16 ? 0 : '') + b.toString(16);
        }
    }
    return result;
}

export async function sha256Hash(text) {
    try {
        if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
            const msgBuffer = new TextEncoder().encode(text);
            const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }
    } catch (_) {}
    return pureJsSha256(text);
}

export async function verifyAdminCredentials(username, password) {
    const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: (username || '').trim(), password: password || '' })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data && data.success) return true;
    if (res.status === 500 && data && data.message) throw new Error(data.message);
    return false;
}

function openIdb() {
    if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
    return new Promise((resolve) => {
        try {
            const req = window.indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_MANGAS)) {
                    db.createObjectStore(STORE_MANGAS, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORE_CHAPTERS)) {
                    const chStore = db.createObjectStore(STORE_CHAPTERS, { keyPath: 'id' });
                    chStore.createIndex('mangaId', 'mangaId', { unique: false });
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = () => resolve(null);
            req.onblocked = () => resolve(null);
        } catch (_) {
            resolve(null);
        }
    });
}

export async function getLocalMangas() {
    if (typeof window === 'undefined') return [];
    const db = await openIdb();
    let idbList = [];
    if (db) {
        idbList = await new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE_MANGAS, 'readonly');
                const req = tx.objectStore(STORE_MANGAS).getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            } catch (_) {
                resolve([]);
            }
        });
    }
    try {
        const lsList = JSON.parse(localStorage.getItem('vaniscans_persistent_mangas_v4') || '[]');
        const combined = [...idbList, ...lsList];
        const seen = new Set();
        return combined.filter(m => {
            if (!m || !m.id) return false;
            if (seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
        });
    } catch (_) {
        return idbList;
    }
}

export async function saveLocalManga(manga) {
    if (typeof window === 'undefined' || !manga || !manga.id) return;
    const db = await openIdb();
    if (db) {
        await new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE_MANGAS, 'readwrite');
                tx.objectStore(STORE_MANGAS).put(manga);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch (_) {
                resolve();
            }
        });
    }
    try {
        const current = await getLocalMangas();
        const idx = current.findIndex(m => m.id === manga.id);
        if (idx > -1) current[idx] = { ...current[idx], ...manga };
        else current.unshift(manga);
        localStorage.setItem('vaniscans_persistent_mangas_v4', JSON.stringify(current));
    } catch (_) {}
}

export async function deleteLocalManga(mangaId) {
    if (typeof window === 'undefined' || !mangaId) return;
    const db = await openIdb();
    if (db) {
        const chs = await getLocalChaptersForManga(mangaId);
        await new Promise((resolve) => {
            try {
                const tx = db.transaction([STORE_MANGAS, STORE_CHAPTERS], 'readwrite');
                tx.objectStore(STORE_MANGAS).delete(mangaId);
                const chStore = tx.objectStore(STORE_CHAPTERS);
                chs.forEach(c => chStore.delete(c.id));
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch (_) {
                resolve();
            }
        });
    }
    try {
        const current = JSON.parse(localStorage.getItem('vaniscans_persistent_mangas_v4') || '[]');
        localStorage.setItem('vaniscans_persistent_mangas_v4', JSON.stringify(current.filter(m => m.id !== mangaId)));
    } catch (_) {}
}

export async function getLocalChaptersForManga(mangaId) {
    if (typeof window === 'undefined' || !mangaId) return [];
    const db = await openIdb();
    let idbList = [];
    if (db) {
        idbList = await new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE_CHAPTERS, 'readonly');
                const idx = tx.objectStore(STORE_CHAPTERS).index('mangaId');
                const req = idx.getAll(mangaId);
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            } catch (_) {
                resolve([]);
            }
        });
    }
    try {
        const lsChs = JSON.parse(localStorage.getItem('vaniscans_persistent_chapters_v4') || '[]');
        const filtered = lsChs.filter(c => c.mangaId === mangaId);
        const combined = [...idbList, ...filtered];
        const seen = new Set();
        return combined.filter(c => {
            if (!c || !c.id) return false;
            if (seen.has(c.id)) return false;
            seen.add(c.id);
            return true;
        });
    } catch (_) {
        return idbList;
    }
}

export async function saveLocalChaptersBulk(chapters = []) {
    if (typeof window === 'undefined' || !Array.isArray(chapters) || chapters.length === 0) return;
    const db = await openIdb();
    if (db) {
        await new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE_CHAPTERS, 'readwrite');
                const store = tx.objectStore(STORE_CHAPTERS);
                chapters.forEach(ch => {
                    if (ch && ch.id) store.put(ch);
                });
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch (_) {
                resolve();
            }
        });
    }
}

export async function deleteLocalChapter(chapterId) {
    if (typeof window === 'undefined' || !chapterId) return;
    const db = await openIdb();
    if (db) {
        await new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE_CHAPTERS, 'readwrite');
                tx.objectStore(STORE_CHAPTERS).delete(chapterId);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch (_) {
                resolve();
            }
        });
    }
}

export async function fetchAndSyncMangas() {
    let remoteMangas = [];
    let apiOk = false;

    try {
        const res = await fetch('/api/mangas', { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                remoteMangas = data;
                apiOk = true;
            }
        }
    } catch (_) {}

    const localMangas = await getLocalMangas();

    // Re-push any browser-saved mangas to the server SQLite DB if missing on the server
    if (apiOk && localMangas.length > 0) {
        const remoteIds = new Set(remoteMangas.map(m => m.id));
        for (const lm of localMangas) {
            if (lm && lm.id && !remoteIds.has(lm.id)) {
                try {
                    await fetch('/api/mangas', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(lm)
                    });
                    const localChs = await getLocalChaptersForManga(lm.id);
                    if (localChs && localChs.length > 0) {
                        await fetch('/api/chapters/bulk', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ chapters: localChs })
                        });
                    }
                    remoteMangas.push(lm);
                } catch (_) {}
            }
        }
    }

    for (const rm of remoteMangas) {
        if (rm && rm.id) {
            await saveLocalManga(rm);
        }
    }

    const combined = [...remoteMangas, ...localMangas];
    const seen = new Set();
    const deduped = [];
    for (const m of combined) {
        if (!m || !m.id || !m.title) continue;
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        deduped.push(m);
    }
    deduped.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
    return deduped;
}

export async function fetchAndSyncChapters(mangaId) {
    let remoteChs = [];
    try {
        const res = await fetch(`/api/mangas/${encodeURIComponent(mangaId)}/chapters`, { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) remoteChs = data;
        }
    } catch (_) {}

    const localChs = await getLocalChaptersForManga(mangaId);

    if (remoteChs.length === 0 && localChs.length > 0) {
        try {
            await fetch('/api/chapters/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chapters: localChs })
            });
        } catch (_) {}
        return localChs;
    }

    if (remoteChs.length > 0) {
        await saveLocalChaptersBulk(remoteChs);
        return remoteChs;
    }

    return localChs;
}

// ============================================================================
// COMMENTS & DISCUSSIONS SYNC (SQLite Server + Local Browser Backup)
// ============================================================================

function getLocalCommentsMap() {
    if (typeof window === 'undefined') return {};
    try {
        return JSON.parse(localStorage.getItem('vaniscans_chapter_comments_v2') || '{}');
    } catch (_) {
        return {};
    }
}

function saveLocalCommentsMap(map) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem('vaniscans_chapter_comments_v2', JSON.stringify(map));
    } catch (_) {}
}

export async function fetchAndSyncComments(chapterId) {
    if (!chapterId) return [];
    const localMap = getLocalCommentsMap();
    const localList = Array.isArray(localMap[chapterId]) ? localMap[chapterId] : [];

    let remoteList = [];
    let apiOk = false;
    try {
        const res = await fetch(`/api/comments?chapterId=${encodeURIComponent(chapterId)}`, { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                remoteList = data;
                apiOk = true;
            }
        }
    } catch (_) {}

    // If local browser has comments not yet on the server, push them to SQLite so all other devices see them
    if (apiOk && localList.length > 0) {
        const remoteIds = new Set(remoteList.map(c => c.id));
        for (const lc of localList) {
            if (lc && lc.id && lc.text && !remoteIds.has(lc.id)) {
                try {
                    await fetch('/api/comments', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(lc)
                    });
                    remoteList.push(lc);
                } catch (_) {}
            }
        }
    }

    const combined = [...remoteList, ...localList];
    const seen = new Set();
    const deduped = [];
    for (const c of combined) {
        if (!c || !c.id || !c.text) continue;
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        deduped.push(c);
    }
    deduped.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));

    localMap[chapterId] = deduped;
    saveLocalCommentsMap(localMap);
    return deduped;
}

export async function postAndSyncComment(chapterId, author, text, avatarColor) {
    const newComment = {
        id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        chapterId,
        author: (author || 'Reader').trim() || 'Anonymous Reader',
        avatarColor: avatarColor || '#8b5cf6',
        text: (text || '').trim(),
        likes: 0,
        createdAt: Date.now()
    };

    const localMap = getLocalCommentsMap();
    if (!Array.isArray(localMap[chapterId])) localMap[chapterId] = [];
    localMap[chapterId].unshift(newComment);
    saveLocalCommentsMap(localMap);

    try {
        const res = await fetch('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newComment)
        });
        if (res.ok) {
            const saved = await res.json();
            if (saved && saved.id) return saved;
        }
    } catch (_) {}

    return newComment;
}

export async function deleteAndSyncComment(chapterId, commentId) {
    const localMap = getLocalCommentsMap();
    if (Array.isArray(localMap[chapterId])) {
        localMap[chapterId] = localMap[chapterId].filter(c => c.id !== commentId);
        saveLocalCommentsMap(localMap);
    }
    try {
        await fetch(`/api/comments?chapterId=${encodeURIComponent(chapterId)}&commentId=${encodeURIComponent(commentId)}`, {
            method: 'DELETE'
        });
    } catch (_) {}
}
