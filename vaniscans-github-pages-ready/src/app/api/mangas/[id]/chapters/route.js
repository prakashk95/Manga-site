export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req, { params }) {
    try {
        const db = await getDb();
        const { id } = await params;
        const rows = await db.execute({
            sql: 'SELECT * FROM chapters WHERE mangaId = ? ORDER BY number DESC, createdAt DESC',
            args: [id]
        });
        const chapters = rows.rows.map(r => {
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
        return NextResponse.json(chapters, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
