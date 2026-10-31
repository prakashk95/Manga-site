import { createClient } from '@libsql/client/web';
import fs from 'fs';

const CONFIG_JSON_PATH = '/tmp/vaniscans_turso_config.json';
const QUERY_CACHE = new Map();

export async function getCachedQuery(key, ttlMs, fetcher) {
    const now = Date.now();
    const hit = QUERY_CACHE.get(key);
    if (hit && now < hit.expiresAt) return hit.data;
    const data = await fetcher();
    QUERY_CACHE.set(key, { data, expiresAt: now + ttlMs });
    return data;
}

export function invalidateDbCache(prefix = '') {
    if (!prefix) {
        QUERY_CACHE.clear();
        return;
    }
    for (const k of QUERY_CACHE.keys()) {
        if (k.startsWith(prefix)) QUERY_CACHE.delete(k);
    }
}

const SCHEMA_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS mangas (
        id TEXT PRIMARY KEY,
        mangadexId TEXT,
        mangakatanaId TEXT,
        mangakatanaUrl TEXT,
        mangafireId TEXT,
        title TEXT NOT NULL,
        author TEXT,
        cover TEXT,
        banner TEXT,
        genres TEXT,
        status TEXT DEFAULT 'Ongoing',
        rating REAL DEFAULT 9.8,
        synopsis TEXT,
        updatedAt INTEGER,
        metaTitle TEXT,
        metaDescription TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY,
        mangaId TEXT NOT NULL,
        mangadexChapterId TEXT,
        mangakatanaChapterUrl TEXT,
        mangafireChapterId TEXT,
        title TEXT,
        number REAL DEFAULT 1,
        pages TEXT,
        pagesSaver TEXT,
        atHomeUpdatedAt INTEGER,
        createdAt INTEGER
    )`,
    `CREATE INDEX IF NOT EXISTS idx_chapters_mangaId ON chapters(mangaId)`,
    `CREATE INDEX IF NOT EXISTS idx_mangas_updatedAt ON mangas(updatedAt DESC)`,
    `CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        chapterId TEXT NOT NULL,
        author TEXT,
        avatarColor TEXT,
        text TEXT NOT NULL,
        likes INTEGER DEFAULT 0,
        createdAt INTEGER
    )`,
    `CREATE INDEX IF NOT EXISTS idx_comments_chapterId ON comments(chapterId)`,
    `CREATE TABLE IF NOT EXISTS monetization (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        settings TEXT NOT NULL,
        updatedAt INTEGER
    )`
];

export async function loadTursoRuntimeConfig() {
    const metaEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
    const envUrl = (
        metaEnv.TURSO_DATABASE_URL ||
        process.env.TURSO_DATABASE_URL ||
        process.env.LIBSQL_URL ||
        ''
    ).trim();
    const envToken = (
        metaEnv.TURSO_AUTH_TOKEN ||
        process.env.TURSO_AUTH_TOKEN ||
        process.env.LIBSQL_AUTH_TOKEN ||
        ''
    ).trim();

    if (envUrl) return { url: envUrl, authToken: envToken, source: 'env' };

    try {
        if (fs.existsSync(CONFIG_JSON_PATH)) {
            const cfg = JSON.parse(fs.readFileSync(CONFIG_JSON_PATH, 'utf-8'));
            if (cfg && cfg.url) return { ...cfg, source: 'runtime' };
        }
    } catch (_) {}

    return { url: '', authToken: '', source: 'unconfigured' };
}

export async function saveTursoRuntimeConfig(url, authToken) {
    const clean = { url: (url || '').trim(), authToken: (authToken || '').trim() };
    try {
        fs.writeFileSync(CONFIG_JSON_PATH, JSON.stringify(clean), 'utf-8');
    } catch (_) {}
    cachedAdapter = null;
    invalidateDbCache();
    return clean;
}

let cachedAdapter = null;
let memoryFallback = { mangas: [], chapters: [], comments: [], monetization: {} };

export async function getDb() {
    if (cachedAdapter) return cachedAdapter;

    const { url: remoteUrl, authToken } = await loadTursoRuntimeConfig();

    if (remoteUrl) {
        const webUrl = remoteUrl.replace(/^libsql:\/\//i, 'https://');
        const rawClient = createClient({
            url: webUrl,
            authToken: authToken || undefined
        });

        await Promise.all(SCHEMA_STATEMENTS.map(sql => rawClient.execute(sql).catch(() => {})));

        cachedAdapter = {
            execute: async (queryOrObj) => {
                const sql = typeof queryOrObj === 'string' ? queryOrObj : queryOrObj.sql;
                if (!/^\s*(SELECT|CREATE|PRAGMA)\b/i.test(sql)) {
                    invalidateDbCache();
                }
                return rawClient.execute(queryOrObj);
            }
        };
        return cachedAdapter;
    }

    // Minimal no-op fallback if TURSO_DATABASE_URL isn't set yet in .env so server doesn't crash on boot
    return {
        execute: async () => ({ rows: [] })
    };
}

export function getMangaSlug(m) {
    if (!m) return 'series';
    const base = (m.title || 'series').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const hash = (m.mangadexId || m.mangakatanaId || m.mangafireId || m.id || '').replace(/^manga-(md|mk|mf)-/, '').slice(0, 8).toLowerCase();
    return hash ? `${base}-${hash}` : base;
}

export async function getServerCatalogWithChapters() {
    return getCachedQuery('api_mangas_catalog', 60000, async () => {
        const db = await getDb();
        const rows = await db.execute('SELECT * FROM mangas ORDER BY updatedAt DESC');

        let chaptersByMangaId = {};
        try {
            const chRows = await db.execute(
                'SELECT id, mangaId, title, number, CASE WHEN json_valid(pages) THEN json_array_length(pages) ELSE 0 END as pageCount, createdAt FROM chapters ORDER BY number DESC'
            );
            for (const c of (chRows.rows || [])) {
                const mId = c.mangaId;
                if (!mId) continue;
                if (!chaptersByMangaId[mId]) chaptersByMangaId[mId] = [];
                if (chaptersByMangaId[mId].length < 3) {
                    chaptersByMangaId[mId].push({
                        id: c.id,
                        mangaId: mId,
                        title: c.title || `Chapter ${c.number || 1}`,
                        number: Number(c.number) || 1,
                        pageCount: Number(c.pageCount) || 0,
                        createdAt: Number(c.createdAt) || Date.now()
                    });
                }
            }
        } catch (_) {}

        return (rows.rows || []).map(r => {
            let genres = ['Action'];
            try { genres = JSON.parse(r.genres); } catch (_) {}
            return {
                id: r.id,
                mangadexId: r.mangadexId || null,
                mangakatanaId: r.mangakatanaId || null,
                mangakatanaUrl: r.mangakatanaUrl || null,
                mangafireId: r.mangafireId || null,
                title: r.title,
                author: r.author || 'Author Unknown',
                cover: r.cover || '',
                banner: r.banner || r.cover || '',
                genres: Array.isArray(genres) ? genres : ['Action'],
                status: r.status || 'Ongoing',
                rating: Number(r.rating) || 9.8,
                synopsis: r.synopsis || '',
                metaTitle: r.metaTitle || '',
                metaDescription: r.metaDescription || '',
                latestChapters: chaptersByMangaId[r.id] || [],
                updatedAt: Number(r.updatedAt) || Date.now()
            };
        });
    });
}

export async function getServerMangaBySlug(slug = '') {
    const cleanSlug = decodeURIComponent(slug || '').toLowerCase();
    const catalog = await getServerCatalogWithChapters();
    const found = catalog.find(m => {
        const fullSlug = getMangaSlug(m);
        const mSlug = (m.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        return fullSlug === cleanSlug || mSlug === cleanSlug || (m.id || '').toLowerCase() === cleanSlug;
    });
    if (!found) return { manga: null, chapters: [] };

    const chapters = await getCachedQuery(`manga_chapters_${found.id}`, 60000, async () => {
        const db = await getDb();
        const rows = await db.execute({
            sql: 'SELECT * FROM chapters WHERE mangaId = ? ORDER BY number DESC, createdAt DESC',
            args: [found.id]
        });
        return (rows.rows || []).map(r => {
            let pages = [];
            let pagesSaver = [];
            try { pages = JSON.parse(r.pages); } catch (_) {}
            try { pagesSaver = JSON.parse(r.pagesSaver); } catch (_) { pagesSaver = pages; }
            return {
                id: r.id,
                mangaId: r.mangaId,
                mangadexChapterId: r.mangadexChapterId || null,
                mangakatanaChapterUrl: r.mangakatanaChapterUrl || null,
                mangafireChapterId: r.mangafireChapterId || null,
                title: r.title || `Chapter ${r.number || 1}`,
                number: Number(r.number) || 1,
                pages: Array.isArray(pages) ? pages : [],
                pagesSaver: Array.isArray(pagesSaver) ? pagesSaver : [],
                atHomeUpdatedAt: Number(r.atHomeUpdatedAt) || Date.now(),
                createdAt: Number(r.createdAt) || Date.now()
            };
        });
    });

    return { manga: found, chapters };
}
