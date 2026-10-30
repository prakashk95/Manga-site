import fs from 'fs';
import path from 'path';

const REPO_SQLITE_PATH = path.join(process.cwd(), 'backend/data/vaniscans.sqlite');
const TMP_SQLITE_PATH = '/tmp/vaniscans.sqlite';
const CONFIG_JSON_PATH = '/tmp/vaniscans_turso_config.json';

// ============================================================================
// TURSO QUOTA SHIELD: IN-MEMORY SERVER CACHE (Protects against bot floods!)
// ============================================================================
const QUERY_CACHE = new Map();

export async function getCachedQuery(key, ttlMs, fetcher) {
    const now = Date.now();
    const hit = QUERY_CACHE.get(key);
    if (hit && now < hit.expiresAt) {
        return hit.data;
    }
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

function getWritableSqliteFilePath() {
    const dataDir = path.dirname(REPO_SQLITE_PATH);
    try {
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.accessSync(dataDir, fs.constants.W_OK);
        return REPO_SQLITE_PATH;
    } catch (_) {
        try {
            if (!fs.existsSync(TMP_SQLITE_PATH) && fs.existsSync(REPO_SQLITE_PATH)) {
                fs.copyFileSync(REPO_SQLITE_PATH, TMP_SQLITE_PATH);
            }
        } catch (_) {}
        return TMP_SQLITE_PATH;
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

const MIGRATION_STATEMENTS = [
    `ALTER TABLE mangas ADD COLUMN metaTitle TEXT`,
    `ALTER TABLE mangas ADD COLUMN metaDescription TEXT`,
    `ALTER TABLE mangas ADD COLUMN mangafireId TEXT`,
    `ALTER TABLE chapters ADD COLUMN mangafireChapterId TEXT`
];

async function getNetlifyBlobStore() {
    try {
        const { getStore } = await import('@netlify/blobs');
        return getStore({ name: 'vaniscans-sqlite-store', consistency: 'strong' });
    } catch (_) {
        try {
            const { getStore } = await import('@netlify/blobs');
            return getStore('vaniscans-sqlite-store');
        } catch (_2) {
            return null;
        }
    }
}

async function loadSqliteBufferFromNetlifyBlobs() {
    try {
        const store = await getNetlifyBlobStore();
        if (!store) return null;
        const arrayBuffer = await store.get('vaniscans.sqlite', { type: 'arrayBuffer' });
        if (arrayBuffer && arrayBuffer.byteLength > 0) {
            return new Uint8Array(arrayBuffer);
        }
    } catch (_) {}
    return null;
}

async function saveSqliteBufferToNetlifyBlobs(uint8Array) {
    try {
        const store = await getNetlifyBlobStore();
        if (!store) return false;
        const ab = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);
        await store.set('vaniscans.sqlite', ab);
        return true;
    } catch (_) {
        return false;
    }
}

export async function loadTursoRuntimeConfig() {
    const envUrl = (
        process.env.TURSO_DATABASE_URL ||
        process.env.LIBSQL_URL ||
        process.env.SQLITE_URL ||
        ''
    ).trim();
    const envToken = (
        process.env.TURSO_AUTH_TOKEN ||
        process.env.LIBSQL_AUTH_TOKEN ||
        process.env.SQLITE_AUTH_TOKEN ||
        ''
    ).trim();

    if (envUrl) return { url: envUrl, authToken: envToken, source: 'env' };

    try {
        const store = await getNetlifyBlobStore();
        if (store) {
            const cfg = await store.get('turso_config.json', { type: 'json' });
            if (cfg && cfg.url) return { ...cfg, source: 'blobs' };
        }
    } catch (_) {}

    try {
        if (fs.existsSync(CONFIG_JSON_PATH)) {
            const cfg = JSON.parse(fs.readFileSync(CONFIG_JSON_PATH, 'utf-8'));
            if (cfg && cfg.url) return { ...cfg, source: 'tmp' };
        }
    } catch (_) {}

    return { url: '', authToken: '', source: 'local' };
}

export async function saveTursoRuntimeConfig(url, authToken) {
    const clean = { url: (url || '').trim(), authToken: (authToken || '').trim() };
    try {
        fs.writeFileSync(CONFIG_JSON_PATH, JSON.stringify(clean), 'utf-8');
    } catch (_) {}
    try {
        const store = await getNetlifyBlobStore();
        if (store) {
            await store.setJSON('turso_config.json', clean);
        }
    } catch (_) {}
    cachedAdapter = null;
    invalidateDbCache();
    return clean;
}

class PureJsSqliteAdapter {
    constructor(SQL, filePath) {
        this.SQL = SQL;
        this.filePath = filePath;
        this.db = null;
        this.lastLoadedAt = 0;
    }

    async ensureLoaded() {
        const now = Date.now();
        if (!this.db || now - this.lastLoadedAt > 5000) {
            let buffer = await loadSqliteBufferFromNetlifyBlobs();
            if (!buffer) {
                try {
                    if (fs.existsSync(this.filePath)) {
                        buffer = new Uint8Array(fs.readFileSync(this.filePath));
                    } else if (fs.existsSync(REPO_SQLITE_PATH)) {
                        buffer = new Uint8Array(fs.readFileSync(REPO_SQLITE_PATH));
                    }
                } catch (_) {}
            }

            try {
                this.db = buffer && buffer.length > 0 ? new this.SQL.Database(buffer) : new this.SQL.Database();
            } catch (_) {
                this.db = new this.SQL.Database();
            }

            for (const stmt of SCHEMA_STATEMENTS) {
                this.db.run(stmt);
            }
            for (const mig of MIGRATION_STATEMENTS) {
                try {
                    this.db.run(mig);
                } catch (_) {}
            }
            this.lastLoadedAt = Date.now();
        }
    }

    async persist() {
        if (!this.db) return;
        const data = this.db.export();
        const uint8 = new Uint8Array(data);
        try {
            fs.writeFileSync(this.filePath, Buffer.from(uint8));
        } catch (_) {}
        await saveSqliteBufferToNetlifyBlobs(uint8);
        this.lastLoadedAt = Date.now();
    }

    async execute(queryOrObj) {
        await this.ensureLoaded();
        const sql = typeof queryOrObj === 'string' ? queryOrObj : queryOrObj.sql;
        const rawArgs = (typeof queryOrObj === 'object' && Array.isArray(queryOrObj.args)) ? queryOrObj.args : [];
        const args = rawArgs.map(a => (a === undefined ? null : a));

        const isSelect = /^\s*SELECT\b/i.test(sql);
        if (isSelect) {
            const stmt = this.db.prepare(sql);
            if (args.length > 0) stmt.bind(args);
            const rows = [];
            while (stmt.step()) {
                rows.push(stmt.getAsObject());
            }
            stmt.free();
            return { rows };
        } else {
            this.db.run(sql, args);
            if (!/^\s*CREATE\b/i.test(sql)) {
                invalidateDbCache();
                await this.persist();
            }
            return { rows: [] };
        }
    }
}

let cachedAdapter = null;
let cachedSqlAsm = null;

export async function getDb() {
    if (cachedAdapter) return cachedAdapter;

    const { url: remoteUrl, authToken } = await loadTursoRuntimeConfig();

    // 1. Remote Cloud SQLite (Turso / libSQL) via pure HTTP client (`@libsql/client/web`)
    if (remoteUrl && (remoteUrl.startsWith('libsql://') || remoteUrl.startsWith('https://') || remoteUrl.startsWith('http://'))) {
        try {
            const { createClient } = await import('@libsql/client/web');
            const webUrl = remoteUrl.replace(/^libsql:\/\//i, 'https://');
            const rawClient = createClient({
                url: webUrl,
                authToken: authToken || undefined
            });
            await Promise.all(SCHEMA_STATEMENTS.map(sql => rawClient.execute(sql).catch(() => {})));
            await Promise.all(MIGRATION_STATEMENTS.map(mig => rawClient.execute(mig).catch(() => {})));

            // Wrap client.execute so any write (INSERT/UPDATE/DELETE) automatically invalidates the read cache!
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
        } catch (err) {
            console.error('Turso web client error, falling back to PureJS SQLite:', err);
        }
    }

    // 2. Pure-JS SQLite (`sql-asm.js` fallback)
    const localFilePath = getWritableSqliteFilePath();
    if (!cachedSqlAsm) {
        const initSqlJs = (await import('sql.js/dist/sql-asm.js')).default;
        cachedSqlAsm = await initSqlJs();
    }

    cachedAdapter = new PureJsSqliteAdapter(cachedSqlAsm, localFilePath);
    await cachedAdapter.ensureLoaded();
    return cachedAdapter;
}
