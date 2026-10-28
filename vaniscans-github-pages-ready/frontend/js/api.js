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

function stripHtmlTagsClient(str) {
    return (str || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();
}

class LocalDatabaseFallback {
    constructor() {
        this.db = null;
    }

    async init() {
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
            const mangas = await this.tx(STORE_MANGAS, 'readonly', store => store.getAll()) || [];
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
            idbList = (await this.tx(STORE_MANGAS, 'readonly', store => store.getAll())) || [];
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

    deduplicateMangas(list) {
        const deletedIds = new Set(this.getDeletedIds());
        const seenIds = new Set();
        const seenMdIds = new Set();
        const seenMkIds = new Set();
        const seenTitles = new Set();
        const clean = [];

        for (const m of (list || [])) {
            if (!m || !m.id || !m.title) continue;
            if (deletedIds.has(m.id)) continue;

            const normId = m.id.trim();
            const normMdId = m.mangadexId ? m.mangadexId.trim() : null;
            const normMkId = m.mangakatanaId ? m.mangakatanaId.trim() : null;
            const normTitle = m.title.trim().toLowerCase();

            if (seenIds.has(normId)) continue;
            if (normMdId && seenMdIds.has(normMdId)) continue;
            if (normMkId && seenMkIds.has(normMkId)) continue;
            if (seenTitles.has(normTitle)) continue;

            seenIds.add(normId);
            if (normMdId) seenMdIds.add(normMdId);
            if (normMkId) seenMkIds.add(normMkId);
            seenTitles.add(normTitle);
            clean.push(m);
        }
        return clean;
    }

    async fetchMangaDexJson(proxyEndpoint, directMangaDexUrl) {
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
        const cleanUser = (username || '').trim();
        const userHash = (await sha256Hash(cleanUser)).toLowerCase();
        const userLowerHash = (await sha256Hash(cleanUser.toLowerCase())).toLowerCase();
        const passHash = (await sha256Hash(password || '')).toLowerCase();

        // 1. Instant local SHA-256 verification (works offline, on static hosts, and across all serverless deployments)
        if ((userHash === ADMIN_USER_SHA256 || userLowerHash === ADMIN_USER_SHA256) && passHash === ADMIN_PASS_SHA256) {
            return true;
        }

        // 2. Also verify against backend / serverless endpoint if available
        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userHash, passHash })
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.success) return true;
            }
        } catch (_) {}

        return false;
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
    // 1. MANGADEX.ORG LIVE CRAWLER (Search, Chapter Feed & Page Resolver)
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
            // Allow paginating up to 5000 feed items so multi-group duplicates never cap your requested chapter count at 95!
            if (batch.length < pageSize || offset >= (feedJson.total || 0) || offset >= 5000) break;
        }

        return collected;
    }

    async crawlMangaDexChaptersWithImages(mangadexId, targetMangaId, desiredCount, lang = 'en', onProgress = null) {
        const maxChapters = Math.max(1, parseInt(desiredCount, 10) || 1);
        // Fetch extra buffer (+25) so if any chapter node fails, we still deliver all 100 requested chapters
        let candidates = await this.fetchHostedChapterList(mangadexId, maxChapters + 25, lang);

        let usedFallbackLang = false;
        if (candidates.length === 0 && lang !== 'all') {
            candidates = await this.fetchHostedChapterList(mangadexId, maxChapters + 25, 'all');
            usedFallbackLang = true;
        }

        if (candidates.length === 0) {
            throw new Error('This series only has external links (e.g. MangaPlus) and 0 hosted image chapters on MangaDex.');
        }

        const totalGoal = Math.min(maxChapters, candidates.length);
        const finalChapters = [];
        for (let i = 0; i < candidates.length && finalChapters.length < maxChapters; i++) {
            const chObj = candidates[i];
            const attr = chObj.attributes || {};
            const chNum = attr.chapter ? parseFloat(attr.chapter) : (finalChapters.length + 1);
            const langBadge = usedFallbackLang && attr.translatedLanguage ? ` [${attr.translatedLanguage.toUpperCase()}]` : '';
            const chLabel = attr.chapter ? `Chapter ${attr.chapter}${langBadge}` : `Chapter ${finalChapters.length + 1}${langBadge}`;
            const chTitle = attr.title ? `${chLabel} - ${attr.title}` : chLabel;

            if (typeof onProgress === 'function') {
                onProgress(finalChapters.length + 1, totalGoal, chTitle);
            }

            let pageData = null;
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    pageData = await this.resolveMangaDexChapterPagesDetailed(chObj.id);
                    if (pageData && pageData.pages.length > 0) break;
                } catch (chErr) {
                    if (attempt === 1) console.warn(`Skipping chapter ${chObj.id}:`, chErr);
                    await new Promise(r => setTimeout(r, 300));
                }
            }

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

            if (finalChapters.length < maxChapters && i < candidates.length - 1) {
                await new Promise(r => setTimeout(r, 180));
            }
        }

        if (finalChapters.length === 0) {
            throw new Error('Could not retrieve hosted page images from MangaDex At-Home nodes. Try again in a few seconds.');
        }

        return finalChapters;
    }

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

        const primaryFolder = saverFiles.length > 0 ? 'data-saver' : 'data';
        const primaryFiles = saverFiles.length > 0 ? saverFiles : dataFiles;

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

    // =========================================================================
    // 2. MANGAKATANA.COM LIVE CRAWLER (Search, Chapter List & Page Resolver)
    // =========================================================================

    async fetchMangaKatanaHtmlWithFallback(targetUrl) {
        const fetchHtmlCandidate = async (url, unwrapJson = false) => {
            const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            if (unwrapJson) {
                const j = await res.json();
                if (j && typeof j.contents === 'string' && j.contents.length > 200) return j.contents;
                throw new Error('Empty contents');
            }
            const text = await res.text();
            if (text && text.length > 200) return text;
            throw new Error('Empty html');
        };

        return await Promise.any([
            fetchHtmlCandidate(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`, false),
            fetchHtmlCandidate(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, false),
            fetchHtmlCandidate(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`, true),
            fetchHtmlCandidate(`https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`, false)
        ]);
    }

    parseClientMangaKatanaSearch(html, fallbackUrl = '', fallbackQuery = '') {
        const results = [];
        if (html.includes('id="single_book"') || html.includes("id='single_book'")) {
            const titleMatch = html.match(/<h1[^>]*class="[^"]*heading[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
            const coverMatch = html.match(/<div[^>]*class="[^"]*div_cover[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i) ||
                               html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
            const ogUrlMatch = html.match(/<meta[^>]+property="og:url"[^>]+content="([^"]+)"/i);
            const authorMatch = html.match(/<div[^>]*class="[^"]*author[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
            const statusMatch = html.match(/<div[^>]*class="[^"]*status[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
            const summaryMatch = html.match(/<div[^>]*class="[^"]*summary[^"]*"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/i);
            const genresBlock = html.match(/<div[^>]*class="[^"]*genres[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

            const genres = [];
            if (genresBlock) {
                const gRegex = /<a[^>]*>([^<]+)<\/a>/gi;
                let gm;
                while ((gm = gRegex.exec(genresBlock[1])) !== null) {
                    genres.push(stripHtmlTagsClient(gm[1]));
                }
            }

            const mangaUrl = ogUrlMatch ? ogUrlMatch[1].trim() : fallbackUrl;
            const slug = mangaUrl.split('/manga/')[1]?.replace(/\/+$/, '') || ('mk-' + Date.now());

            results.push({
                mangakatanaId: slug,
                mangakatanaUrl: mangaUrl || `https://mangakatana.com/manga/${slug}`,
                sourceHost: 'mangakatana.com',
                title: titleMatch ? stripHtmlTagsClient(titleMatch[1]) : (fallbackQuery || 'MangaKatana Series'),
                author: authorMatch ? stripHtmlTagsClient(authorMatch[1]) : 'MangaKatana Creator',
                cover: coverMatch ? coverMatch[1].trim() : 'https://placehold.co/400x600/1a1d30/a855f7?text=MangaKatana',
                genres: genres.length > 0 ? genres.slice(0, 4) : ['Action', 'Manga'],
                status: statusMatch && /completed/i.test(statusMatch[1]) ? 'Completed' : 'Ongoing',
                rating: '9.6',
                synopsis: summaryMatch ? stripHtmlTagsClient(summaryMatch[1]) : 'Imported directly from MangaKatana.com.'
            });
            return results;
        }

        const itemSplit = html.split(/<div[^>]+class="[^"]*\bitem\b[^"]*"[^>]+data-id="/i);
        for (let i = 1; i < itemSplit.length; i++) {
            const block = itemSplit[i];
            const titleLink = block.match(/<h3[^>]*class="[^"]*title[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
            if (!titleLink) continue;

            const mangaUrl = titleLink[1].trim();
            const title = stripHtmlTagsClient(titleLink[2]);
            const slug = mangaUrl.split('/manga/')[1]?.replace(/\/+$/, '') || '';
            if (!slug) continue;

            const imgMatch = block.match(/<div[^>]*class="[^"]*wrap_img[^"]*"[\s\S]*?<img[^>]+src="([^"]+)"/i) ||
                             block.match(/<img[^>]+src="([^"]+)"/i);
            const statusMatch = block.match(/<span[^>]*class="[^"]*status[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
            const summaryMatch = block.match(/<div[^>]*class="[^"]*summary[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
            const genresBlock = block.match(/<div[^>]*class="[^"]*genres[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

            const genres = [];
            if (genresBlock) {
                const gRegex = /<a[^>]*>([^<]+)<\/a>/gi;
                let gm;
                while ((gm = gRegex.exec(genresBlock[1])) !== null) {
                    genres.push(stripHtmlTagsClient(gm[1]));
                }
            }

            results.push({
                mangakatanaId: slug,
                mangakatanaUrl: mangaUrl.startsWith('http') ? mangaUrl : `https://mangakatana.com${mangaUrl}`,
                sourceHost: 'mangakatana.com',
                title: title || slug,
                author: 'MangaKatana Creator',
                cover: imgMatch ? imgMatch[1].trim() : 'https://placehold.co/400x600/1a1d30/a855f7?text=MangaKatana',
                genres: genres.length > 0 ? genres.slice(0, 4) : ['Action', 'Manga'],
                status: statusMatch && /completed/i.test(statusMatch[1]) ? 'Completed' : 'Ongoing',
                rating: '9.6',
                synopsis: summaryMatch ? stripHtmlTagsClient(summaryMatch[1]) : 'Imported directly from MangaKatana.com.'
            });
        }
        return results;
    }

    parseClientMangaKatanaChapters(html) {
        const rawChapters = [];
        const seenUrls = new Set();
        const rowRegex = /<div[^>]*class="[^"]*\bchapter\b[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        while ((match = rowRegex.exec(html)) !== null) {
            const chUrl = match[1].trim();
            if (!chUrl || seenUrls.has(chUrl)) continue;
            seenUrls.add(chUrl);

            const rawTitle = stripHtmlTagsClient(match[2]);
            const chSlug = chUrl.split('/').filter(Boolean).pop() || '';
            const numFromSlug = chSlug.match(/^c(\d+(\.\d+)?)$/i) || chSlug.match(/c(\d+(\.\d+)?)/i);
            const numFromTitle = rawTitle.match(/chapter\s*(\d+(\.\d+)?)/i) || rawTitle.match(/^(\d+(\.\d+)?)/);
            const parsedNum = numFromSlug ? parseFloat(numFromSlug[1]) : (numFromTitle ? parseFloat(numFromTitle[1]) : null);

            rawChapters.push({
                id: chSlug || `ch-${rawChapters.length + 1}`,
                url: chUrl.startsWith('http') ? chUrl : `https://mangakatana.com${chUrl}`,
                title: rawTitle,
                parsedNum
            });
        }
        rawChapters.reverse();
        const finalChapters = [];
        const seenNumbers = new Set();
        for (let idx = 0; idx < rawChapters.length; idx++) {
            const ch = rawChapters[idx];
            const num = (typeof ch.parsedNum === 'number' && !isNaN(ch.parsedNum)) ? ch.parsedNum : (finalChapters.length + 1);
            if (seenNumbers.has(num)) continue;
            seenNumbers.add(num);
            finalChapters.push({
                id: ch.id,
                url: ch.url,
                title: ch.title || `Chapter ${num}`,
                number: num,
                seqIndex: finalChapters.length + 1
            });
        }
        return finalChapters;
    }

    parseClientMangaKatanaPages(html) {
        const scriptArrayRegex = /(?:var|let|const)\s+([a-zA-Z0-9_]+)\s*=\s*\[\s*(['"]https?:\/\/[\s\S]*?)\s*\];/g;
        let bestPages = [];
        let match;
        while ((match = scriptArrayRegex.exec(html)) !== null) {
            const varName = match[1];
            const rawList = match[2];
            const urls = rawList
                .split(',')
                .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
                .filter(u => /^https?:\/\/.+/i.test(u) && !u.includes('logo') && !u.includes('avatar') && !u.includes('banner'));
            if (urls.length > bestPages.length || varName === 'thzq' || varName === 'ytaw') {
                if (urls.length > 0) {
                    bestPages = urls;
                    if (varName === 'thzq' && urls.length >= 1) break;
                }
            }
        }
        if (bestPages.length > 0) return bestPages;

        const dataSrcRegex = /<div[^>]*id="imgs"[\s\S]*$/i;
        const imgsSection = html.match(dataSrcRegex)?.[0] || html;
        const imgTagRegex = /data-src=["'](https?:\/\/[^"']+)["']/gi;
        const fallbackUrls = [];
        while ((match = imgTagRegex.exec(imgsSection)) !== null) {
            const u = match[1].trim();
            if (!u.includes('logo') && !u.includes('avatar')) {
                fallbackUrls.push(u);
            }
        }
        return fallbackUrls;
    }

    async searchMangaKatanaCatalog(rawQuery = '') {
        const query = rawQuery.trim();
        try {
            const res = await fetch(`${API_BASE}/mangakatana/search?q=${encodeURIComponent(query)}`, {
                signal: AbortSignal.timeout(9000)
            });
            if (res.ok) {
                const json = await res.json();
                if (json && Array.isArray(json.data)) return json.data;
            }
        } catch (_) {}

        let targetUrl = 'https://mangakatana.com/manga';
        if (query.startsWith('http') && query.includes('mangakatana.com/manga/')) {
            targetUrl = query;
        } else if (query) {
            targetUrl = `https://mangakatana.com/?search=${encodeURIComponent(query)}&search_by=book_name`;
        }
        const html = await this.fetchMangaKatanaHtmlWithFallback(targetUrl);
        return this.parseClientMangaKatanaSearch(html, targetUrl, query);
    }

    async fetchMangaKatanaChapterList(mangaUrlOrSlug) {
        const cleanUrl = mangaUrlOrSlug.startsWith('http')
            ? mangaUrlOrSlug
            : `https://mangakatana.com/manga/${mangaUrlOrSlug.replace(/^\/+/, '')}`;
        try {
            const res = await fetch(`${API_BASE}/mangakatana/chapters?url=${encodeURIComponent(cleanUrl)}`, {
                signal: AbortSignal.timeout(9000)
            });
            if (res.ok) {
                const json = await res.json();
                if (json && Array.isArray(json.data) && json.data.length > 0) return json.data;
            }
        } catch (_) {}

        const html = await this.fetchMangaKatanaHtmlWithFallback(cleanUrl);
        return this.parseClientMangaKatanaChapters(html);
    }

    async resolveMangaKatanaChapterPages(chapterUrl) {
        try {
            const res = await fetch(`${API_BASE}/mangakatana/pages?url=${encodeURIComponent(chapterUrl)}`, {
                signal: AbortSignal.timeout(10000)
            });
            if (res.ok) {
                const json = await res.json();
                if (json && Array.isArray(json.pages) && json.pages.length > 0) return json.pages;
            }
        } catch (_) {}

        const html = await this.fetchMangaKatanaHtmlWithFallback(chapterUrl);
        return this.parseClientMangaKatanaPages(html);
    }

    async crawlMangaKatanaChaptersWithImages(mangaUrlOrSlug, targetMangaId, desiredCount, onProgress = null) {
        const maxChapters = Math.max(1, parseInt(desiredCount, 10) || 1);
        const allChapters = await this.fetchMangaKatanaChapterList(mangaUrlOrSlug);

        if (!allChapters || allChapters.length === 0) {
            throw new Error('No chapters found on MangaKatana for this series.');
        }

        // Allow scanning through all available chapters if a few chapters fail or need retry, so 100 requested = 100 pulled!
        const candidates = allChapters.slice(0, maxChapters + 1000);
        const totalGoal = Math.min(maxChapters, allChapters.length);
        const finalChapters = [];

        for (let i = 0; i < candidates.length && finalChapters.length < maxChapters; i++) {
            const chObj = candidates[i];
            const chTitle = chObj.title || `Chapter ${chObj.number || (finalChapters.length + 1)}`;

            if (typeof onProgress === 'function') {
                onProgress(finalChapters.length + 1, totalGoal, chTitle);
            }

            let pages = [];
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    pages = await this.resolveMangaKatanaChapterPages(chObj.url);
                    if (pages && pages.length > 0) break;
                } catch (chErr) {
                    if (attempt === 2) console.warn(`Skipping MangaKatana chapter ${chObj.url}:`, chErr);
                }
                await new Promise(r => setTimeout(r, 350 * (attempt + 1)));
            }

            if (pages && pages.length > 0) {
                finalChapters.push({
                    id: `${targetMangaId}-mk-${chObj.id}`,
                    mangakatanaChapterUrl: chObj.url,
                    mangaId: targetMangaId,
                    title: chTitle,
                    number: typeof chObj.number === 'number' && !isNaN(chObj.number) ? chObj.number : (finalChapters.length + 1),
                    pages,
                    pagesSaver: pages,
                    atHomeUpdatedAt: Date.now(),
                    createdAt: Date.now() - (maxChapters - finalChapters.length) * 60000
                });
            }

            if (finalChapters.length < maxChapters && i < candidates.length - 1) {
                await new Promise(r => setTimeout(r, 150));
            }
        }

        if (finalChapters.length === 0) {
            throw new Error('Could not extract chapter images from MangaKatana. Try another series or retry.');
        }

        return finalChapters;
    }

    // =========================================================================
    // CHAPTER COMMENTS / CHAT PERSISTENCE (LocalStorage + Backend Sync)
    // =========================================================================

    getLocalCommentsMap() {
        try {
            return JSON.parse(localStorage.getItem('vaniscans_chapter_comments_v2') || '{}');
        } catch (_) {
            return {};
        }
    }

    saveLocalCommentsMap(map) {
        try {
            localStorage.setItem('vaniscans_chapter_comments_v2', JSON.stringify(map));
        } catch (_) {}
    }

    async getCommentsForChapter(chapterId) {
        if (!chapterId) return [];
        const localMap = this.getLocalCommentsMap();
        const localList = Array.isArray(localMap[chapterId]) ? localMap[chapterId] : [];

        let remoteList = [];
        try {
            const res = await fetch(`${API_BASE}/comments/${encodeURIComponent(chapterId)}`, {
                signal: AbortSignal.timeout(3000)
            });
            if (res.ok) {
                const ct = res.headers.get('content-type') || '';
                if (ct.includes('application/json')) {
                    remoteList = await res.json();
                }
            }
        } catch (_) {}

        const combined = [...remoteList, ...localList];
        const seen = new Set();
        const deduped = [];
        for (const c of combined) {
            if (!c || !c.id || !c.text) continue;
            if (seen.has(c.id)) continue;
            seen.add(c.id);
            deduped.push(c);
        }
        deduped.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        localMap[chapterId] = deduped;
        this.saveLocalCommentsMap(localMap);
        return deduped;
    }

    async addCommentForChapter(chapterId, authorName, text, avatarColor = '#8b5cf6') {
        const cleanText = (text || '').trim();
        if (!chapterId || !cleanText) throw new Error('Comment cannot be empty');

        const newComment = {
            id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            chapterId,
            author: (authorName || 'Reader').trim() || 'Anonymous Reader',
            avatarColor,
            text: cleanText,
            likes: 0,
            createdAt: Date.now()
        };

        const localMap = this.getLocalCommentsMap();
        if (!Array.isArray(localMap[chapterId])) localMap[chapterId] = [];
        localMap[chapterId].unshift(newComment);
        this.saveLocalCommentsMap(localMap);

        try {
            await fetch(`${API_BASE}/comments/${encodeURIComponent(chapterId)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newComment)
            });
        } catch (_) {}

        return newComment;
    }

    async deleteCommentForChapter(chapterId, commentId) {
        const localMap = this.getLocalCommentsMap();
        if (Array.isArray(localMap[chapterId])) {
            localMap[chapterId] = localMap[chapterId].filter(c => c.id !== commentId);
            this.saveLocalCommentsMap(localMap);
        }
        try {
            await fetch(`${API_BASE}/comments/${encodeURIComponent(chapterId)}/${encodeURIComponent(commentId)}`, {
                method: 'DELETE'
            });
        } catch (_) {}
        return true;
    }

}

window.apiService = new ApiService();