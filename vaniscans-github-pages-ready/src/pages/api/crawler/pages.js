import {
    parseMangaKatanaPagesHtml,
    parseManhuausPagesHtml,
    fetchHtmlWithFallback,
    fetchMangaFirePages
} from '@/lib/crawler';

const MANGADEX_API = 'https://api.mangadex.org';
const USER_AGENT = 'VaniScans/6.0 (+https://vaniscans.online)';
const NO_STORE_HEADERS = {
    'Cache-Control': 'private, no-store, no-cache, must-revalidate'
};

export async function GET({ request }) {
    const url = new URL(request.url);
    const targetUrlParam = (url.searchParams.get('url') || '').trim();
    const rawSource = url.searchParams.get('source') || 'mangadex';
    const source = targetUrlParam.includes('manhuaus.club') ? 'manhuaus' : rawSource;

    if (source === 'manhuaus') {
        if (!targetUrlParam.startsWith('http')) {
            return Response.json({ error: 'Valid ManhuaUS chapter url required' }, { status: 400, headers: NO_STORE_HEADERS });
        }
        try {
            const { html } = await fetchHtmlWithFallback(targetUrlParam);
            const pages = parseManhuausPagesHtml(html);
            return Response.json({ result: 'ok', pages, pagesSaver: pages }, { headers: NO_STORE_HEADERS });
        } catch (err) {
            return Response.json({ error: err.message, pages: [], pagesSaver: [] }, { status: 500, headers: NO_STORE_HEADERS });
        }
    } else if (source === 'mangafire') {
        const chapterId = (url.searchParams.get('chapterId') || '').trim();
        if (!chapterId) {
            return Response.json({ error: 'Missing chapterId' }, { status: 400, headers: NO_STORE_HEADERS });
        }
        try {
            const pages = await fetchMangaFirePages(chapterId);
            return Response.json({ result: 'ok', pages, pagesSaver: pages }, { headers: NO_STORE_HEADERS });
        } catch (err) {
            return Response.json({ error: err.message, pages: [], pagesSaver: [] }, { status: 500, headers: NO_STORE_HEADERS });
        }
    } else if (source === 'mangakatana') {
        if (!targetUrlParam.startsWith('http')) {
            return Response.json({ error: 'Valid chapter url required' }, { status: 400, headers: NO_STORE_HEADERS });
        }
        try {
            const { html } = await fetchHtmlWithFallback(targetUrlParam);
            const pages = parseMangaKatanaPagesHtml(html);
            return Response.json({ result: 'ok', pages }, { headers: NO_STORE_HEADERS });
        } catch (err) {
            return Response.json({ error: err.message, pages: [] }, { status: 500, headers: NO_STORE_HEADERS });
        }
    } else {
        const chapterId = url.searchParams.get('chapterId');
        if (!chapterId) {
            return Response.json({ error: 'Missing chapterId' }, { status: 400, headers: NO_STORE_HEADERS });
        }
        try {
            const atHomeRes = await fetch(`${MANGADEX_API}/at-home/server/${encodeURIComponent(chapterId)}`, {
                headers: { 'User-Agent': USER_AGENT },
                cache: 'no-store'
            });
            const atHome = await atHomeRes.json();
            if (!atHome || atHome.result === 'error' || !atHome.baseUrl || !atHome.chapter) {
                return Response.json({ pages: [], pagesSaver: [] }, { headers: NO_STORE_HEADERS });
            }
            const baseUrl = atHome.baseUrl;
            const hash = atHome.chapter.hash;
            const dataFiles = atHome.chapter.data || [];
            const saverFiles = atHome.chapter.dataSaver || [];
            const primaryFolder = saverFiles.length > 0 ? 'data-saver' : 'data';
            const primaryFiles = saverFiles.length > 0 ? saverFiles : dataFiles;

            const pages = primaryFiles.map(fileName => `https://uploads.mangadex.org/${primaryFolder}/${hash}/${fileName}`);
            const pagesSaver = primaryFiles.map(fileName => `${baseUrl}/${primaryFolder}/${hash}/${fileName}`);

            return Response.json({ result: 'ok', pages, pagesSaver }, { headers: NO_STORE_HEADERS });
        } catch (err) {
            return Response.json({ error: err.message, pages: [] }, { status: 500, headers: NO_STORE_HEADERS });
        }
    }
}
