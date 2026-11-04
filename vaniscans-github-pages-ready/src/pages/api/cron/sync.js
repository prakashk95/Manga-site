import { getDb, invalidateDbCache } from '@/lib/db';
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
} from '@/lib/crawler';

// In-memory lock so overlapping cron pings never collide
let isSyncRunning = false;
let lastSyncSummary = {
    lastRunAt: null,
    checkedCount: 0,
    newChaptersAdded: 0,
    updatedSeries: [],
    status: 'Idle'
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runBatchSync(batchLimit = 10) {
    if (isSyncRunning) {
        return { skipped: true, reason: 'Sync already in progress', ...lastSyncSummary };
    }

    isSyncRunning = true;
    lastSyncSummary.status = 'Running';
    const startedAt = Date.now();
    let checkedCount = 0;
    let newChaptersAdded = 0;
    const updatedSeries = [];

    try {
        const db = await getDb();

        // Pick ongoing series ordered by oldest lastSyncedAt first (Rolling Queue)
        const { rows: mangas } = await db.execute({
            sql: `SELECT * FROM mangas 
                  WHERE (status IS NULL OR LOWER(status) != 'completed')
                  AND (
                      (fanfoxUrl IS NOT NULL AND fanfoxUrl != '') OR
                      (fanfoxId IS NOT NULL AND fanfoxId != '') OR
                      (mgekoUrl IS NOT NULL AND mgekoUrl != '') OR
                      (mgekoId IS NOT NULL AND mgekoId != '') OR
                      (mangakatanaUrl IS NOT NULL AND mangakatanaUrl != '') OR
                      (mangakatanaId IS NOT NULL AND mangakatanaId != '') OR
                      (comixUrl IS NOT NULL AND comixUrl != '') OR
                      (comixId IS NOT NULL AND comixId != '') OR
                      (mangafireId IS NOT NULL AND mangafireId != '')
                  )
                  ORDER BY COALESCE(lastSyncedAt, 0) ASC, updatedAt ASC
                  LIMIT ?`,
            args: [batchLimit]
        });

        for (const manga of (mangas || [])) {
            checkedCount++;
            const nowTs = Date.now();

            // Mark as checked immediately so the rolling queue always advances
            await db.execute({
                sql: 'UPDATE mangas SET lastSyncedAt = ? WHERE id = ?',
                args: [nowTs, manga.id]
            }).catch(() => {});

            try {
                let latestChapters = [];
                let sourceType = '';

                // Automatically detect which source this specific manga was added from
                // using its stored source URL / ID columns or its ID prefix (manga-ff-, manga-mg-, manga-mk-)
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

                if (!Array.isArray(latestChapters) || latestChapters.length === 0) {
                    await sleep(1200);
                    continue;
                }

                // Fetch existing chapter numbers for this manga
                const { rows: existingRows } = await db.execute({
                    sql: 'SELECT number, title FROM chapters WHERE mangaId = ?',
                    args: [manga.id]
                });
                const existingNumbers = new Set(
                    (existingRows || []).map(r => Number(r.number))
                );

                const newChapters = latestChapters.filter(ch => {
                    const num = Number(ch.number);
                    return !isNaN(num) && !existingNumbers.has(num);
                });

                if (newChapters.length > 0) {
                    const prefix =
                        sourceType === 'fanfox' ? 'ff'
                        : sourceType === 'mgeko' ? 'mg'
                        : sourceType === 'mangakatana' ? 'mk'
                        : sourceType === 'comix' ? 'co'
                        : 'mf';

                    let seriesChaptersAdded = 0;

                    for (let i = 0; i < newChapters.length; i++) {
                        const ch = newChapters[i];
                        const chNum = Number(ch.number) || (existingNumbers.size + i + 1);
                        const cleanChKey = (ch.id || `c${chNum}`).toString().replace(/[^a-zA-Z0-9._-]/g, '');
                        const chapterId = `${manga.id}-${prefix}-${cleanChKey}`;

                        // EAGERLY PRE-FETCH ALL PAGE IMAGES DURING BACKGROUND SYNC
                        // so readers get 0ms instant image rendering when they open the chapter!
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
                        } catch (pageErr) {
                            console.error(`[AutoSync] Page scrape warning for ${manga.title} Ch.${chNum}:`, pageErr.message);
                        }

                        // Save chapter with full pre-fetched pages array
                        await db.execute({
                            sql: `INSERT INTO chapters (
                                id, mangaId, mangadexChapterId, mangakatanaChapterUrl, mangafireChapterId,
                                comixChapterUrl, mgekoChapterUrl, fanfoxChapterUrl,
                                title, number, pages, pagesSaver, atHomeUpdatedAt, createdAt
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(id) DO UPDATE SET
                                pages = CASE WHEN json_array_length(excluded.pages) > 0 THEN excluded.pages ELSE chapters.pages END,
                                pagesSaver = CASE WHEN json_array_length(excluded.pagesSaver) > 0 THEN excluded.pagesSaver ELSE chapters.pagesSaver END,
                                atHomeUpdatedAt = excluded.atHomeUpdatedAt`,
                            args: [
                                chapterId,
                                manga.id,
                                null,
                                sourceType === 'mangakatana' ? (ch.url || null) : null,
                                sourceType === 'mangafire' ? (ch.mangafireChapterId || ch.id || null) : null,
                                sourceType === 'comix' ? (ch.url || null) : null,
                                sourceType === 'mgeko' ? (ch.url || null) : null,
                                sourceType === 'fanfox' ? (ch.url || null) : null,
                                ch.title || `Chapter ${chNum}`,
                                chNum,
                                JSON.stringify(Array.isArray(pages) ? pages : []),
                                JSON.stringify(Array.isArray(pages) ? pages : []),
                                Date.now(),
                                Date.now()
                            ]
                        });
                        newChaptersAdded++;
                        seriesChaptersAdded++;

                        // Short polite pause between scraping new chapters
                        await sleep(600);
                    }

                    // Update manga updatedAt (and refresh FanFox cover if available) so it jumps to #1 on homepage
                    const freshCover = newChapters[0]?.mangaCover || manga.cover || '';
                    await db.execute({
                        sql: 'UPDATE mangas SET updatedAt = ?, cover = ?, lastSyncedAt = ? WHERE id = ?',
                        args: [Date.now(), freshCover, Date.now(), manga.id]
                    });

                    updatedSeries.push({
                        id: manga.id,
                        title: manga.title,
                        added: seriesChaptersAdded,
                        source: sourceType
                    });
                }
            } catch (err) {
                console.error(`[AutoSync] Failed checking ${manga.title}:`, err.message);
            }

            // Polite 1.2s delay between series in the batch
            await sleep(1200);
        }

        if (newChaptersAdded > 0) {
            invalidateDbCache();
        }

        lastSyncSummary = {
            lastRunAt: Date.now(),
            durationMs: Date.now() - startedAt,
            checkedCount,
            newChaptersAdded,
            updatedSeries,
            status: 'Completed'
        };
        return { ok: true, ...lastSyncSummary };
    } catch (err) {
        lastSyncSummary = {
            ...lastSyncSummary,
            lastRunAt: Date.now(),
            status: `Error: ${err.message}`
        };
        return { ok: false, error: err.message, ...lastSyncSummary };
    } finally {
        isSyncRunning = false;
    }
}

export async function GET({ request }) {
    const url = new URL(request.url);
    const statusOnly = url.searchParams.get('status') === '1';

    if (statusOnly) {
        try {
            const db = await getDb();
            const totalRes = await db.execute(`SELECT COUNT(*) as total FROM mangas WHERE status IS NULL OR LOWER(status) != 'completed'`);
            return Response.json({
                ok: true,
                isSyncRunning,
                activeSeriesCount: Number(totalRes.rows?.[0]?.total) || 0,
                ...lastSyncSummary
            });
        } catch (err) {
            return Response.json({ ok: false, error: err.message, ...lastSyncSummary });
        }
    }

    const secretEnv = (
        (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.CRON_SECRET) ||
        process.env.CRON_SECRET ||
        ''
    ).trim();

    const providedKey = (url.searchParams.get('key') || request.headers.get('x-cron-key') || '').trim();
    if (secretEnv && providedKey !== secretEnv) {
        return Response.json({ error: 'Unauthorized cron key' }, { status: 401 });
    }

    const limitParam = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '10', 10), 1), 25);
    const waitMode = url.searchParams.get('wait') === '1';

    // Default for cron-job.org (which has a 30s timeout on free tier):
    // Respond 200 OK immediately to keep Render awake and run the batch in the background,
    // OR if wait=1 (from Admin Studio button), await the result and return full stats.
    if (!waitMode) {
        runBatchSync(limitParam).catch(() => {});
        return Response.json({
            ok: true,
            mode: 'background',
            message: `Keep-alive ping received! Triggered rolling auto-sync (with full page pre-fetching) for next ${limitParam} manga in background.`,
            isSyncRunning: true,
            lastSyncSummary
        });
    }

    const result = await runBatchSync(limitParam);
    return Response.json(result);
}
