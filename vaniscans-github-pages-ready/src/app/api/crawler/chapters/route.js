export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { NextResponse } from 'next/server';
import {
    parseMangaKatanaChaptersHtml,
    fetchHtmlWithFallback,
    fetchMangaFireChapters
} from '@/lib/crawler';

const MANGADEX_API = 'https://api.mangadex.org';
const USER_AGENT = 'VaniScans/5.0 (+https://vaniscans.online)';

async function fetchMangaDexFeedChapters(mangaId, lang) {
    const collected = [];
    const seen = new Set();
    let offset = 0;
    const pageSize = 100;

    while (collected.length < 1500) {
        const params = new URLSearchParams();
        params.append('limit', String(pageSize));
        params.append('offset', String(offset));
        if (lang && lang !== 'all') params.append('translatedLanguage[]', lang);
        params.append('includes[]', 'scanlation_group');
        params.append('order[chapter]', 'asc');
        params.append('order[volume]', 'asc');
        params.append('contentRating[]', 'safe');
        params.append('contentRating[]', 'suggestive');
        params.append('contentRating[]', 'erotica');
        params.append('includeEmptyPages', '0');
        params.append('includeExternalUrl', '0');
        params.append('includeFutureUpdates', '0');

        const feedUrl = `${MANGADEX_API}/manga/${encodeURIComponent(mangaId)}/feed?${params.toString()}`;
        const res = await fetch(feedUrl, { headers: { 'User-Agent': USER_AGENT } });
        const json = await res.json();
        const batch = Array.isArray(json?.data) ? json.data : [];
        if (batch.length === 0) break;

        for (const chObj of batch) {
            const attr = chObj.attributes || {};
            if (attr.externalUrl) continue;
            if (typeof attr.pages === 'number' && attr.pages <= 0) continue;

            const chNumKey = attr.chapter ? String(attr.chapter).trim() : `oneshot-${chObj.id}`;
            if (seen.has(chNumKey)) continue;
            seen.add(chNumKey);

            const chNum = attr.chapter ? parseFloat(attr.chapter) : (collected.length + 1);
            const langBadge = lang === 'all' && attr.translatedLanguage ? ` [${attr.translatedLanguage.toUpperCase()}]` : '';
            const chLabel = attr.chapter ? `Chapter ${attr.chapter}${langBadge}` : `Chapter ${collected.length + 1}${langBadge}`;
            const chTitle = attr.title ? `${chLabel} - ${attr.title}` : chLabel;

            collected.push({
                id: chObj.id,
                mangadexChapterId: chObj.id,
                title: chTitle,
                number: isNaN(chNum) ? (collected.length + 1) : chNum,
                publishAt: attr.publishAt || null
            });
        }
        offset += batch.length;
        if (batch.length < pageSize || offset >= (json.total || 0) || offset >= 5000) break;
    }

    return collected;
}

export async function GET(req) {
    const url = new URL(req.url);
    const source = url.searchParams.get('source') || 'mangadex';

    if (source === 'mangafire') {
        const mangaId = (url.searchParams.get('mangaId') || '').trim();
        const lang = url.searchParams.get('lang') || 'en';
        if (!mangaId) return NextResponse.json({ error: 'Missing mangaId', data: [] }, { status: 400 });
        try {
            const chapters = await fetchMangaFireChapters(mangaId, lang);
            return NextResponse.json({ result: 'ok', data: chapters });
        } catch (err) {
            return NextResponse.json({ error: err.message, data: [] }, { status: 500 });
        }
    } else if (source === 'mangakatana') {
        const rawUrl = (url.searchParams.get('url') || url.searchParams.get('slug') || '').trim();
        const targetUrl = rawUrl.startsWith('http') ? rawUrl : `https://mangakatana.com/manga/${rawUrl.replace(/^\/+/, '')}`;
        try {
            const { html } = await fetchHtmlWithFallback(targetUrl);
            const chapters = parseMangaKatanaChaptersHtml(html);
            return NextResponse.json({ result: 'ok', data: chapters });
        } catch (err) {
            return NextResponse.json({ error: err.message, data: [] }, { status: 500 });
        }
    } else {
        const mangaId = url.searchParams.get('mangaId');
        const lang = url.searchParams.get('lang') || 'en';
        if (!mangaId) return NextResponse.json({ error: 'Missing mangaId', data: [] }, { status: 400 });

        try {
            let chapters = await fetchMangaDexFeedChapters(mangaId, lang);
            if (chapters.length === 0 && lang !== 'all') {
                chapters = await fetchMangaDexFeedChapters(mangaId, 'all');
            }
            return NextResponse.json({ result: 'ok', data: chapters });
        } catch (err) {
            return NextResponse.json({ error: err.message, data: [] }, { status: 500 });
        }
    }
}
