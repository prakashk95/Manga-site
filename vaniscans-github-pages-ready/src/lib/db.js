import { createClient } from '@libsql/client';

let dbClient = null;

export function getDb() {
    if (!dbClient) {
        const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
        const authToken = process.env.TURSO_AUTH_TOKEN || process.env.AUTH_TOKEN;
        dbClient = createClient({
            url: url || 'file:local.db',
            authToken: authToken,
        });
    }
    return dbClient;
}

export async function initDb() {
    const db = getDb();
    await db.execute(`
        CREATE TABLE IF NOT EXISTS mangas (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            slug TEXT UNIQUE,
            cover TEXT,
            type TEXT DEFAULT 'MANHWA',
            status TEXT DEFAULT 'Ongoing',
            summary TEXT,
            rating REAL DEFAULT 0,
            rating_count INTEGER DEFAULT 0,
            views INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await db.execute(`
        CREATE TABLE IF NOT EXISTS chapters (
            id TEXT PRIMARY KEY,
            manga_id TEXT,
            title TEXT,
            chapter_number REAL,
            published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (manga_id) REFERENCES mangas(id)
        )
    `);
}