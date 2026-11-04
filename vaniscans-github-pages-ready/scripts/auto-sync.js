import { getDb } from '../src/lib/db.js';
import {
    fetchFanfoxChapters,
    fetchFanfoxPages,
    fetchMgekoChapters,
    fetchMgekoPages,
    parseMangaKatanaChaptersHtml,
    parseMangaKatanaPagesHtml,
    fetchHtmlWithFallback,
    fetchComixChapters,
    fetchComixPages,
    fetchMangaFireChapters,
    fetchMangaFirePages
} from '../src/lib/crawler.js';

async function runLibrarySync() {
    console.log('[AutoSync] Starting full library check (with eager page pre-fetching) for MangaKatana, Mgeko & FanFox...');
    try {
        const db = await getDb();
        const { rows: mangas } = await db.execute('SELECT * FROM mangas WHERE status IS NULL OR LOWER(status) != "completed"');
        
        let totalNewChapters = 0;

        for (const manga of mangas) {
            try {
                let latestChapters = [];
                let sourceType = '';

                if (manga.fanfoxUrl || manga.fanfoxId || String(manga.id).startsWith('manga-ff-')) {
                    sourceType = 'fanfox';
                    latestChapters = await fetchFanfoxChapters(manga.fanfoxUrl || manga.fanfoxId);
                } else if (manga.mgekoUrl || manga.mgekoId || String(manga.id).startsWith('manga-mg-')) {
                    sourceType = 'mgeko';
                    latestChapters = await fetchMgekoChapters(manga.mgekoUrl || manga.mgekoId);
                } else if (manga.mangakatanaUrl || manga.mangakatanaId || String(manga.id).startsWith('manga-mk-')) {
                    sourceType = 'mangakatana';
                    const targetUrl = (manga.mangakatanaUrl || '').startsWith('http')
                        ? manga.mangakatanaUrl
                        : `https://mangakatana.com/manga/${(manga.mangakatanaId || '').replace(/^\/+/, '')}`;
                    const { html } = await fetchHtmlWithFallback(targetUrl);
                    latestChapters = parseMangaKatanaChaptersHtml(html);
                } else if (manga.comixUrl || manga.comixId || String(manga.id).startsWith('manga-co-')) {
                    sourceType = 'comix';
                    latestChapters = await fetchComixChapters(manga.comixUrl || manga.comixId);
                } else if (manga.mangafireId || String(manga.id).startsWith('manga-mf-')) {
                    sourceType = 'mangafire';
                    latestChapters = await fetchMangaFireChapters(manga.mangafireId, 'en');
                }

                if (!Array.isArray(latestChapters) || latestChapters.length === 0) continue;

                const { rows: existingRows } = await db.execute({
                    sql: 'SELECT number FROM chapters WHERE mangaId = ?',
                    args: [manga.id]
                });
                const existingNumbers = new Set(existingRows.map(r => Number(r.number)));

                const newChapters = latestChapters.filter(ch => !existingNumbers.has(Number(ch.number)));

                if (newChapters.length > 0) {
                    console.log(`[AutoSync] Found ${newChapters.length} new chapter(s) for "${manga.title}" via ${sourceType}. Pre-fetching pages...`);
                    const prefix =
                        sourceType === 'fanfox' ? 'ff'
                        : sourceType === 'mgeko' ? 'mg'
                        : sourceType === 'mangakatana' ? 'mk'
                        : sourceType === 'comix' ? 'co'
                        : 'mf';

                    for (const ch of newChapters) {
                        const chNum = Number(ch.number) || 1;
                        const cleanChKey = (ch.id || `c${chNum}`).toString().replace(/[^a-zA-Z0-9._-]/g, '');
                        const chapterId = `${manga.id}-${prefix}-${cleanChKey}`;

                        let pages = [];
                        try {
                            if (sourceType === 'fanfox' && ch.url) {
                                pages = await fetchFanfoxPages(ch.url);
                            } else if (sourceType === 'mgeko' && ch.url) {
                                pages = await fetchMgekoPages(ch.url);
                            } else if (sourceType === 'mangakatana' && ch.url) {
                                const { html: chHtml } = await fetchHtmlWithFallback(ch.url);
                                pages = parseMangaKatanaPagesHtml(chHtml);
                            } else if (sourceType === 'comix' && ch.url) {
                                pages = await fetchComixPages(ch.url);
                            } else if (sourceType === 'mangafire' && (ch.mangafireChapterId || ch.id)) {
                                pages = await fetchMangaFirePages(ch.mangafireChapterId || ch.id);
                            }
                        } catch (_) {}

                        await db.execute({
                            sql: `INSERT INTO chapters (
                                id, mangaId, mangakatanaChapterUrl, mgekoChapterUrl, fanfoxChapterUrl, comixChapterUrl, mangafireChapterId,
                                title, number, pages, pagesSaver, atHomeUpdatedAt, createdAt
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(id) DO UPDATE SET
                                pages = CASE WHEN json_array_length(excluded.pages) > 0 THEN excluded.pages ELSE chapters.pages END,
                                pagesSaver = CASE WHEN json_array_length(excluded.pagesSaver) > 0 THEN excluded.pagesSaver ELSE chapters.pagesSaver END`,
                            args: [
                                chapterId,
                                manga.id,
                                sourceType === 'mangakatana' ? (ch.url || null) : null,
                                sourceType === 'mgeko' ? (ch.url || null) : null,
                                sourceType === 'fanfox' ? (ch.url || null) : null,
                                sourceType === 'comix' ? (ch.url || null) : null,
                                sourceType === 'mangafire' ? (ch.mangafireChapterId || ch.id || null) : null,
                                ch.title || `Chapter ${chNum}`,
                                chNum,
                                JSON.stringify(Array.isArray(pages) ? pages : []),
                                JSON.stringify(Array.isArray(pages) ? pages : []),
                                Date.now(),
                                Date.now()
                            ]
                        });
                        totalNewChapters++;
                    }

                    await db.execute({
                        sql: 'UPDATE mangas SET updatedAt = ?, lastSyncedAt = ? WHERE id = ?',
                        args: [Date.now(), Date.now(), manga.id]
                    });
                }
            } catch (err) {
                console.error(`[AutoSync] Error syncing manga ${manga.title}:`, err.message);
            }
        }

        console.log(`[AutoSync] Sync complete. Added ${totalNewChapters} new chapters with pre-fetched pages.`);
    } catch (err) {
        console.error('[AutoSync] Fatal error during sync execution:', err);
    }
}

runLibrarySync();
