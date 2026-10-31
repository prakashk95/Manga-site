import { loadTursoRuntimeConfig, saveTursoRuntimeConfig, getDb } from '@/lib/db';

export async function GET() {
    try {
        const cfg = await loadTursoRuntimeConfig();
        return Response.json({
            url: cfg.url || '',
            hasToken: Boolean(cfg.authToken),
            source: cfg.source || 'env'
        });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}

export async function POST({ request }) {
    try {
        const { url, authToken } = await request.json();
        await saveTursoRuntimeConfig(url, authToken);
        const db = await getDb();
        const res = await db.execute('SELECT COUNT(*) as count FROM mangas');
        return Response.json({
            success: true,
            url: (url || '').trim(),
            mangaCount: res.rows?.[0]?.count ?? 0
        });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}
