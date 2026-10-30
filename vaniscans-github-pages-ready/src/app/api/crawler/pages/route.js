export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { NextResponse } from 'next/server';
import {
    parseMangaKatanaPagesHtml,
    fetchHtmlWithFallback,
    fetchMangaFirePages
} from '@/lib/crawler';

const MANGADEX_API = 'https://api.mangadex.org';
const USER_AGENT = 'VaniScans/5.0 (+https://vaniscans.online)';
const NO_STORE_HEADERS = {
    'Cache-Control': 'private, no-store, no-cache, must-revalidate',
    'Netlify-Vary': 'query'
};

export async function GET(req) {
    const url = new URL(req.url);
    const source = url.searchParams.get('source') || 'mangadex';

    if (source === 'mangafire') {
        const chapterId = (url.searchParams.get('chapterId') || '').trim();
        if (!chapterId) {
            return NextResponse.json({ error: 'Missing chapterId' }, { status: 400, headers: NO_STORE_HEADERS });
        }
        try {
            const pages = await fetchMangaFirePages(chapterId);
            return NextResponse.json({ result: 'ok', pages, pagesSaver: pages }, { headers: NO_STORE_HEADERS });
        } catch (err) {
            return NextResponse.json({ error: err.message, pages: [], pagesSaver: [] }, { status: 500, headers: NO_STORE_HEADERS });
        }
    } else if (source === 'mangakatana') {
        const targetUrl = (url.searchParams.get('url') || '').trim();
        if (!targetUrl.startsWith('http')) {
            return NextResponse.json({ error: 'Valid chapter url required' }, { status: 400, headers: NO_STORE_HEADERS });
        }
        try {
            const { html } = await fetchHtmlWithFallback(targetUrl);
            const pages = parseMangaKatanaPagesHtml(html);
            return NextResponse.json({ result: 'ok', pages }, { headers: NO_STORE_HEADERS });
        } catch (err) {
            return NextResponse.json({ error: err.message, pages: [] }, { status: 500, headers: NO_STORE_HEADERS });
        }
    } else {
        const chapterId = url.searchParams.get('chapterId');
        if (!chapterId) {
            return NextResponse.json({ error: 'Missing chapterId' }, { status: 400, headers: NO_STORE_HEADERS });
        }
        try {
            const atHomeRes = await fetch(`${MANGADEX_API}/at-home/server/${encodeURIComponent(chapterId)}`, {
                headers: { 'User-Agent': USER_AGENT },
                cache: 'no-store'
            });
            const atHome = await atHomeRes.json();
            if (!atHome || atHome.result === 'error' || !atHome.baseUrl || !atHome.chapter) {
                return NextResponse.json({ pages: [], pagesSaver: [] }, { headers: NO_STORE_HEADERS });
            }
            const baseUrl = atHome.baseUrl;
            const hash = atHome.chapter.hash;
            const dataFiles = atHome.chapter.data || [];
            const saverFiles = atHome.chapter.dataSaver || [];
            const primaryFolder = saverFiles.length > 0 ? 'data-saver' : 'data';
            const primaryFiles = saverFiles.length > 0 ? saverFiles : dataFiles;

            const pages = primaryFiles.map(fileName => `https://uploads.mangadex.org/${primaryFolder}/${hash}/${fileName}`);
            const pagesSaver = primaryFiles.map(fileName => `${baseUrl}/${primaryFolder}/${hash}/${fileName}`);

            return NextResponse.json({ result: 'ok', pages, pagesSaver }, { headers: NO_STORE_HEADERS });
        } catch (err) {
            return NextResponse.json({ error: err.message, pages: [] }, { status: 500, headers: NO_STORE_HEADERS });
        }
    }
}
