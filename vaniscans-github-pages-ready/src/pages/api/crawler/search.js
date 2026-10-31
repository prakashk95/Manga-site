import {
    parseMangaKatanaHtmlSearch,
    fetchHtmlWithFallback,
    formatMangaDexSearchData,
    fetchMangaFireSearch
} from '@/lib/crawler';

const MANGADEX_API = 'https://api.mangadex.org';
const USER_AGENT = 'VaniScans/6.0 (+https://vaniscans.online)';

export async function GET({ request }) {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    const source = url.searchParams.get('source') || 'mangadex';

    if (source === 'mangafire') {
        try {
            const results = await fetchMangaFireSearch(q);
            return Response.json({ result: 'ok', data: results });
        } catch (err) {
            return Response.json({ error: err.message, data: [] }, { status: 500 });
        }
    } else if (source === 'mangakatana') {
        try {
            let targetUrl = 'https://mangakatana.com/manga';
            if (q.startsWith('http') && q.includes('mangakatana.com/manga/')) {
                targetUrl = q;
            } else if (q) {
                targetUrl = `https://mangakatana.com/?search=${encodeURIComponent(q)}&search_by=book_name`;
            }
            const { html, finalUrl } = await fetchHtmlWithFallback(targetUrl);
            const results = parseMangaKatanaHtmlSearch(html, finalUrl || targetUrl, q);
            return Response.json({ result: 'ok', data: results });
        } catch (err) {
            return Response.json({ error: err.message, data: [] }, { status: 500 });
        }
    } else {
        try {
            const limit = Math.min(parseInt(url.searchParams.get('limit') || '24', 10), 50);
            const params = new URLSearchParams();
            params.append('limit', String(limit));
            params.append('includes[]', 'cover_art');
            params.append('includes[]', 'author');
            params.append('includes[]', 'artist');
            params.append('contentRating[]', 'safe');
            params.append('contentRating[]', 'suggestive');
            params.append('contentRating[]', 'erotica');
            params.append('hasAvailableChapters', 'true');

            const uuidMatch = q.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
            let targetUrl = '';
            if (uuidMatch) {
                params.delete('limit');
                params.append('ids[]', uuidMatch[0]);
                targetUrl = `${MANGADEX_API}/manga?${params.toString()}`;
            } else if (q) {
                params.append('title', q);
                params.append('order[relevance]', 'desc');
                targetUrl = `${MANGADEX_API}/manga?${params.toString()}`;
            } else {
                params.append('order[followedCount]', 'desc');
                targetUrl = `${MANGADEX_API}/manga?${params.toString()}`;
            }

            const res = await fetch(targetUrl, { headers: { 'User-Agent': USER_AGENT } });
            const json = await res.json();
            const rawList = Array.isArray(json?.data) ? json.data : [];
            const formatted = await formatMangaDexSearchData(rawList);
            return Response.json({ result: 'ok', data: formatted });
        } catch (err) {
            return Response.json({ error: err.message, data: [] }, { status: 500 });
        }
    }
}
