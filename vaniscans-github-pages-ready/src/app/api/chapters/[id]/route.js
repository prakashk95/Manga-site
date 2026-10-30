export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req, { params }) {
    try {
        const db = await getDb();
        const { id } = await params;
        const row = await db.execute({ sql: 'SELECT * FROM chapters WHERE id = ?', args: [id] });
        if (row.rows.length === 0) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
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
            title: r.title || `Chapter ${r.number || 1}`,
            number: Number(r.number) || 1,
            pages: Array.isArray(pages) ? pages : [],
            pagesSaver: Array.isArray(pagesSaver) ? pagesSaver : [],
            atHomeUpdatedAt: Number(r.atHomeUpdatedAt) || Date.now(),
            createdAt: Number(r.createdAt) || Date.now()
        };
        return NextResponse.json(chapter, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    try {
        const db = await getDb();
        const { id } = await params;
        await db.execute({ sql: 'DELETE FROM chapters WHERE id = ?', args: [id] });
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
