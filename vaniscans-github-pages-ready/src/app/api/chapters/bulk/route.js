export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { isAdminRequest, unauthorized } from '@/lib/adminAuth';

export async function POST(req) {
    if (!isAdminRequest(req)) return unauthorized();
    try {
        const db = await getDb();
        const { chapters } = await req.json();
        if (!Array.isArray(chapters)) {
            return NextResponse.json({ error: 'Chapters array required' }, { status: 400 });
        }

        for (const chapter of chapters) {
            if (chapter && chapter.id && chapter.mangaId) {
                const pagesJson = JSON.stringify(Array.isArray(chapter.pages) ? chapter.pages : []);
                const pagesSaverJson = JSON.stringify(Array.isArray(chapter.pagesSaver) ? chapter.pagesSaver : (chapter.pages || []));
                await db.execute({
                    sql: `INSERT INTO chapters (
                        id, mangaId, mangadexChapterId, mangakatanaChapterUrl, mangafireChapterId,
                        title, number, pages, pagesSaver, atHomeUpdatedAt, createdAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        mangaId = excluded.mangaId,
                        mangadexChapterId = excluded.mangadexChapterId,
                        mangakatanaChapterUrl = excluded.mangakatanaChapterUrl,
                mangafireChapterId = excluded.mangafireChapterId,
                        title = excluded.title,
                        number = excluded.number,
                        pages = excluded.pages,
                        pagesSaver = excluded.pagesSaver,
                        atHomeUpdatedAt = excluded.atHomeUpdatedAt,
                        createdAt = excluded.createdAt`,
                    args: [
                        chapter.id,
                        chapter.mangaId,
                        chapter.mangadexChapterId || null,
                        chapter.mangakatanaChapterUrl || null,
                chapter.mangafireChapterId || null,
                        chapter.title || `Chapter ${chapter.number || 1}`,
                        Number(chapter.number) || 1,
                        pagesJson,
                        pagesSaverJson,
                        Number(chapter.atHomeUpdatedAt) || Date.now(),
                        Number(chapter.createdAt) || Date.now()
                    ]
                });
            }
        }

        return NextResponse.json({ success: true, count: chapters.length });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
