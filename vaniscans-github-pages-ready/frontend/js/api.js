const API_BASE = '/api';
const DB_NAME = 'VaniScans_DB';
const DB_VERSION = 4;
const STORE_MANGAS = 'mangas';
const STORE_CHAPTERS = 'chapters';

// Cryptographic SHA-256 Hashes (Zero plaintext credentials in source code)
const ADMIN_USER_SHA256 = '059a50ce956b7ec61527c7ecc0c55b5a009dc54ab4acddce8852b46baa2aba30';
const ADMIN_PASS_SHA256 = '9109551a88284a2754a704d50d6636fc596ae718df126354742f1637940bbc5a';

async function sha256Hash(text) {
    if (window.crypto && window.crypto.subtle) {
        const msgBuffer = new TextEncoder().encode(text);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return pureJsSha256(text);
}

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

class LocalDatabaseFallback {
    constructor() {
        this.db = null;
    }

    async init() {
        // Seed initial localStorage catalog if empty so mangas survive Vercel rebuilds
        if (!localStorage.getItem('vaniscans_persistent_mangas_v4')) {
            localStorage.setItem('vaniscans_persistent_mangas_v4', JSON.stringify([]));
        }
        if (!localStorage.getItem('vaniscans_persistent_chapters_v4')) {
            localStorage.setItem('vaniscans_persistent_chapters_v4', JSON.stringify([]));
        }

        return new Promise((resolve) => {
            try {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(STORE_MANGAS)) {
                        db.createObjectStore(STORE_MANGAS, { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains(STORE_CHAPTERS)) {
                        const chStore = db.createObjectStore(STORE_CHAPTERS, { keyPath: 'id' });
                        chStore.createIndex('mangaId', 'mangaId', { unique: false });
                    }
                };
                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    // Sync IndexedDB with localStorage backup
                    this.syncLocalStorageToIdb().then(() => resolve(this.db));
                };
                request.onerror = () => resolve(null);
                request.onblocked = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    }

    async syncLocalStorageToIdb() {
        try {
            const rawMangas = JSON.parse(localStorage.getItem('vaniscans_persistent_mangas_v4') || '[]');
            const rawChapters = JSON.parse(localStorage.getItem('vaniscans_persistent_chapters_v4') || '[]');
            if (rawMangas.length > 0 && this.db) {
                const tx = this.db.transaction([STORE_MANGAS, STORE_CHAPTERS], 'readwrite');
                const mStore = tx.objectStore(STORE_MANGAS);
                const cStore = tx.objectStore(STORE_CHAPTERS);
                rawMangas.forEach(m => mStore.put(m));
                rawChapters.forEach(c => cStore.put(c));
            }
        } catch (_) {}
    }

    async backupIdbToLocalStorage() {
        try {
            if (!this.db) return;
            const mangas = await this.getAllMangas();
            const chapters = [];
            for (const m of mangas) {
                const chs = await this.getChaptersForManga(m.id);
                chapters.push(...chs);
            }
            localStorage.setItem('vaniscans_persistent_mangas_v4', JSON.stringify(mangas));
            localStorage.setItem('vaniscans_persistent_chapters_v4', JSON.stringify(chapters));
        } catch (_) {}
    }

    async getAllMangas() {
        let idbList = [];
        if (this.db) {
            idbList = await this.tx(STORE_MANGAS, 'readonly', store => store.getAll()) || [];
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

    async saveManga(manga) {
        if (this.db) {
            await this.tx(STORE_MANGAS, 'readwrite', store => store.put(manga));
        }
        await this.backupIdbToLocalStorage();
        return manga;
    }

    async deleteManga(mangaId) {
        if (this.db) {
            const chs = await this.getChaptersForManga(mangaId);
            await new Promise((resolve) => {
                const tx = this.db.transaction([STORE_MANGAS, STORE_CHAPTERS], 'readwrite');
                tx.objectStore(STORE_MANGAS).delete(mangaId);
                const chStore = tx.objectStore(STORE_CHAPTERS);
                chs.forEach(c => chStore.delete(c.id));
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            });
        }
        await this.backupIdbToLocalStorage();
    }

    async clearAllMangasAndChapters() {
        if (this.db) {
            await new Promise((resolve) => {
                const tx = this.db.transaction([STORE_MANGAS, STORE_CHAPTERS], 'readwrite');
                tx.objectStore(STORE_MANGAS).clear();
                tx.objectStore(STORE_CHAPTERS).clear();
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            });
        }
        localStorage.removeItem('vaniscans_persistent_mangas_v4');
        localStorage.removeItem('vaniscans_persistent_chapters_v4');
    }

    async getChaptersForManga(mangaId) {
        let idbList = [];
        if (this.db) {
            idbList = await new Promise((resolve) => {
                const tx = this.db.transaction(STORE_CHAPTERS, 'readonly');
                const store = tx.objectStore(STORE_CHAPTERS);
                const index = store.index('mangaId');
                const req = index.getAll(mangaId);
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            });
        }
        try {
            const lsChapters = JSON.parse(localStorage.getItem('vaniscans_persistent_chapters_v4') || '[]');
            const filteredLs = lsChapters.filter(c => c.mangaId === mangaId);
            const combined = [...idbList, ...filteredLs];
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

    async getChapter(id) {
        if (this.db) {
            const ch = await this.tx(STORE_CHAPTERS, 'readonly', store => store.get(id));
            if (ch) return ch;
        }
        try {
            const lsChapters = JSON.parse(localStorage.getItem('vaniscans_persistent_chapters_v4') || '[]');
            return lsChapters.find(c => c.id === id) || null;
        } catch (_) {
            return null;
        }
    }

    async saveChapter(chapter) {
        if (this.db) {
            await this.tx(STORE_CHAPTERS, 'readwrite', store => store.put(chapter));
        }
        await this.backupIdbToLocalStorage();
        return chapter;
    }

    async bulkSaveChapters(chapters) {
        if (this.db) {
            await new Promise((resolve) => {
                const tx = this.db.transaction(STORE_CHAPTERS, 'readwrite');
                const store = tx.objectStore(STORE_CHAPTERS);
                chapters.forEach(ch => store.put(ch));
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            });
        }
        await this.backupIdbToLocalStorage();
    }

    tx(storeName, mode, callback) {
    constructor() {
        this.db = null;
    }

    async init() {
        return new Promise((resolve) => {
            try {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(STORE_MANGAS)) {
                        db.createObjectStore(STORE_MANGAS, { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains(STORE_CHAPTERS)) {
                        const chStore = db.createObjectStore(STORE_CHAPTERS, { keyPath: 'id' });
                        chStore.createIndex('mangaId', 'mangaId', { unique: false });
                    }
                };
                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    resolve(this.db);
                };
                request.onerror = () => resolve(null);
                request.onblocked = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    }

    async getAllMangas() {
        if (!this.db) return [];
        return (await this.tx(STORE_MANGAS, 'readonly', store => store.getAll())) || [];
    }

    async saveManga(manga) {
        if (!this.db) return manga;
        return this.tx(STORE_MANGAS, 'readwrite', store => store.put(manga));
    }

    async deleteManga(mangaId) {
        if (!this.db) return;
        const chs = await this.getChaptersForManga(mangaId);
        return new Promise((resolve) => {
            const tx = this.db.transaction([STORE_MANGAS, STORE_CHAPTERS], 'readwrite');
            tx.objectStore(STORE_MANGAS).delete(mangaId);
            const chStore = tx.objectStore(STORE_CHAPTERS);
            chs.forEach(c => chStore.delete(c.id));
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    }

    async clearAllMangasAndChapters() {
        if (!this.db) return;
        return new Promise((resolve) => {
            const tx = this.db.transaction([STORE_MANGAS, STORE_CHAPTERS], 'readwrite');
            tx.objectStore(STORE_MANGAS).clear();
            tx.objectStore(STORE_CHAPTERS).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    }

    async getChaptersForManga(mangaId) {
        if (!this.db) return [];
        return new Promise((resolve) => {
            const tx = this.db.transaction(STORE_CHAPTERS, 'readonly');
            const store = tx.objectStore(STORE_CHAPTERS);
            const index = store.index('mangaId');
            const req = index.getAll(mangaId);
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    }

    async getChapter(id) {
        if (!this.db) return null;
        return this.tx(STORE_CHAPTERS, 'readonly', store => store.get(id));
    }

    async saveChapter(chapter) {
        if (!this.db) return chapter;
        return this.tx(STORE_CHAPTERS, 'readwrite', store => store.put(chapter));
    }

    async bulkSaveChapters(chapters) {
        if (!this.db) return;
        return new Promise((resolve) => {
            const tx = this.db.transaction(STORE_CHAPTERS, 'readwrite');
            const store = tx.objectStore(STORE_CHAPTERS);
            chapters.forEach(ch => store.put(ch));
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    }

    tx(storeName, mode, callback) {
        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction(storeName, mode);
                const store = tx.objectStore(storeName);
                const request = callback(store);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    }
}

class ApiService {
    constructor() {
        this.localDb = new LocalDatabaseFallback();
        this.useBackend = false;
        this.hasNetlifyFunctions = false;
    }

    async init() {
        await this.localDb.init();
        // Check if Express backend (/api/mangas) is running
        try {
            const res = await fetch(`${API_BASE}/mangas`, { signal: AbortSignal.timeout(1200) });
            if (res.ok) {
                const ct = res.headers.get('content-type') || '';
                if (ct.includes('application/json')) {
                    this.useBackend = true;
                }
            }
        } catch (_) {
            this.useBackend = false;
        }
    }

    getDeletedIds() {
        try {
            return JSON.parse(localStorage.getItem('vaniscans_deleted_ids') || '[]');
        } catch (_) {
            return [];
        }
    }

    markIdDeleted(id) {
        const deleted = new Set(this.getDeletedIds());
        deleted.add(id);
        localStorage.setItem('vaniscans_deleted_ids', JSON.stringify([...deleted]));
    }

    unmarkIdDeleted(id) {
        const deleted = new Set(this.getDeletedIds());
        if (deleted.has(id)) {
            deleted.delete(id);
            localStorage.setItem('vaniscans_deleted_ids', JSON.stringify([...deleted]));
        }
    }

    /**
     * Deduplicates manga list by id, mangadexId, and lowercase title,
     * and filters out any series the admin explicitly deleted!
     */
    deduplicateMangas(list) {
        const deletedIds = new Set(this.getDeletedIds());
        const seenIds = new Set();
        const seenMdIds = new Set();
        const seenTitles = new Set();
        const clean = [];

        for (const m of (list || [])) {
            if (!m || !m.id || !m.title) continue;
            if (deletedIds.has(m.id)) continue;

            const normId = m.id.trim();
            const normMdId = m.mangadexId ? m.mangadexId.trim() : null;
            const normTitle = m.title.trim().toLowerCase();

            if (seenIds.has(normId)) continue;
            if (normMdId && seenMdIds.has(normMdId)) continue;
            if (seenTitles.has(normTitle)) continue;

            seenIds.add(normId);
            if (normMdId) seenMdIds.add(normMdId);
            seenTitles.add(normTitle);
            clean.push(m);
        }
        return clean;
    }

    async fetchMangaDexJson(proxyEndpoint, directMangaDexUrl) {
        // 1. Try built-in Server / Serverless Function (/api/mangadex/...) on Vercel, Netlify, Render, or Express
        if (proxyEndpoint) {
            try {
                const proxyRes = await fetch(proxyEndpoint, { signal: AbortSignal.timeout(8000) });
                if (proxyRes.ok) {
                    const ct = proxyRes.headers.get('content-type') || '';
                    if (ct.includes('application/json')) {
                        const json = await proxyRes.json();
                        if (json && (json.result === 'ok' || Array.isArray(json.data) || json.baseUrl)) {
                            this.hasNetlifyFunctions = true;
                            return json;
                        }
                    }
                }
            } catch (_) {}
        }

        // 2. Race direct API + multiple high-speed relays in parallel using Promise.any() so one slow proxy NEVER causes a timeout!
        const fetchCandidate = async (url, unwrap = false) => {
            const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            let json = await res.json();
            if (unwrap && json && typeof json.contents === 'string') {
                json = JSON.parse(json.contents);
            }
            if (json && (json.result === 'ok' || Array.isArray(json.data) || json.baseUrl)) {
                return json;
            }
            throw new Error('Invalid payload');
        };

        try {
            return await Promise.any([
                fetchCandidate(directMangaDexUrl, false),
                fetchCandidate(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(directMangaDexUrl)}`, false),
                fetchCandidate(`https://api.allorigins.win/raw?url=${encodeURIComponent(directMangaDexUrl)}`, false),
                fetchCandidate(`https://api.allorigins.win/get?url=${encodeURIComponent(directMangaDexUrl)}`, true),
                fetchCandidate(`https://corsproxy.io/?url=${encodeURIComponent(directMangaDexUrl)}`, false)
            ]);
        } catch (_) {
            throw new Error('MangaDex request timed out. Connect your GitHub repo to Vercel or Netlify so /api/mangadex runs server-side.');
        }
    }

    async authenticateAdmin(username, password) {
        const userHash = (await sha256Hash(username.trim())).toLowerCase();
        const passHash = (await sha256Hash(password)).toLowerCase();

        if (this.useBackend) {
            try {
                const res = await fetch(`${API_BASE}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userHash, passHash })
                });
                if (res.ok) {
                    const data = await res.json();
                    return !!data.success;
                }
            } catch (_) {}
        }

        return userHash === ADMIN_USER_SHA256 && passHash === ADMIN_PASS_SHA256;
    }

    async getAllMangas() {
        let list = [];
        if (this.useBackend) {
            try {
                const res = await fetch(`${API_BASE}/mangas`);
                if (res.ok) list = await res.json();
            } catch (_) {}
        }
        const localList = await this.localDb.getAllMangas();
        const combined = [...list, ...localList];
        return this.deduplicateMangas(combined);
    }

    async saveManga(manga) {
        this.unmarkIdDeleted(manga.id);
        if (this.useBackend) {
            try {
                await fetch(`${API_BASE}/mangas`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(manga)
                });
            } catch (_) {}
        }
        return await this.localDb.saveManga(manga);
    }

    async deleteManga(mangaId) {
        this.markIdDeleted(mangaId);
        if (this.useBackend) {
            try {
                await fetch(`${API_BASE}/mangas/${encodeURIComponent(mangaId)}`, {
                    method: 'DELETE'
                });
            } catch (_) {}
        }
        return await this.localDb.deleteManga(mangaId);
    }

    async clearAllCatalog() {
        const current = await this.localDb.getAllMangas();
        for (const m of current) {
            this.markIdDeleted(m.id);
            if (this.useBackend) {
                try {
                    await fetch(`${API_BASE}/mangas/${encodeURIComponent(m.id)}`, { method: 'DELETE' });
                } catch (_) {}
            }
        }
        await this.localDb.clearAllMangasAndChapters();
    }

    async getChaptersForManga(mangaId) {
        if (this.useBackend) {
            try {
                const res = await fetch(`${API_BASE}/mangas/${encodeURIComponent(mangaId)}/chapters`);
                if (res.ok) {
                    const chs = await res.json();
                    if (chs && chs.length > 0) return chs;
                }
            } catch (_) {}
        }
        return await this.localDb.getChaptersForManga(mangaId);
    }

    async getChapter(chapterId) {
        if (this.useBackend) {
            try {
                const res = await fetch(`${API_BASE}/chapters/${encodeURIComponent(chapterId)}`);
                if (res.ok) return await res.json();
            } catch (_) {}
        }
        return await this.localDb.getChapter(chapterId);
    }

    async saveChapter(chapter) {
        if (this.useBackend) {
            try {
                await fetch(`${API_BASE}/chapters`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(chapter)
                });
            } catch (_) {}
        }
        return await this.localDb.saveChapter(chapter);
    }

    async bulkSaveChapters(chapters) {
        if (this.useBackend) {
            try {
                await fetch(`${API_BASE}/chapters/bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chapters })
                });
            } catch (_) {}
        }
        return await this.localDb.bulkSaveChapters(chapters);
    }

    // =========================================================================
    // HOUDOKU-INSPIRED MANGADEX CRAWLER (Search, Chapter Feed & Page Resolver)
    // =========================================================================

    async searchMangaDexCatalog(rawQuery = '') {
        const query = rawQuery.trim();
        const params = new URLSearchParams();
        params.append('limit', '24');
        params.append('includes[]', 'cover_art');
        params.append('includes[]', 'author');
        params.append('includes[]', 'artist');
        params.append('contentRating[]', 'safe');
        params.append('contentRating[]', 'suggestive');
        params.append('contentRating[]', 'erotica');
        params.append('hasAvailableChapters', 'true');

        const uuidMatch = query.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (uuidMatch) {
            params.delete('limit');
            params.append('ids[]', uuidMatch[0]);
        } else if (query) {
            params.append('title', query);
            params.append('order[relevance]', 'desc');
        } else {
            params.append('order[followedCount]', 'desc');
        }

        const directUrl = `https://api.mangadex.org/manga?${params.toString()}`;
        const proxyUrl = `${API_BASE}/mangadex/search?q=${encodeURIComponent(query)}&limit=24`;

        const json = await this.fetchMangaDexJson(proxyUrl, directUrl);
        const list = Array.isArray(json?.data) ? json.data : [];

        const results = [];
        for (const manga of list) {
            const attr = manga.attributes || {};
            const rels = manga.relationships || [];

            const titleObj = attr.title || {};
            const altTitles = attr.altTitles || [];
            let title = titleObj.en || titleObj['ja-ro'] || titleObj['ko-ro'] || Object.values(titleObj)[0];
            if (!title) {
                const enAlt = altTitles.find(t => t.en)?.en;
                if (enAlt) title = enAlt;
            }
            title = title || 'Untitled MangaDex Series';

            const authors = rels
                .filter(r => (r.type === 'author' || r.type === 'artist') && r.attributes?.name)
                .map(r => r.attributes.name);
            const uniqueAuthors = [...new Set(authors)].join(', ') || 'MangaDex Creator';

            const coverRel = rels.find(r => r.type === 'cover_art');
            let coverFileName = coverRel?.attributes?.fileName || null;

            if (!coverFileName && coverRel?.id) {
                try {
                    const coverJson = await this.fetchMangaDexJson(
                        null,
                        `https://api.mangadex.org/cover/${coverRel.id}`
                    );
                    coverFileName = coverJson?.data?.attributes?.fileName || null;
                } catch (_) {}
            }

            const directCoverUrl = coverFileName
                ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}.512.jpg`
                : 'https://placehold.co/400x600/1a1d30/a855f7?text=MangaDex';

            const tags = (attr.tags || [])
                .map(t => t.attributes?.name?.en)
                .filter(Boolean)
                .slice(0, 4);

            const descObj = attr.description || {};
            const synopsis = descObj.en || Object.values(descObj)[0] || 'Imported directly from MangaDex.org.';

            results.push({
                mangadexId: manga.id,
                sourceHost: 'mangadex.org',
                title,
                author: uniqueAuthors,
                cover: directCoverUrl,
                genres: tags.length > 0 ? tags : ['Action', 'Manga'],
                status: attr.status === 'completed' ? 'Completed' : 'Ongoing',
                rating: '9.6',
                lastChapter: attr.lastChapter || null,
                synopsis
            });
        }

        return results;
    }

    async fetchHostedChapterList(mangadexId, maxNeeded, lang) {
        const collected = [];
        const seenChapterNumbers = new Set();
        let offset = 0;
        const pageSize = 100;

        while (collected.length < maxNeeded) {
            const params = new URLSearchParams();
            params.append('limit', String(pageSize));
            params.append('offset', String(offset));
            if (lang && lang !== 'all') {
                params.append('translatedLanguage[]', lang);
            }
            params.append('includes[]', 'scanlation_group');
            params.append('order[chapter]', 'asc');
            params.append('order[volume]', 'asc');
            params.append('contentRating[]', 'safe');
            params.append('contentRating[]', 'suggestive');
            params.append('contentRating[]', 'erotica');
            params.append('includeEmptyPages', '0');
            params.append('includeExternalUrl', '0');
            params.append('includeFutureUpdates', '0');

            const directFeedUrl = `https://api.mangadex.org/manga/${encodeURIComponent(mangadexId)}/feed?${params.toString()}`;
            const proxyFeedUrl = `${API_BASE}/mangadex/feed?mangaId=${encodeURIComponent(mangadexId)}&limit=${pageSize}&offset=${offset}&lang=${encodeURIComponent(lang)}`;

            const feedJson = await this.fetchMangaDexJson(proxyFeedUrl, directFeedUrl);
            const batch = Array.isArray(feedJson?.data) ? feedJson.data : [];

            if (batch.length === 0) break;

            for (const chObj of batch) {
                const attr = chObj.attributes || {};
                if (attr.externalUrl) continue;
                if (typeof attr.pages === 'number' && attr.pages <= 0) continue;

                const chNumKey = attr.chapter ? String(attr.chapter).trim() : `oneshot-${chObj.id}`;
                if (seenChapterNumbers.has(chNumKey)) continue;
                seenChapterNumbers.add(chNumKey);

                collected.push(chObj);
                if (collected.length >= maxNeeded) break;
            }

            offset += batch.length;
            if (batch.length < pageSize || offset >= (feedJson.total || 0) || offset >= 500) break;
        }

        return collected;
    }

    async crawlMangaDexChaptersWithImages(mangadexId, targetMangaId, desiredCount, lang = 'en', onProgress = null) {
        const maxChapters = Math.max(1, parseInt(desiredCount, 10) || 1);
        let candidates = await this.fetchHostedChapterList(mangadexId, maxChapters + 3, lang);

        let usedFallbackLang = false;
        if (candidates.length === 0 && lang !== 'all') {
            candidates = await this.fetchHostedChapterList(mangadexId, maxChapters + 3, 'all');
            usedFallbackLang = true;
        }

        if (candidates.length === 0) {
            throw new Error('This series only has external links (e.g. MangaPlus) and 0 hosted image chapters on MangaDex.');
        }

        const finalChapters = [];
        for (let i = 0; i < candidates.length && finalChapters.length < maxChapters; i++) {
            const chObj = candidates[i];
            const attr = chObj.attributes || {};
            const chNum = attr.chapter ? parseFloat(attr.chapter) : (finalChapters.length + 1);
            const langBadge = usedFallbackLang && attr.translatedLanguage ? ` [${attr.translatedLanguage.toUpperCase()}]` : '';
            const chLabel = attr.chapter ? `Chapter ${attr.chapter}${langBadge}` : `Chapter ${finalChapters.length + 1}${langBadge}`;
            const chTitle = attr.title ? `${chLabel} - ${attr.title}` : chLabel;

            if (typeof onProgress === 'function') {
                onProgress(finalChapters.length + 1, Math.min(maxChapters, candidates.length), chTitle);
            }

            try {
                const pageData = await this.resolveMangaDexChapterPagesDetailed(chObj.id);
                if (pageData && pageData.pages.length > 0) {
                    finalChapters.push({
                        id: `${targetMangaId}-md-${chObj.id}`,
                        mangadexChapterId: chObj.id,
                        mangaId: targetMangaId,
                        title: chTitle,
                        number: isNaN(chNum) ? (finalChapters.length + 1) : chNum,
                        pages: pageData.pages,
                        pagesSaver: pageData.pagesSaver,
                        atHomeUpdatedAt: Date.now(),
                        createdAt: attr.publishAt ? new Date(attr.publishAt).getTime() : (Date.now() - (maxChapters - finalChapters.length) * 60000)
                    });
                }
            } catch (chErr) {
                console.warn(`Skipping chapter ${chObj.id} due to At-Home node error:`, chErr);
            }

            if (finalChapters.length < maxChapters && i < candidates.length - 1) {
                await new Promise(r => setTimeout(r, 250));
            }
        }

        if (finalChapters.length === 0) {
            throw new Error('Could not retrieve hosted page images from MangaDex At-Home nodes. Try again in a few seconds.');
        }

        return finalChapters;
    }

    /**
     * Queries https://api.mangadex.org/at-home/server/<chapterId>
     * Also builds canonical uploads.mangadex.org URLs (`data-saver` & `data`) which do NOT expire after 15 minutes!
     */
    async resolveMangaDexChapterPagesDetailed(mangadexChapterId) {
        const directUrl = `https://api.mangadex.org/at-home/server/${encodeURIComponent(mangadexChapterId)}`;
        const proxyUrl = `${API_BASE}/mangadex/pages?chapterId=${encodeURIComponent(mangadexChapterId)}`;

        const atHome = await this.fetchMangaDexJson(proxyUrl, directUrl);
        if (!atHome || atHome.result === 'error' || !atHome.baseUrl || !atHome.chapter) {
            return { pages: [], pagesSaver: [], canonicalSaver: [], canonicalData: [] };
        }

        const baseUrl = atHome.baseUrl;
        const hash = atHome.chapter.hash;
        const dataFiles = atHome.chapter.data || [];
        const saverFiles = atHome.chapter.dataSaver || [];

        // Use data-saver first if available because data-saver JPGs are 5x smaller and rarely time out on volunteer nodes!
        const primaryFolder = saverFiles.length > 0 ? 'data-saver' : 'data';
        const primaryFiles = saverFiles.length > 0 ? saverFiles : dataFiles;

        // Canonical uploads.mangadex.org origin URLs (never expire like volunteer node URLs)
        const pages = primaryFiles.map(
            fileName => `https://uploads.mangadex.org/${primaryFolder}/${hash}/${fileName}`
        );
        const pagesSaver = primaryFiles.map(
            fileName => `${baseUrl}/${primaryFolder}/${hash}/${fileName}`
        );

        return { pages, pagesSaver, hash, dataFiles, saverFiles };
    }

    async resolveMangaDexChapterPages(mangadexChapterId, preferDataSaver = true) {
        const detailed = await this.resolveMangaDexChapterPagesDetailed(mangadexChapterId);
        return preferDataSaver ? detailed.pages : detailed.pagesSaver;
    }
}

window.apiService = new ApiService();
