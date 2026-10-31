import { getDb, invalidateDbCache } from '@/lib/db';

export async function GET({ params }) {
    try {
        const db = await getDb();
        const { id } = params;
        const row = await db.execute({ sql: 'SELECT * FROM chapters WHERE id = ?', args: [id] });
        if (row.rows.length === 0) return Response.json({ error: 'Chapter not found' }, { status: 404 });
        const r = row.rows[0];
        let pages = [];
        let pagesSaver = [];
        try { pages = JSON.parse(r.pages); } catch (_) {}
        try { pagesSaver = JSON.parse(r.pagesSaver); } catch (_) { pagesSaver = pages; }

        const chapter = {
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
        return Response.json(chapter, { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=600' } });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE({ params }) {
    try {
        const db = await getDb();
        const { id } = params;
        await db.execute({ sql: 'DELETE FROM chapters WHERE id = ?', args: [id] });
        invalidateDbCache();
        return Response.json({ success: true });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}
