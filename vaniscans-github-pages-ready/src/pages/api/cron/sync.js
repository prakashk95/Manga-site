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

const MANGADEX_API = 'https://api.mangadex.org';
const USER_AGENT = 'VaniScans/6.0 (+https://vaniscans.online)';

let isSyncRunning = false;
let rollingCursorIndex = 0;
const recentSyncedTimeById = new Map();

let lastSyncSummary = {
    lastRunAt: null,
    checkedCount: 0,
    totalEligible: 0,
    newChaptersAdded: 0,
    checkedTitles: [],
    updatedSeries: [],
    status: 'Idle'
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchMangaDexLatestChapters(mangaId) {
    const params = new URLSearchParams();
    params.append('limit', '100');
    params.append('offset', '0');
    params.append('translatedLanguage[]', 'en');
    params.append('order[chapter]', 'desc');
    params.append('contentRating[]', 'safe');
    params.append('contentRating[]', 'suggestive');
    params.append('contentRating[]', 'erotica');
    params.append('includeEmptyPages', '0');
    params.append('includeExternalUrl', '0');
    params.append('includeFutureUpdates', '0');

    const res = await fetch(`${MANGADEX_API}/manga/${encodeURIComponent(mangaId)}/feed?${params.toString()}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return [];
    const json = await res.json();
    const batch = Array.isArray(json?.data) ? json.data : [];
    const seen = new Set();
    const collected = [];

    for (const chObj of batch) {
        const attr = chObj.attributes || {};
        if (attr.externalUrl) continue;
        if (typeof attr.pages === 'number' && attr.pages <= 0) continue;
        const chNumKey = attr.chapter ? String(attr.chapter).trim() : `oneshot-${chObj.id}`;
        if (seen.has(chNumKey)) continue;
        seen.add(chNumKey);
        const chNum = attr.chapter ? parseFloat(attr.chapter) : null;
        if (chNum === null || isNaN(chNum)) continue;
        const chLabel = `Chapter ${attr.chapter}`;
        const chTitle = attr.title ? `${chLabel} - ${attr.title}` : chLabel;
        collected.push({
            id: chObj.id,
            mangadexChapterId: chObj.id,
            title: chTitle,
            number: chNum
        });
    }
    return collected;
}

async function fetchMangaDexChapterPages(chapterId) {
    const res = await fetch(`${MANGADEX_API}/at-home/server/${encodeURIComponent(chapterId)}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return [];
    const atHome = await res.json();
    if (!atHome?.baseUrl || !atHome?.chapter) return [];
    const hash = atHome.chapter.hash;
    const saverFiles = atHome.chapter.dataSaver || [];
    const dataFiles = atHome.chapter.data || [];
    const folder = saverFiles.length > 0 ? 'data-saver' : 'data';
    const files = saverFiles.length > 0 ? saverFiles : dataFiles;
    return files.map(f => `https://uploads.mangadex.org/${folder}/${hash}/${f}`);
}

function normalizeNumKey(n) {
    const num = Number(n);
    if (isNaN(num)) return '';
    return (Math.round(num * 1000) / 1000).toString();
}

function normalizeUrlKey(u = '') {
    return (u || '')
        .toString()
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\/[^/]+/i, '')
        .replace(/\/+$/, '');
}

export async function runBatchSync(batchLimit = 10) {
    if (isSyncRunning) {
        return { skipped: true, reason: 'Sync already in progress', ...lastSyncSummary };
    }

    isSyncRunning = true;
    lastSyncSummary.status = 'Running';
    const startedAt = Date.now();
    let checkedCount = 0;
    let newChaptersAdded = 0;
    const checkedTitles = [];
    const updatedSeries = [];

    try {
        const db = await getDb();

        // Ensure lastSyncedAt column exists on mangas table
        await db.execute('ALTER TABLE mangas ADD COLUMN lastSyncedAt INTEGER DEFAULT 0').catch(() => {});

        // Fetch all ongoing series
        const { rows: allMangas } = await db.execute(
            `SELECT * FROM mangas WHERE status IS NULL OR LOWER(status) != 'completed'`
        );

        const allList = Array.isArray(allMangas) ? allMangas : [];

        // Sort by effective lastSyncedAt ascending (combining DB lastSyncedAt and in-memory map)
        // so the series checked most recently ALWAYS go to the very back of the queue!
        const sortedQueue = [...allList].sort((a, b) => {
            const syncA = Math.max(Number(a.lastSyncedAt) || 0, recentSyncedTimeById.get(a.id) || 0);
            const syncB = Math.max(Number(b.lastSyncedAt) || 0, recentSyncedTimeById.get(b.id) || 0);
            if (syncA !== syncB) return syncA - syncB;
            return String(a.id).localeCompare(String(b.id));
        });

        const batch = sortedQueue.slice(0, batchLimit);

        for (const manga of batch) {
            checkedCount++;
            const nowTs = Date.now();
            recentSyncedTimeById.set(manga.id, nowTs);
            checkedTitles.push(manga.title);

            // Persist lastSyncedAt to DB immediately
            await db.execute({
                sql: 'UPDATE mangas SET lastSyncedAt = ? WHERE id = ?',
                args: [nowTs, manga.id]
            }).catch(() => {});

            try {
                // Fetch existing chapters for this manga first (also helps infer source if manga columns are blank)
                const { rows: existingRows } = await db.execute({
                    sql: 'SELECT id, number, title, mangadexChapterId, mangakatanaChapterUrl, mangafireChapterId, comixChapterUrl, mgekoChapterUrl, fanfoxChapterUrl FROM chapters WHERE mangaId = ?',
                    args: [manga.id]
                });
                const existingChs = Array.isArray(existingRows) ? existingRows : [];

                // Determine source from manga columns, ID prefix, or existing chapter URLs
                let sourceType = '';
                let sourceTarget = '';

                if (manga.fanfoxUrl || manga.fanfoxId || String(manga.id).startsWith('manga-ff-')) {
                    sourceType = 'fanfox';
                    sourceTarget = manga.fanfoxUrl || manga.fanfoxId;
                } else if (manga.mgekoUrl || manga.mgekoId || String(manga.id).startsWith('manga-mg-')) {
                    sourceType = 'mgeko';
                    sourceTarget = manga.mgekoUrl || manga.mgekoId;
                } else if (manga.mangakatanaUrl || manga.mangakatanaId || String(manga.id).startsWith('manga-mk-')) {
                    sourceType = 'mangakatana';
                    sourceTarget = manga.mangakatanaUrl || manga.mangakatanaId;
                } else if (manga.comixUrl || manga.comixId || String(manga.id).startsWith('manga-co-')) {
                    sourceType = 'comix';
                    sourceTarget = manga.comixUrl || manga.comixId;
                } else if (manga.mangafireId || String(manga.id).startsWith('manga-mf-')) {
                    sourceType = 'mangafire';
                    sourceTarget = manga.mangafireId;
                } else if (manga.mangadexId || String(manga.id).startsWith('manga-md-')) {
                    sourceType = 'mangadex';
                    sourceTarget = manga.mangadexId;
                } else {
                    // Infer from existing chapter URLs if manga metadata was saved without source columns
                    const sampleCh = existingChs.find(
                        c => c.fanfoxChapterUrl || c.mgekoChapterUrl || c.mangakatanaChapterUrl || c.comixChapterUrl
                    );
                    if (sampleCh?.fanfoxChapterUrl) {
                        sourceType = 'fanfox';
                        const m = sampleCh.fanfoxChapterUrl.match(/https?:\/\/[^/]+\/manga\/([^/]+)/i);
                        if (m) sourceTarget = `https://fanfox.net/manga/${m[1]}/`;
                    } else if (sampleCh?.mgekoChapterUrl) {
                        sourceType = 'mgeko';
                        const m = sampleCh.mgekoChapterUrl.match(/\/reader\/en\/([^/]+?)-chapter-/i);
                        if (m) sourceTarget = `https://www.mgeko.cc/manga/${m[1]}/`;
                    } else if (sampleCh?.mangakatanaChapterUrl) {
                        sourceType = 'mangakatana';
                        const m = sampleCh.mangakatanaChapterUrl.match(/https?:\/\/[^/]+\/manga\/([^/]+)/i);
                        if (m) sourceTarget = `https://mangakatana.com/manga/${m[1]}`;
                    }
                }

                if (!sourceType || !sourceTarget) {
                    continue;
                }

                let latestChapters = [];
                if (sourceType === 'fanfox') {
                    latestChapters = await fetchFanfoxChapters(sourceTarget);
                } else if (sourceType === 'mgeko') {
                    latestChapters = await fetchMgekoChapters(sourceTarget);
                } else if (sourceType === 'mangakatana') {
                    const targetUrl = String(sourceTarget).startsWith('http')
                        ? sourceTarget
                        : `https://mangakatana.com/manga/${String(sourceTarget).replace(/^\/+/, '')}`;
                    const { html } = await fetchHtmlWithFallback(targetUrl);
                    latestChapters = parseMangaKatanaChaptersHtml(html);
                } else if (sourceType === 'comix') {
                    latestChapters = await fetchComixChapters(sourceTarget);
                } else if (sourceType === 'mangafire') {
                    latestChapters = await fetchMangaFireChapters(sourceTarget, 'en');
                } else if (sourceType === 'mangadex') {
                    latestChapters = await fetchMangaDexLatestChapters(sourceTarget);
                }

                if (!Array.isArray(latestChapters) || latestChapters.length === 0) {
                    await sleep(800);
                    continue;
                }

                // Build comprehensive lookup sets so existing chapters (like Overgeared) are NEVER re-imported
                const existingNumKeys = new Set();
                const existingIds = new Set();
                const existingUrls = new Set();
                const existingTitles = new Set();

                for (const r of existingChs) {
                    if (r.id) existingIds.add(String(r.id).toLowerCase());
                    const nk = normalizeNumKey(r.number);
                    if (nk) existingNumKeys.add(nk);
                    if (r.title) existingTitles.add(String(r.title).trim().toLowerCase());
                    for (const uField of [r.fanfoxChapterUrl, r.mgekoChapterUrl, r.mangakatanaChapterUrl, r.comixChapterUrl]) {
                        if (uField) existingUrls.add(normalizeUrlKey(uField));
                    }
                    if (r.mangadexChapterId) existingIds.add(String(r.mangadexChapterId).toLowerCase());
                    if (r.mangafireChapterId) existingIds.add(String(r.mangafireChapterId).toLowerCase());
                }

                const prefix =
                    sourceType === 'fanfox' ? 'ff'
                    : sourceType === 'mgeko' ? 'mg'
                    : sourceType === 'mangakatana' ? 'mk'
                    : sourceType === 'comix' ? 'co'
                    : sourceType === 'mangafire' ? 'mf'
                    : 'md';

                const newChapters = latestChapters.filter(ch => {
                    const chNum = Number(ch.number);
                    const nk = normalizeNumKey(chNum);
                    if (nk && existingNumKeys.has(nk)) return false;

                    const cleanChKey = (ch.id || `c${chNum}`).toString().replace(/[^a-zA-Z0-9._-]/g, '');
                    const candidateId = `${manga.id}-${prefix}-${cleanChKey}`.toLowerCase();
                    const rawId = `${manga.id}-${prefix}-${ch.id}`.toLowerCase();
                    if (existingIds.has(candidateId) || existingIds.has(rawId)) return false;

                    if (ch.url && existingUrls.has(normalizeUrlKey(ch.url))) return false;
                    if (ch.title && existingTitles.has(String(ch.title).trim().toLowerCase())) return false;

                    return !isNaN(chNum);
                });

                if (newChapters.length > 0) {
                    let seriesChaptersAdded = 0;

                    for (let i = 0; i < newChapters.length; i++) {
                        const ch = newChapters[i];
                        const chNum = Number(ch.number) || (existingChs.length + i + 1);
                        const cleanChKey = (ch.id || `c${chNum}`).toString().replace(/[^a-zA-Z0-9._-]/g, '');
                        const chapterId = `${manga.id}-${prefix}-${cleanChKey}`;

                        // Eagerly pre-fetch all page image URLs for the new chapter
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
                            } else if (sourceType === 'mangadex' && (ch.mangadexChapterId || ch.id)) {
                                pages = await fetchMangaDexChapterPages(ch.mangadexChapterId || ch.id);
                            }
                        } catch (pageErr) {
                            console.error(`[AutoSync] Page scrape warning for ${manga.title} Ch.${chNum}:`, pageErr.message);
                        }

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
                                sourceType === 'mangadex' ? (ch.mangadexChapterId || ch.id || null) : null,
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
                        await sleep(500);
                    }

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

            await sleep(800);
        }

        if (newChaptersAdded > 0) {
            invalidateDbCache();
        }

        lastSyncSummary = {
            lastRunAt: Date.now(),
            durationMs: Date.now() - startedAt,
            checkedCount,
            totalEligible: sortedQueue.length,
            newChaptersAdded,
            checkedTitles,
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
