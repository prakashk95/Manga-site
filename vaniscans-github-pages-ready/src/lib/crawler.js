const USER_AGENT = 'VaniScans/5.0 (+https://vaniscans.online)';
const MANGAKATANA_BASE = 'https://mangakatana.com';
const MANGAFIRE_BASE = 'https://mangafire.to';

export const MK_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://mangakatana.com/'
};

export const MF_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://mangafire.to/'
};

export function stripHtmlTags(str) {
    return (str || '')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

export async function formatMangaDexSearchData(rawList = []) {
    const results = [];
    for (const manga of rawList) {
        const attr = manga.attributes || {};
        const rels = manga.relationships || [];

        const titleObj = attr.title || {};
        const altTitles = attr.altTitles || [];
        let title = titleObj.en || titleObj['ja-ro'] || titleObj['ko-ro'] || Object.values(titleObj)[0];
        if (!title) {
            const enAlt = altTitles.find(t => t.en)?.en;
            if (enAlt) title = enAlt;
        }
        title = title || 'Untitled MangaDex Series';

        const authors = rels
            .filter(r => (r.type === 'author' || r.type === 'artist') && r.attributes?.name)
            .map(r => r.attributes.name);
        const uniqueAuthors = [...new Set(authors)].join(', ') || 'MangaDex Creator';

        const coverRel = rels.find(r => r.type === 'cover_art');
        let coverFileName = coverRel?.attributes?.fileName || null;

        if (!coverFileName && coverRel?.id) {
            try {
                const cRes = await fetch(`https://api.mangadex.org/cover/${coverRel.id}`, {
                    headers: { 'User-Agent': USER_AGENT }
                });
                if (cRes.ok) {
                    const cJson = await cRes.json();
                    coverFileName = cJson?.data?.attributes?.fileName || null;
                }
            } catch (_) {}
        }

        const directCoverUrl = coverFileName
            ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}.512.jpg`
            : 'https://placehold.co/400x600/1a1d30/a855f7?text=MangaDex';

        const tags = (attr.tags || [])
            .map(t => t.attributes?.name?.en)
            .filter(Boolean)
            .slice(0, 4);

        const descObj = attr.description || {};
        const synopsis = descObj.en || Object.values(descObj)[0] || 'Imported directly from MangaDex.org.';

        results.push({
            mangadexId: manga.id,
            sourceHost: 'mangadex.org',
            title,
            author: uniqueAuthors,
            cover: directCoverUrl,
            genres: tags.length > 0 ? tags : ['Action', 'Manga'],
            status: attr.status === 'completed' ? 'Completed' : 'Ongoing',
            rating: '9.6',
            lastChapter: attr.lastChapter || null,
            synopsis
        });
    }
    return results;
}

export function parseMangaKatanaHtmlSearch(html, finalUrl = '', fallbackQuery = '') {
    const results = [];
    if (html.includes('id="single_book"') || html.includes("id='single_book'")) {
        const titleMatch = html.match(/<h1[^>]*class="[^"]*heading[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
        const coverMatch = html.match(/<div[^>]*class="[^"]*div_cover[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i) ||
                           html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
        const ogUrlMatch = html.match(/<meta[^>]+property="og:url"[^>]+content="([^"]+)"/i);
        const authorMatch = html.match(/<div[^>]*class="[^"]*author[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const statusMatch = html.match(/<div[^>]*class="[^"]*status[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const summaryMatch = html.match(/<div[^>]*class="[^"]*summary[^"]*"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/i);
        const genresBlock = html.match(/<div[^>]*class="[^"]*genres[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

        const genres = [];
        if (genresBlock) {
            const gRegex = /<a[^>]*>([^<]+)<\/a>/gi;
            let gm;
            while ((gm = gRegex.exec(genresBlock[1])) !== null) {
                genres.push(stripHtmlTags(gm[1]));
            }
        }

        const mangaUrl = ogUrlMatch ? ogUrlMatch[1].trim() : (finalUrl && finalUrl.includes('/manga/') ? finalUrl : '');
        const slug = mangaUrl.split('/manga/')[1]?.replace(/\/+$/, '') || ('mk-' + Date.now());

        results.push({
            mangakatanaId: slug,
            mangakatanaUrl: mangaUrl || `${MANGAKATANA_BASE}/manga/${slug}`,
            sourceHost: 'mangakatana.com',
            title: titleMatch ? stripHtmlTags(titleMatch[1]) : (fallbackQuery || 'MangaKatana Series'),
            author: authorMatch ? stripHtmlTags(authorMatch[1]) : 'MangaKatana Creator',
            cover: coverMatch ? coverMatch[1].trim() : 'https://placehold.co/400x600/1a1d30/a855f7?text=MangaKatana',
            genres: genres.length > 0 ? genres.slice(0, 4) : ['Action', 'Manga'],
            status: statusMatch && /completed/i.test(statusMatch[1]) ? 'Completed' : 'Ongoing',
            rating: '9.6',
            synopsis: summaryMatch ? stripHtmlTags(summaryMatch[1]) : 'Imported directly from MangaKatana.com.'
        });
        return results;
    }

    const itemSplit = html.split(/<div[^>]+class="[^"]*\bitem\b[^"]*"[^>]+data-id="/i);
    for (let i = 1; i < itemSplit.length; i++) {
        const block = itemSplit[i];
        const titleLink = block.match(/<h3[^>]*class="[^"]*title[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        if (!titleLink) continue;

        const mangaUrl = titleLink[1].trim();
        const title = stripHtmlTags(titleLink[2]);
        const slug = mangaUrl.split('/manga/')[1]?.replace(/\/+$/, '') || '';
        if (!slug) continue;

        const imgMatch = block.match(/<div[^>]*class="[^"]*wrap_img[^"]*"[\s\S]*?<img[^>]+src="([^"]+)"/i) ||
                         block.match(/<img[^>]+src="([^"]+)"/i);
        const statusMatch = block.match(/<span[^>]*class="[^"]*status[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
        const summaryMatch = block.match(/<div[^>]*class="[^"]*summary[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const genresBlock = block.match(/<div[^>]*class="[^"]*genres[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

        const genres = [];
        if (genresBlock) {
            const gRegex = /<a[^>]*>([^<]+)<\/a>/gi;
            let gm;
            while ((gm = gRegex.exec(genresBlock[1])) !== null) {
                genres.push(stripHtmlTags(gm[1]));
            }
        }

        results.push({
            mangakatanaId: slug,
            mangakatanaUrl: mangaUrl.startsWith('http') ? mangaUrl : `${MANGAKATANA_BASE}${mangaUrl}`,
            sourceHost: 'mangakatana.com',
            title: title || slug,
            author: 'MangaKatana Creator',
            cover: imgMatch ? imgMatch[1].trim() : 'https://placehold.co/400x600/1a1d30/a855f7?text=MangaKatana',
            genres: genres.length > 0 ? genres.slice(0, 4) : ['Action', 'Manga'],
            status: statusMatch && /completed/i.test(statusMatch[1]) ? 'Completed' : 'Ongoing',
            rating: '9.6',
            synopsis: summaryMatch ? stripHtmlTags(summaryMatch[1]) : 'Imported directly from MangaKatana.com.'
        });
    }

    return results;
}

export function parseMangaKatanaChaptersHtml(html) {
    const rawChapters = [];
    const seenUrls = new Set();
    const rowRegex = /<div[^>]*class="[^"]*\bchapter\b[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = rowRegex.exec(html)) !== null) {
        const chUrl = match[1].trim();
        if (!chUrl || seenUrls.has(chUrl)) continue;
        seenUrls.add(chUrl);

        const rawTitle = stripHtmlTags(match[2]);
        const chSlug = chUrl.split('/').filter(Boolean).pop() || '';
        const numFromSlug = chSlug.match(/^c(\d+(\.\d+)?)$/i) || chSlug.match(/c(\d+(\.\d+)?)/i);
        const numFromTitle = rawTitle.match(/chapter\s*(\d+(\.\d+)?)/i) || rawTitle.match(/^(\d+(\.\d+)?)/);
        const parsedNum = numFromSlug ? parseFloat(numFromSlug[1]) : (numFromTitle ? parseFloat(numFromTitle[1]) : null);

        rawChapters.push({
            id: chSlug || `ch-${rawChapters.length + 1}`,
            url: chUrl.startsWith('http') ? chUrl : `${MANGAKATANA_BASE}${chUrl}`,
            title: rawTitle,
            parsedNum
        });
    }

    rawChapters.reverse();
    const finalChapters = [];
    const seenNumbers = new Set();

    for (let idx = 0; idx < rawChapters.length; idx++) {
        const ch = rawChapters[idx];
        const num = (typeof ch.parsedNum === 'number' && !isNaN(ch.parsedNum)) ? ch.parsedNum : (finalChapters.length + 1);
        if (seenNumbers.has(num)) continue;
        seenNumbers.add(num);

        finalChapters.push({
            id: ch.id,
            url: ch.url,
            title: ch.title || `Chapter ${num}`,
            number: num,
            seqIndex: finalChapters.length + 1
        });
    }

    return finalChapters;
}

export function parseMangaKatanaPagesHtml(html) {
    const scriptArrayRegex = /(?:var|let|const)\s+([a-zA-Z0-9_]+)\s*=\s*\[\s*(['"]https?:\/\/[\s\S]*?)\s*\];/g;
    let bestPages = [];
    let match;

    while ((match = scriptArrayRegex.exec(html)) !== null) {
        const varName = match[1];
        const rawList = match[2];
        const urls = rawList
            .split(',')
            .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
            .filter(u => /^https?:\/\/.+/i.test(u) && !u.includes('logo') && !u.includes('avatar') && !u.includes('banner'));

        if (urls.length > bestPages.length || varName === 'thzq' || varName === 'ytaw') {
            if (urls.length > 0) {
                bestPages = urls;
                if (varName === 'thzq' && urls.length >= 1) break;
            }
        }
    }

    if (bestPages.length > 0) return bestPages;

    const dataSrcRegex = /<div[^>]*id="imgs"[\s\S]*$/i;
    const imgsSection = html.match(dataSrcRegex)?.[0] || html;
    const imgTagRegex = /(?:data-src|src)=["'](https?:\/\/[^"']+)["']/gi;
    const fallbackUrls = [];
    while ((match = imgTagRegex.exec(imgsSection)) !== null) {
        const u = match[1].trim();
        if (!u.includes('logo') && !u.includes('avatar') && !u.includes('banner') && !u.includes('loading')) {
            fallbackUrls.push(u);
        }
    }
    return fallbackUrls;
}

export async function fetchHtmlWithFallback(targetUrl) {
    // 1. Direct server-side fetch (only works inside Node serverless runtime)
    if (typeof window === 'undefined') {
        try {
            const directRes = await fetch(targetUrl, {
                headers: targetUrl.includes('mangafire.to') ? MF_HEADERS : MK_HEADERS,
                redirect: 'follow',
                cache: 'no-store',
                signal: AbortSignal.timeout(7000)
            });
            if (directRes.ok) {
                const html = await directRes.text();
                if (html && html.length > 300 && !html.includes('Just a moment...')) {
                    return { html, finalUrl: directRes.url || targetUrl };
                }
            }
        } catch (_) {}
    }

    // 2. Fallback proxy relays
    const fetchCandidate = async (url, unwrapJson = false) => {
        const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8500) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        if (unwrapJson) {
            const j = await res.json();
            if (j && typeof j.contents === 'string' && j.contents.length > 150 && !j.contents.includes('Just a moment...')) {
                return { html: j.contents, finalUrl: j.status?.url || targetUrl };
            }
            throw new Error('Empty or challenged contents');
        }
        const text = await res.text();
        if (text && text.length > 150 && !text.includes('Just a moment...')) {
            return { html: text, finalUrl: targetUrl };
        }
        throw new Error('Empty or challenged html');
    };

    return await Promise.any([
        fetchCandidate(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`, false),
        fetchCandidate(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, false),
        fetchCandidate(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`, true),
        fetchCandidate(`https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`, false)
    ]);
}

export function parseMangaFireHtmlSearch(html) {
    const results = [];
    const seenIds = new Set();
    const unitSplit = html.split(/<div[^>]+class="[^"]*\bunit\b[^"]*"/i);

    for (let i = 1; i < unitSplit.length; i++) {
        const block = unitSplit[i];
        const hrefMatch = block.match(/<a[^>]+href="\/manga\/([^"?#]+)"/i);
        if (!hrefMatch) continue;

        const slugWithId = hrefMatch[1].trim().replace(/^\/+|\/+$/g, '');
        if (!slugWithId || seenIds.has(slugWithId)) continue;
        seenIds.add(slugWithId);

        const imgMatch = block.match(/<img[^>]+src="([^"]+)"/i);
        const infoLinkMatches = [...block.matchAll(/<a[^>]+href="\/manga\/[^"]+"[^>]*>([\s\S]*?)<\/a>/gi)];
        let title = '';
        for (const m of infoLinkMatches) {
            const cleaned = stripHtmlTags(m[1]);
            if (cleaned && !/^(chap|vol)\b/i.test(cleaned)) {
                title = cleaned;
                break;
            }
        }
        if (!title) {
            title = slugWithId.split('.')[0].replace(/-/g, ' ');
        }

        const genreMatches = [...block.matchAll(/<a[^>]+href="\/genre\/[^"]+"[^>]*>([\s\S]*?)<\/a>/gi)];
        const genres = genreMatches.map(m => stripHtmlTags(m[1])).filter(Boolean).slice(0, 4);

        results.push({
            mangafireId: slugWithId,
            sourceHost: 'mangafire',
            title,
            author: 'MangaFire',
            cover: imgMatch ? imgMatch[1].trim() : 'https://placehold.co/400x600/1a1d30/f97316?text=MangaFire',
            genres: genres.length > 0 ? genres : ['Action', 'Manga'],
            status: 'Ongoing',
            rating: '9.6',
            synopsis: `Imported from MangaFire (${slugWithId}).`
        });
    }
    return results;
}

export const MANGAFIRE_API_BASE =
    process.env.NEXT_PUBLIC_MANGAFIRE_API_URL ||
    process.env.MANGAFIRE_API_URL ||
    '';

async function queryMangaDexList(cleanQuery = '', limit = 24) {
    const params = new URLSearchParams();
    params.append('limit', String(limit));
    params.append('includes[]', 'cover_art');
    params.append('includes[]', 'author');
    params.append('includes[]', 'artist');
    params.append('contentRating[]', 'safe');
    params.append('contentRating[]', 'suggestive');
    params.append('contentRating[]', 'erotica');
    params.append('hasAvailableChapters', 'true');

    if (cleanQuery) {
        params.append('title', cleanQuery);
        params.append('order[relevance]', 'desc');
    } else {
        params.append('order[followedCount]', 'desc');
    }

    const mdUrl = `https://api.mangadex.org/manga?${params.toString()}`;
    const res = await fetch(mdUrl, {
        headers: typeof window === 'undefined' ? { 'User-Agent': USER_AGENT } : {},
        cache: 'no-store',
        signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return Array.isArray(json?.data) ? json.data : [];
}

export async function fetchMangaFireSearch(query = '', page = 1) {
    const cleanQuery = (query || '').trim();

    if (MANGAFIRE_API_BASE && (!MANGAFIRE_API_BASE.includes('localhost') || process.env.NODE_ENV === 'development')) {
        try {
            const baseUrl = MANGAFIRE_API_BASE.replace(/\/+$/, '');
            const endpoint = cleanQuery
                ? `${baseUrl}/search/${encodeURIComponent(cleanQuery)}?page=${page}`
                : `${baseUrl}/updated?page=${page}`;
            const res = await fetch(endpoint, {
                headers: { 'Accept': 'application/json' },
                cache: 'no-store',
                signal: AbortSignal.timeout(5000)
            });
            if (res.ok) {
                const json = await res.json();
                const rawItems = Array.isArray(json)
                    ? json
                    : Array.isArray(json?.data)
                    ? json.data
                    : Array.isArray(json?.results)
                    ? json.results
                    : [];
                if (rawItems.length > 0) {
                    return rawItems.map((item, idx) => {
                        const rawId = (item.id || item.slug || item.url || `mf-${idx}`)
                            .toString()
                            .replace(/^\/?manga\//i, '')
                            .replace(/^\/+|\/+$/g, '');
                        return {
                            mangafireId: rawId,
                            sourceHost: 'mangafire',
                            title: item.title || item.name || rawId,
                            author: item.author || 'MangaFire Creator',
                            cover: item.image || item.cover || item.poster || 'https://placehold.co/400x600/1a1d30/f97316?text=MangaFire',
                            genres: Array.isArray(item.genres) && item.genres.length > 0 ? item.genres.slice(0, 4) : ['Action', 'Manga'],
                            status: item.status && /completed/i.test(item.status) ? 'Completed' : 'Ongoing',
                            rating: item.rating || '9.6',
                            synopsis: item.description || item.synopsis || 'Imported via MangaFire.'
                        };
                    });
                }
            }
        } catch (_) {}
    }

    try {
        const mfUrl = cleanQuery
            ? `${MANGAFIRE_BASE}/filter?keyword=${encodeURIComponent(cleanQuery)}&page=${page}`
            : `${MANGAFIRE_BASE}/updated?page=${page}`;
        const { html } = await fetchHtmlWithFallback(mfUrl);
        const parsed = parseMangaFireHtmlSearch(html);
        if (parsed.length > 0) return parsed;
    } catch (_) {}

    // Fallback 1: MangaKatana search tagged as MangaFire (full chapters for licensed series like Jujutsu Kaisen / One Piece)
    try {
        const mkUrl = cleanQuery
            ? `https://mangakatana.com/?search=${encodeURIComponent(cleanQuery)}&search_by=book_name`
            : `https://mangakatana.com/manga`;
        const { html, finalUrl } = await fetchHtmlWithFallback(mkUrl);
        const mkParsed = parseMangaKatanaHtmlSearch(html, finalUrl || mkUrl, cleanQuery);
        if (mkParsed.length > 0) {
            return mkParsed.map(item => ({
                ...item,
                mangafireId: `mk:${item.mangakatanaId}`,
                sourceHost: 'mangafire'
            }));
        }
    } catch (_) {}

    // Fallback 2: MangaDex API
    try {
        const rawList = await queryMangaDexList(cleanQuery, 24);
        const formatted = await formatMangaDexSearchData(rawList);
        return formatted.map(item => ({
            ...item,
            mangafireId: `md:${item.mangadexId}`,
            sourceHost: 'mangafire'
        }));
    } catch (_) {
        return [];
    }
}

async function fetchMangaDexChaptersFast(mdId, lang = 'en') {
    const collected = [];
    const seen = new Set();
    let offset = 0;
    const pageSize = 100;

    // Limit to max 5 pages (500 chapters) with 6s timeout per request so Netlify never times out!
    while (collected.length < 500 && offset < 500) {
        const params = new URLSearchParams();
        params.append('limit', String(pageSize));
        params.append('offset', String(offset));
        if (lang && lang !== 'all') params.append('translatedLanguage[]', lang);
        params.append('order[chapter]', 'asc');
        params.append('order[volume]', 'asc');
        params.append('contentRating[]', 'safe');
        params.append('contentRating[]', 'suggestive');
        params.append('contentRating[]', 'erotica');
        params.append('includeEmptyPages', '0');
        params.append('includeExternalUrl', '0');

        const feedUrl = `https://api.mangadex.org/manga/${encodeURIComponent(mdId)}/feed?${params.toString()}`;
        const res = await fetch(feedUrl, {
            headers: typeof window === 'undefined' ? { 'User-Agent': USER_AGENT } : {},
            cache: 'no-store',
            signal: AbortSignal.timeout(6500)
        });
        if (!res.ok) break;
        const json = await res.json();
        const batch = Array.isArray(json?.data) ? json.data : [];
        if (batch.length === 0) break;

        for (const chObj of batch) {
            const attr = chObj.attributes || {};
            if (attr.externalUrl || (typeof attr.pages === 'number' && attr.pages <= 0)) continue;
            const chNumKey = attr.chapter ? String(attr.chapter).trim() : `oneshot-${chObj.id}`;
            if (seen.has(chNumKey)) continue;
            seen.add(chNumKey);

            const chNum = attr.chapter ? parseFloat(attr.chapter) : (collected.length + 1);
            const chLabel = attr.chapter ? `Chapter ${attr.chapter}` : `Chapter ${collected.length + 1}`;
            const chTitle = attr.title ? `${chLabel} - ${attr.title}` : chLabel;

            collected.push({
                id: `md:${chObj.id}`,
                mangafireChapterId: `md:${chObj.id}`,
                mangadexChapterId: chObj.id,
                title: chTitle,
                number: isNaN(chNum) ? (collected.length + 1) : chNum
            });
        }
        offset += batch.length;
        if (batch.length < pageSize || offset >= (json.total || 0)) break;
    }
    return collected;
}

export async function fetchMangaFireChapters(mangaId, lang = 'en') {
    const rawId = (mangaId || '').toString().trim();
    const targetLang = lang === 'all' ? 'en' : (lang || 'en');

    // 1. Handle MangaKatana-backed MangaFire IDs (`mk:...`)
    if (rawId.startsWith('mk:')) {
        const mkSlug = rawId.replace(/^mk:/, '').replace(/^\/+/, '');
        const mkUrl = mkSlug.startsWith('http') ? mkSlug : `${MANGAKATANA_BASE}/manga/${mkSlug}`;
        const { html } = await fetchHtmlWithFallback(mkUrl);
        const mkChs = parseMangaKatanaChaptersHtml(html);
        return mkChs.map(c => ({
            ...c,
            id: `mk:${c.url}`,
            mangafireChapterId: `mk:${c.url}`,
            mangakatanaChapterUrl: c.url
        }));
    }

    // 2. Handle MangaDex-backed MangaFire IDs (`md:...`)
    if (rawId.startsWith('md:') || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId)) {
        const mdId = rawId.replace(/^md:/, '');
        let chs = await fetchMangaDexChaptersFast(mdId, lang);
        if (chs.length === 0 && lang !== 'all') {
            chs = await fetchMangaDexChaptersFast(mdId, 'all');
        }
        if (chs.length > 0) return chs;
    }

    // 3. Try custom MANGAFIRE_API_BASE if configured
    if (MANGAFIRE_API_BASE && (!MANGAFIRE_API_BASE.includes('localhost') || process.env.NODE_ENV === 'development')) {
        try {
            const baseUrl = MANGAFIRE_API_BASE.replace(/\/+$/, '');
            const cleanId = rawId.replace(/^https?:\/\/[^/]+\/manga\//i, '').replace(/^\/+|\/+$/g, '');
            const endpoint = `${baseUrl}/manga/${encodeURIComponent(cleanId)}/chapters/${encodeURIComponent(targetLang)}`;
            const res = await fetch(endpoint, {
                headers: { 'Accept': 'application/json' },
                cache: 'no-store',
                signal: AbortSignal.timeout(6000)
            });
            if (res.ok) {
                const json = await res.json();
                const rawList = Array.isArray(json) ? json : (json?.chapters || json?.data || []);
                if (rawList.length > 0) {
                    return rawList.map((ch, idx) => {
                        const chId = (ch.id || ch.chapterId || ch.url || `ch-${idx + 1}`).toString();
                        const rawTitle = ch.title || ch.name || `Chapter ${ch.number || idx + 1}`;
                        const numMatch = (ch.number !== undefined ? String(ch.number) : rawTitle).match(/(\d+(\.\d+)?)/);
                        return {
                            id: chId,
                            mangafireChapterId: chId,
                            title: rawTitle,
                            number: numMatch ? parseFloat(numMatch[1]) : idx + 1
                        };
                    }).sort((a, b) => (a.number || 0) - (b.number || 0));
                }
            }
        } catch (_) {}
    }

    // 4. Try MangaFire AJAX chapter list endpoint (/ajax/manga/{shortId}/chapter/{lang})
    const shortId = rawId.includes('.') ? rawId.split('.').pop() : rawId;
    try {
        const ajaxUrl = `${MANGAFIRE_BASE}/ajax/manga/${encodeURIComponent(shortId)}/chapter/${encodeURIComponent(targetLang)}`;
        const { html: rawAjax } = await fetchHtmlWithFallback(ajaxUrl);
        let htmlContent = rawAjax;
        try {
            const parsedJson = JSON.parse(rawAjax);
            if (typeof parsedJson?.result === 'string') htmlContent = parsedJson.result;
            else if (typeof parsedJson?.result?.html === 'string') htmlContent = parsedJson.result.html;
        } catch (_) {}

        const chapters = [];
        const liRegex = /<li[^>]*data-number="([^"]+)"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]* title="([^"]*)"[\s\S]*?<\/li>/gi;
        let m;
        while ((m = liRegex.exec(htmlContent)) !== null) {
            const num = parseFloat(m[1]);
            const href = m[2].trim();
            const titleAttr = stripHtmlTags(m[3]) || `Chapter ${m[1]}`;
            const dataIdMatch = m[0].match(/data-id="(\d+)"/i);
            const chId = dataIdMatch ? dataIdMatch[1] : href;
            chapters.push({
                id: chId,
                mangafireChapterId: chId,
                title: titleAttr.toLowerCase().startsWith('chap') ? titleAttr : `Chapter ${m[1]} - ${titleAttr}`,
                number: isNaN(num) ? chapters.length + 1 : num
            });
        }
        if (chapters.length > 0) {
            chapters.sort((a, b) => (a.number || 0) - (b.number || 0));
            return chapters;
        }
    } catch (_) {}

    // 5. Automatic Fallback when MangaFire VRF blocks chapter AJAX or MangaDex has 0 chapters (e.g. Jujutsu Kaisen / One Piece):
    // Resolve title via MangaKatana first (which hosts full chapters for Shonen Jump & licensed series), then MangaDex!
    const titleGuess = rawId
        .replace(/^(md|mk):/i, '')
        .split('.')[0]
        .replace(/-/g, ' ')
        .trim();

    if (titleGuess && !/^[0-9a-f]{8}-/i.test(titleGuess)) {
        try {
            const mkSearchUrl = `${MANGAKATANA_BASE}/?search=${encodeURIComponent(titleGuess)}&search_by=book_name`;
            const { html, finalUrl } = await fetchHtmlWithFallback(mkSearchUrl);
            const mkResults = parseMangaKatanaHtmlSearch(html, finalUrl || mkSearchUrl, titleGuess);
            if (mkResults.length > 0) {
                const bestMk = mkResults[0];
                const mkUrl = bestMk.mangakatanaUrl || `${MANGAKATANA_BASE}/manga/${bestMk.mangakatanaId}`;
                const { html: chHtml } = await fetchHtmlWithFallback(mkUrl);
                const mkChs = parseMangaKatanaChaptersHtml(chHtml);
                if (mkChs.length > 0) {
                    return mkChs.map(c => ({
                        ...c,
                        id: `mk:${c.url}`,
                        mangafireChapterId: `mk:${c.url}`,
                        mangakatanaChapterUrl: c.url
                    }));
                }
            }
        } catch (_) {}

        try {
            const mdList = await queryMangaDexList(titleGuess, 5);
            for (const cand of mdList) {
                if (cand?.id) {
                    const mdChs = await fetchMangaDexChaptersFast(cand.id, lang);
                    if (mdChs.length > 0) return mdChs;
                }
            }
        } catch (_) {}
    }

    return [];
}

export async function fetchMangaFirePages(chapterId) {
    const cleanChId = (chapterId || '').toString().trim().replace(/^\/+|\/+$/g, '');

    // 1. Handle MangaKatana-backed chapter IDs (`mk:...`)
    if (cleanChId.startsWith('mk:') || cleanChId.includes('mangakatana.com/')) {
        const mkUrl = cleanChId.replace(/^mk:/, '');
        const { html } = await fetchHtmlWithFallback(mkUrl);
        return parseMangaKatanaPagesHtml(html);
    }

    // 2. Handle MangaDex-backed chapter IDs (`md:...`)
    if (cleanChId.startsWith('md:') || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanChId)) {
        const mdChId = cleanChId.replace(/^md:/, '');
        const atHomeRes = await fetch(`https://api.mangadex.org/at-home/server/${encodeURIComponent(mdChId)}`, {
            headers: typeof window === 'undefined' ? { 'User-Agent': USER_AGENT } : {},
            cache: 'no-store'
        });
        const atHome = await atHomeRes.json();
        if (atHome && atHome.baseUrl && atHome.chapter) {
            const hash = atHome.chapter.hash;
            const saverFiles = atHome.chapter.dataSaver || [];
            const dataFiles = atHome.chapter.data || [];
            const folder = saverFiles.length > 0 ? 'data-saver' : 'data';
            const files = saverFiles.length > 0 ? saverFiles : dataFiles;
            return files.map(fileName => `https://uploads.mangadex.org/${folder}/${hash}/${fileName}`);
        }
        return [];
    }

    // 3. Try custom MANGAFIRE_API_BASE if configured
    if (MANGAFIRE_API_BASE && (!MANGAFIRE_API_BASE.includes('localhost') || process.env.NODE_ENV === 'development')) {
        try {
            const baseUrl = MANGAFIRE_API_BASE.replace(/\/+$/, '');
            const endpoint = `${baseUrl}/chapter/${encodeURIComponent(cleanChId)}`;
            const res = await fetch(endpoint, {
                headers: { 'Accept': 'application/json' },
                cache: 'no-store',
                signal: AbortSignal.timeout(7000)
            });
            if (res.ok) {
                const json = await res.json();
                const rawImages = Array.isArray(json) ? json : (json?.images || json?.pages || json?.data || []);
                const urls = rawImages.map(img => (typeof img === 'string' ? img : img?.url || img?.img || img?.src || '')).filter(Boolean);
                if (urls.length > 0) return urls;
            }
        } catch (_) {}
    }

    // 4. Try MangaFire AJAX chapter images endpoint
    try {
        const ajaxUrl = `${MANGAFIRE_BASE}/ajax/read/chapter/${encodeURIComponent(cleanChId)}`;
        const { html: rawJson } = await fetchHtmlWithFallback(ajaxUrl);
        const parsed = JSON.parse(rawJson);
        const images = parsed?.result?.images || [];
        const urls = images.map(entry => (Array.isArray(entry) ? entry[0] : entry?.url || entry)).filter(u => typeof u === 'string' && u.startsWith('http'));
        if (urls.length > 0) return urls;
    } catch (_) {}

    return [];
}
