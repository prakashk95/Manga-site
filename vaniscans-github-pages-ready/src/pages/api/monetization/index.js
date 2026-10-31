import { getDb, getCachedQuery, invalidateDbCache } from '@/lib/db';

export async function GET() {
    try {
        const settings = await getCachedQuery('monetization_settings', 60000, async () => {
            const db = await getDb();
            const row = await db.execute('SELECT settings FROM monetization WHERE id = 1');
            if (row.rows.length === 0 || !row.rows[0].settings) return {};
            return JSON.parse(row.rows[0].settings);
        });
        return Response.json(settings, { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' } });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}

export async function POST({ request }) {
    try {
        const db = await getDb();
        const settings = await request.json();
        const jsonStr = JSON.stringify(settings || {});
        await db.execute({
            sql: `INSERT INTO monetization (id, settings, updatedAt)
                 VALUES (1, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                    settings = excluded.settings,
                    updatedAt = excluded.updatedAt`,
            args: [jsonStr, Date.now()]
        });
        invalidateDbCache();
        return Response.json(settings);
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}
