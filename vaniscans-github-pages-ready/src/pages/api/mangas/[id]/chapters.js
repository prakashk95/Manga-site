import { getDb, getCachedQuery } from '@/lib/db';

export async function GET({ params }) {
    try {
        const { id } = params;
        const chapters = await getCachedQuery(`manga_chapters_${id}`, 30000, async () => {
            const db = await getDb();
            const rows = await db.execute({
                sql: 'SELECT * FROM chapters WHERE mangaId = ? ORDER BY number DESC, createdAt DESC',
                args: [id]
            });
            return rows.rows.map(r => {
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
                    manhuausChapterUrl: r.manhuausChapterUrl || null,
                    title: r.title || `Chapter ${r.number || 1}`,
                    number: Number(r.number) || 1,
                    pages: Array.isArray(pages) ? pages : [],
                    pagesSaver: Array.isArray(pagesSaver) ? pagesSaver : [],
                    atHomeUpdatedAt: Number(r.atHomeUpdatedAt) || Date.now(),
                    createdAt: Number(r.createdAt) || Date.now()
                };
            });
        });
        return Response.json(chapters, { headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=60' } });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}
