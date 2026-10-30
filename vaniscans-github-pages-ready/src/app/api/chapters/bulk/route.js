export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { NextResponse } from 'next/server';
import { getDb, invalidateDbCache } from '@/lib/db';

export async function POST(req) {
    try {
        const db = await getDb();
        const { chapters } = await req.json();
        if (!Array.isArray(chapters)) {
            return NextResponse.json({ error: 'Chapters array required' }, { status: 400 });
        }

        const touchedMangaIds = new Set();
        const now = Date.now();

        for (const chapter of chapters) {
            if (chapter && chapter.id && chapter.mangaId) {
                touchedMangaIds.add(chapter.mangaId);
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
                        Number(chapter.atHomeUpdatedAt) || now,
                        Number(chapter.createdAt) || now
                    ]
                });
            }
        }

        for (const mId of touchedMangaIds) {
            await db.execute({
                sql: 'UPDATE mangas SET updatedAt = ? WHERE id = ?',
                args: [now, mId]
            });
        }

        invalidateDbCache();
        return NextResponse.json({ success: true, count: chapters.length });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
