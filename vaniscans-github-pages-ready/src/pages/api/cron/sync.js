import { getDb, invalidateDbCache } from '@/lib/db';
import {
    fetchFanfoxSearch,
    fetchFanfoxChapters,
    fetchFanfoxPages,
    fetchMgekoSearch,
    fetchMgekoChapters,
    fetchMgekoPages,
    parseMangaKatanaHtmlSearch,
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
const recentSyncedTimeById = new Map();

let lastSyncSummary = {
    lastRunAt: null,
    checkedCount: 0,
    totalEligible: 0,
    newChaptersAdded: 0,
    checkedTitles: [],
    updatedSeries: [],
    diagnostics: [],
    status: 'Idle'
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeTitleMatch(t = '') {
    return (t || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function extractMaxChapterNum(list = []) {
    let max = -1;
    for (const ch of list) {
        const n = Number(ch.number);
        if (!isNaN(n) && n > max) max = n;
        const m = String(ch.title || '').match(/(?:ch(?:apter)?\.?\s*)(\d+(?:\.\d+)?)/i);
        if (m) {
            const tn = parseFloat(m[1]);
            if (!isNaN(tn) && tn > max) max = tn;
        }
    }
    return max;
}

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

async function autoRecoverSourceForManga(manga, existingChs, db) {
    // 1. Check chapter URL columns & first page image URLs
    for (const ch of existingChs) {
        if (ch.fanfoxChapterUrl) {
            const m = ch.fanfoxChapterUrl.match(/https?:\/\/[^/]+\/manga\/([^/]+)/i);
            if (m) return { sourceType: 'fanfox', sourceTarget: `https://fanfox.net/manga/${m[1]}/` };
        }
        if (ch.mgekoChapterUrl) {
            const m = ch.mgekoChapterUrl.match(/\/reader\/en\/([^/]+?)-chapter-/i);
            if (m) return { sourceType: 'mgeko', sourceTarget: `https://www.mgeko.cc/manga/${m[1]}/` };
        }
        if (ch.mangakatanaChapterUrl) {
            const m = ch.mangakatanaChapterUrl.match(/https?:\/\/[^/]+\/manga\/([^/]+)/i);
            if (m) return { sourceType: 'mangakatana', sourceTarget: `https://mangakatana.com/manga/${m[1]}` };
        }
        if (ch.comixChapterUrl) {
            const m = ch.comixChapterUrl.match(/https?:\/\/[^/]+\/comic\/([^/]+)/i);
            if (m) return { sourceType: 'comix', sourceTarget: `https://comix.to/comic/${m[1]}` };
        }
        if (ch.mangadexChapterId && manga.mangadexId) {
            return { sourceType: 'mangadex', sourceTarget: manga.mangadexId };
        }
    }

    // 2. Auto-search by title across Mgeko, MangaKatana, and FanFox and save the URL back to DB!
    const cleanTitle = (manga.title || '').trim();
    if (!cleanTitle) return { sourceType: '', sourceTarget: '' };
    const normTarget = normalizeTitleMatch(cleanTitle);

    // Try Mgeko first
    try {
        const mgResults = await fetchMgekoSearch(cleanTitle);
        const match = mgResults.find(r => normalizeTitleMatch(r.title) === normTarget) || mgResults[0];
        if (match && (match.mgekoUrl || match.mgekoId)) {
            await db.execute({
                sql: 'UPDATE mangas SET mgekoId = ?, mgekoUrl = ? WHERE id = ?',
                args: [match.mgekoId || null, match.mgekoUrl || null, manga.id]
            }).catch(() => {});
            return { sourceType: 'mgeko', sourceTarget: match.mgekoUrl || match.mgekoId };
        }
    } catch (_) {}

    // Try MangaKatana second
    try {
        const mkSearchUrl = `https://mangakatana.com/?search=${encodeURIComponent(cleanTitle)}&search_by=book_name`;
        const { html, finalUrl } = await fetchHtmlWithFallback(mkSearchUrl);
        const mkResults = parseMangaKatanaHtmlSearch(html, finalUrl || mkSearchUrl, cleanTitle);
        const match = mkResults.find(r => normalizeTitleMatch(r.title) === normTarget) || mkResults[0];
        if (match && (match.mangakatanaUrl || match.mangakatanaId)) {
            await db.execute({
                sql: 'UPDATE mangas SET mangakatanaId = ?, mangakatanaUrl = ? WHERE id = ?',
                args: [match.mangakatanaId || null, match.mangakatanaUrl || null, manga.id]
            }).catch(() => {});
            return { sourceType: 'mangakatana', sourceTarget: match.mangakatanaUrl || match.mangakatanaId };
        }
    } catch (_) {}

    // Try FanFox third
    try {
        const ffResults = await fetchFanfoxSearch(cleanTitle);
        const match = ffResults.find(r => normalizeTitleMatch(r.title) === normTarget) || ffResults[0];
        if (match && (match.fanfoxUrl || match.fanfoxId)) {
            await db.execute({
                sql: 'UPDATE mangas SET fanfoxId = ?, fanfoxUrl = ? WHERE id = ?',
                args: [match.fanfoxId || null, match.fanfoxUrl || null, manga.id]
            }).catch(() => {});
            return { sourceType: 'fanfox', sourceTarget: match.fanfoxUrl || match.fanfoxId };
        }
    } catch (_) {}

    return { sourceType: '', sourceTarget: '' };
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
    const diagnostics = [];

    try {
        const db = await getDb();
        await db.execute('ALTER TABLE mangas ADD COLUMN lastSyncedAt INTEGER DEFAULT 0').catch(() => {});

        const { rows: allMangas } = await db.execute(
            `SELECT * FROM mangas WHERE status IS NULL OR LOWER(status) != 'completed'`
        );
        const allList = Array.isArray(allMangas) ? allMangas : [];

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

            await db.execute({
                sql: 'UPDATE mangas SET lastSyncedAt = ? WHERE id = ?',
                args: [nowTs, manga.id]
            }).catch(() => {});

            try {
                const { rows: existingRows } = await db.execute({
                    sql: 'SELECT id, number, title, mangadexChapterId, mangakatanaChapterUrl, mangafireChapterId, comixChapterUrl, mgekoChapterUrl, fanfoxChapterUrl FROM chapters WHERE mangaId = ?',
                    args: [manga.id]
                });
                const existingChs = Array.isArray(existingRows) ? existingRows : [];

                let sourceType = '';
                let sourceTarget = '';

                if (manga.fanfoxUrl || manga.fanfoxId) {
                    sourceType = 'fanfox';
                    sourceTarget = manga.fanfoxUrl || manga.fanfoxId;
                } else if (manga.mgekoUrl || manga.mgekoId) {
                    sourceType = 'mgeko';
                    sourceTarget = manga.mgekoUrl || manga.mgekoId;
                } else if (manga.mangakatanaUrl || manga.mangakatanaId) {
                    sourceType = 'mangakatana';
                    sourceTarget = manga.mangakatanaUrl || manga.mangakatanaId;
                } else if (manga.comixUrl || manga.comixId) {
                    sourceType = 'comix';
                    sourceTarget = manga.comixUrl || manga.comixId;
                } else if (manga.mangafireId) {
                    sourceType = 'mangafire';
                    sourceTarget = manga.mangafireId;
                } else if (manga.mangadexId) {
                    sourceType = 'mangadex';
                    sourceTarget = manga.mangadexId;
                } else {
                    const recovered = await autoRecoverSourceForManga(manga, existingChs, db);
                    sourceType = recovered.sourceType;
                    sourceTarget = recovered.sourceTarget;
                }

                if (!sourceType || !sourceTarget) {
                    diagnostics.push({ id: manga.id, title: manga.title, status: 'No source URL found' });
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

                const maxExistingNum = extractMaxChapterNum(existingChs);

                if (!Array.isArray(latestChapters) || latestChapters.length === 0) {
                    diagnostics.push({
                        id: manga.id,
                        title: manga.title,
                        source: sourceType,
                        sourceTarget,
                        dbMaxCh: maxExistingNum,
                        remoteCount: 0,
                        status: '0 chapters returned by upstream'
                    });
                    await sleep(600);
                    continue;
                }

                const existingNums = new Set(existingChs.map(c => Math.round(Number(c.number) * 1000) / 1000));

                const newChapters = latestChapters.filter(ch => {
                    const chNum = Math.round(Number(ch.number) * 1000) / 1000;
                    if (isNaN(chNum)) return false;
                    if (existingNums.has(chNum)) return false;
                    return chNum > maxExistingNum;
                });

                diagnostics.push({
                    id: manga.id,
                    title: manga.title,
                    source: sourceType,
                    sourceTarget,
                    dbMaxCh: maxExistingNum,
                    remoteCount: latestChapters.length,
                    newFound: newChapters.length
                });

                if (newChapters.length > 0) {
                    const prefix =
                        sourceType === 'fanfox' ? 'ff'
                        : sourceType === 'mgeko' ? 'mg'
                        : sourceType === 'mangakatana' ? 'mk'
                        : sourceType === 'comix' ? 'co'
                        : sourceType === 'mangafire' ? 'mf'
                        : 'md';

                    let seriesChaptersAdded = 0;

                    for (let i = 0; i < newChapters.length; i++) {
                        const ch = newChapters[i];
                        const chNum = Number(ch.number);
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
                            } else if (sourceType === 'mangadex' && (ch.mangadexChapterId || ch.id)) {
                                pages = await fetchMangaDexChapterPages(ch.mangadexChapterId || ch.id);
                            }
                        } catch (_) {}

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
                        await sleep(400);
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
                diagnostics.push({ id: manga.id, title: manga.title, error: err.message });
            }

            await sleep(600);
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
            diagnostics,
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
        return Response.json({ ok: true, isSyncRunning, ...lastSyncSummary });
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
            message: `Keep-alive ping received! Triggered rolling auto-sync for next ${limitParam} manga in background.`,
            isSyncRunning: true,
            lastSyncSummary
        });
    }

    const result = await runBatchSync(limitParam);
    return Response.json(result);
}
