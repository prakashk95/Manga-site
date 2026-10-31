const USER_AGENT = 'VaniScans/5.0 (+https://vaniscans.online)';
const MANGAKATANA_BASE = 'https://mangakatana.com';
const MANHUAUS_BASE = 'https://manhuaus.club';

export const MK_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://mangakatana.com/'
};

export const MU_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://manhuaus.club/'
};

export function stripHtmlTags(str) {
    return (str || '')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#8217;/g, "'")
        .replace(/&#8220;|&#8221;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractBestImgUrl(imgTagHtml = '') {
    if (!imgTagHtml) return '';
    const attrNames = ['data-src', 'data-lazy-src', 'data-cfsrc', 'src'];
    for (const attr of attrNames) {
        const m = imgTagHtml.match(new RegExp(`${attr}=["'](\\s*https?:\\/\\/[^"']+)["']`, 'i'));
        if (m && m[1]) {
            const candidate = m[1].trim();
            if (!candidate.startsWith('data:')) return candidate;
        }
    }
    const srcsetMatch = imgTagHtml.match(/(?:data-srcset|srcset)=["']([^"']+)["']/i);
    if (srcsetMatch && srcsetMatch[1]) {
        const firstPart = srcsetMatch[1].trim().split(',')[0].trim().split(/\s+/)[0];
        if (/^https?:\/\//i.test(firstPart)) return firstPart;
    }
    return '';
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
    const imgTagRegex = /data-src=["'](https?:\/\/[^"']+)["']/gi;
    const fallbackUrls = [];
    while ((match = imgTagRegex.exec(imgsSection)) !== null) {
        const u = match[1].trim();
        if (!u.includes('logo') && !u.includes('avatar')) {
            fallbackUrls.push(u);
        }
    }
    return fallbackUrls;
}

// ============================================================================
// MANHUAUS.CLUB (WordPress Madara Theme) SCRAPER FUNCTIONS
// ============================================================================

export function parseManhuausHtmlSearch(html, finalUrl = '', fallbackQuery = '') {
    const results = [];
    if (!html) return results;

    // 1. Check if the HTML is a direct single series page (e.g. /manga/slug/)
    const isSingleSeriesPage =
        (html.includes('summary_image') && html.includes('post-title')) &&
        !html.includes('c-tabs-item__content');

    if (isSingleSeriesPage) {
        const titleMatch =
            html.match(/<div[^>]*class="[^"]*post-title[^"]*"[^>]*>[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
            html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        let rawTitle = titleMatch ? titleMatch[1].replace(/<span[^>]*>[\s\S]*?<\/span>/gi, '') : '';
        const cleanTitle = stripHtmlTags(rawTitle) || fallbackQuery || 'ManhuaUS Series';

        const summaryImgBlock = html.match(/<div[^>]*class="[^"]*summary_image[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const ogImageMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
        const rawCover = (summaryImgBlock ? extractBestImgUrl(summaryImgBlock[1]) : '') ||
                         (ogImageMatch ? ogImageMatch[1].trim() : '') ||
                         'https://placehold.co/400x600/1a1d30/ec4899?text=ManhuaUS';

        const ogUrlMatch = html.match(/<meta[^>]+property="og:url"[^>]+content="([^"]+)"/i);
        const mangaUrl = (ogUrlMatch ? ogUrlMatch[1].trim() : finalUrl) || '';
        const slug = mangaUrl.split('/manga/')[1]?.replace(/\/+$/, '') || ('mu-' + Date.now());

        const authorBlock = html.match(/<div[^>]*class="[^"]*author-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const author = authorBlock ? stripHtmlTags(authorBlock[1]) : 'ManhuaUS Studio';

        const genresBlock = html.match(/<div[^>]*class="[^"]*genres-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const genres = [];
        if (genresBlock) {
            const gRegex = /<a[^>]*>([^<]+)<\/a>/gi;
            let gm;
            while ((gm = gRegex.exec(genresBlock[1])) !== null) {
                genres.push(stripHtmlTags(gm[1]));
            }
        }

        const summaryBlock =
            html.match(/<div[^>]*class="[^"]*summary__content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
            html.match(/<div[^>]*class="[^"]*description-summary[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const synopsis = summaryBlock ? stripHtmlTags(summaryBlock[1]) : 'Imported directly from ManhuaUS.club.';

        const statusBlock = html.match(/<div[^>]*class="[^"]*post-status[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const isCompleted = statusBlock && /completed/i.test(statusBlock[1]);

        results.push({
            manhuausId: slug,
            manhuausUrl: mangaUrl || `${MANHUAUS_BASE}/manga/${slug}/`,
            sourceHost: 'manhuaus.club',
            title: cleanTitle,
            author: author || 'ManhuaUS Creator',
            cover: rawCover,
            genres: genres.length > 0 ? genres.slice(0, 4) : ['Action', 'Manhua', 'Martial Arts'],
            status: isCompleted ? 'Completed' : 'Ongoing',
            rating: '9.7',
            synopsis
        });
        return results;
    }

    // 2. Parse Madara Search Results (.c-tabs-item__content) or Catalog Cards (.page-item-detail)
    const blocks = html.includes('c-tabs-item__content')
        ? html.split(/<div[^>]+class="[^"]*c-tabs-item__content[^"]*"[^>]*>/i).slice(1)
        : html.split(/<div[^>]+class="[^"]*page-item-detail[^"]*"[^>]*>/i).slice(1);

    const seenSlugs = new Set();
    for (const block of blocks) {
        const titleLink =
            block.match(/<div[^>]*class="[^"]*post-title[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
            block.match(/<h3[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
            block.match(/<h4[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        if (!titleLink) continue;

        const mangaUrl = titleLink[1].trim();
        const title = stripHtmlTags(titleLink[2]);
        const slug = mangaUrl.split('/manga/')[1]?.replace(/\/+$/, '') || '';
        if (!slug || seenSlugs.has(slug)) continue;
        seenSlugs.add(slug);

        const imgTagMatch = block.match(/<img[^>]+>/i);
        const rawCover = (imgTagMatch ? extractBestImgUrl(imgTagMatch[0]) : '') ||
                         'https://placehold.co/400x600/1a1d30/ec4899?text=ManhuaUS';

        const genresBlock = block.match(/<div[^>]*class="[^"]*mg_genres[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const genres = [];
        if (genresBlock) {
            const gRegex = /<a[^>]*>([^<]+)<\/a>/gi;
            let gm;
            while ((gm = gRegex.exec(genresBlock[1])) !== null) {
                genres.push(stripHtmlTags(gm[1]));
            }
        }

        const authorBlock = block.match(/<div[^>]*class="[^"]*mg_author[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const author = authorBlock ? stripHtmlTags(authorBlock[1].replace(/Author\(s\)/i, '')) : 'ManhuaUS Studio';

        const statusBlock = block.match(/<div[^>]*class="[^"]*mg_status[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const isCompleted = statusBlock && /completed/i.test(statusBlock[1]);

        results.push({
            manhuausId: slug,
            manhuausUrl: mangaUrl.startsWith('http') ? mangaUrl : `${MANHUAUS_BASE}${mangaUrl.startsWith('/') ? '' : '/'}${mangaUrl}`,
            sourceHost: 'manhuaus.club',
            title: title || slug,
            author: author || 'ManhuaUS Studio',
            cover: rawCover,
            genres: genres.length > 0 ? genres.slice(0, 4) : ['Action', 'Manhua', 'Martial Arts'],
            status: isCompleted ? 'Completed' : 'Ongoing',
            rating: '9.7',
            synopsis: `Imported from ManhuaUS.club (${title || slug}).`
        });
    }

    return results;
}

export function parseManhuausChaptersHtml(html) {
    const rawChapters = [];
    const seenUrls = new Set();
    if (!html) return rawChapters;

    const liRegex = /<li[^>]*class="[^"]*\bwp-manga-chapter\b[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = liRegex.exec(html)) !== null) {
        const chUrl = match[1].trim();
        if (!chUrl || seenUrls.has(chUrl)) continue;
        seenUrls.add(chUrl);

        const rawTitle = stripHtmlTags(match[2]);
        const parts = chUrl.replace(/\/+$/, '').split('/').filter(Boolean);
        const chSlug = parts[parts.length - 1] || '';

        const numFromSlug = chSlug.match(/chapter[-_]?(\d+(?:[.-]\d+)?)/i) || chSlug.match(/^(\d+(?:\.\d+)?)$/);
        const numFromTitle = rawTitle.match(/chapter\s*(\d+(?:\.\d+)?)/i) || rawTitle.match(/^(\d+(?:\.\d+)?)/);
        const parsedNum = numFromSlug
            ? parseFloat(numFromSlug[1].replace('-', '.'))
            : numFromTitle
            ? parseFloat(numFromTitle[1])
            : null;

        rawChapters.push({
            id: chSlug || `ch-${rawChapters.length + 1}`,
            url: chUrl.startsWith('http') ? chUrl : `${MANHUAUS_BASE}${chUrl.startsWith('/') ? '' : '/'}${chUrl}`,
            title: rawTitle || `Chapter ${parsedNum || rawChapters.length + 1}`,
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

export function parseManhuausPagesHtml(html) {
    const pages = [];
    const seen = new Set();
    if (!html) return pages;

    const readingMatch = html.match(/<div[^>]*class="[^"]*\breading-content\b[^"]*"[^>]*>([\s\S]*?)<div[^>]*class="[^"]*(?:entry-header|c-blog-post|wp-manga-nav|footer)/i);
    const scopeHtml = readingMatch ? readingMatch[1] : html;

    const imgRegex = /<img[^>]+>/gi;
    let match;
    while ((match = imgRegex.exec(scopeHtml)) !== null) {
        const tag = match[0];
        const isReaderImg =
            /wp-manga-chapter-img/i.test(tag) ||
            /image-\d+/i.test(tag) ||
            (readingMatch && !/logo|avatar|banner|icon|gravatar/i.test(tag));

        if (!isReaderImg) continue;

        const imgUrl = extractBestImgUrl(tag);
        if (imgUrl && /^https?:\/\//i.test(imgUrl) && !seen.has(imgUrl)) {
            seen.add(imgUrl);
            pages.push(imgUrl);
        }
    }

    return pages;
}

export async function fetchHtmlWithFallback(targetUrl) {
    const isManhuaus = targetUrl.includes('manhuaus.club');
    const primaryHeaders = isManhuaus ? MU_HEADERS : MK_HEADERS;

    // 1. Route HTML scrape through our Cloudflare Worker first so tokens match Cloudflare's Edge IP!
    try {
        const cfWorkerUrl = `https://vaniscans.online/api/proxy/img?mode=html&url=${encodeURIComponent(targetUrl)}`;
        const cfRes = await fetch(cfWorkerUrl, {
            cache: 'no-store',
            signal: AbortSignal.timeout(10000)
        });
        if (cfRes.ok) {
            const html = await cfRes.text();
            if (html && html.length > 300 && !html.includes('Just a moment...')) {
                return { html, finalUrl: targetUrl };
            }
        }
    } catch (_) {}

    // 2. Direct server-side fetch with source-matched headers
    try {
        const directRes = await fetch(targetUrl, {
            headers: primaryHeaders,
            redirect: 'follow',
            cache: 'no-store',
            signal: AbortSignal.timeout(10000)
        });
        if (directRes.ok) {
            const html = await directRes.text();
            if (html && html.length > 300 && !html.includes('Just a moment...')) {
                return { html, finalUrl: directRes.url || targetUrl };
            }
        }
    } catch (_) {}

    // 3. Fallback proxy relays if direct fetch is blocked
    const fetchCandidate = async (url, unwrapJson = false) => {
        const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        if (unwrapJson) {
            const j = await res.json();
            if (j && typeof j.contents === 'string' && j.contents.length > 200) {
                return { html: j.contents, finalUrl: j.status?.url || targetUrl };
            }
            throw new Error('Empty contents');
        }
        const text = await res.text();
        if (text && text.length > 200) return { html: text, finalUrl: targetUrl };
        throw new Error('Empty html');
    };

    try {
        return await Promise.any([
            fetchCandidate(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`, false),
            fetchCandidate(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, false),
            fetchCandidate(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`, true)
        ]);
    } catch (_) {
        throw new Error(`Upstream host (${new URL(targetUrl).hostname}) blocked proxy requests due to Cloudflare bot protection.`);
    }
}

export async function fetchManhuausChaptersWithAjax(targetUrl) {
    const cleanSeriesUrl = targetUrl.replace(/\/+$/, '') + '/';
    const { html } = await fetchHtmlWithFallback(cleanSeriesUrl);
    let chapters = parseManhuausChaptersHtml(html);
    if (chapters.length > 0) return chapters;

    // Fallback 1: WordPress Madara direct AJAX chapters endpoint (/manga/<slug>/ajax/chapters/)
    try {
        const ajaxUrl = `${cleanSeriesUrl}ajax/chapters/`;
        const ajaxRes = await fetch(ajaxUrl, {
            method: 'POST',
            headers: {
                ...MU_HEADERS,
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': cleanSeriesUrl
            },
            signal: AbortSignal.timeout(10000)
        });
        if (ajaxRes.ok) {
            const ajaxHtml = await ajaxRes.text();
            chapters = parseManhuausChaptersHtml(ajaxHtml);
            if (chapters.length > 0) return chapters;
        }
    } catch (_) {}

    // Fallback 2: WordPress admin-ajax.php with manga_get_chapters action
    try {
        const postIdMatch = html.match(/id=["']manga-chapters-holder["'][^>]+data-id=["'](\d+)["']/i) ||
                            html.match(/var\s+manga\s*=\s*\{[^}]*["']manga_id["']\s*:\s*["']?(\d+)["']?/i);
        if (postIdMatch && postIdMatch[1]) {
            const body = new URLSearchParams({ action: 'manga_get_chapters', manga: postIdMatch[1] });
            const wpRes = await fetch(`${MANHUAUS_BASE}/wp-admin/admin-ajax.php`, {
                method: 'POST',
                headers: {
                    ...MU_HEADERS,
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': cleanSeriesUrl
                },
                body: body.toString(),
                signal: AbortSignal.timeout(10000)
            });
            if (wpRes.ok) {
                const wpHtml = await wpRes.text();
                chapters = parseManhuausChaptersHtml(wpHtml);
                if (chapters.length > 0) return chapters;
            }
        }
    } catch (_) {}

    return chapters;
}

export const MANGAFIRE_API_BASE =
    (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env.PUBLIC_MANGAFIRE_API_URL || import.meta.env.MANGAFIRE_API_URL)) ||
    (typeof process !== 'undefined' && process.env && (process.env.PUBLIC_MANGAFIRE_API_URL || process.env.MANGAFIRE_API_URL)) ||
    '';

export async function fetchMangaFireSearch(query = '', page = 1) {
    const baseUrl = MANGAFIRE_API_BASE.replace(/\/+$/, '');
    if (!baseUrl) {
        throw new Error('PUBLIC_MANGAFIRE_API_URL is not configured in Render environment variables.');
    }
    const baseUrl = MANGAFIRE_API_BASE.replace(/\/+$/, '');
    const cleanQuery = (query || '').trim();
    const endpoint = cleanQuery
        ? `${baseUrl}/search/${encodeURIComponent(cleanQuery)}?page=${page}`
        : `${baseUrl}/updated?page=${page}`;

    const res = await fetch(endpoint, {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(12000)
    });

    if (!res.ok) {
        throw new Error(`MangaFire API returned HTTP ${res.status}`);
    }

    const json = await res.json();
    const rawItems = Array.isArray(json)
        ? json
        : Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.results)
        ? json.results
        : [];

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
            synopsis: item.description || item.synopsis || 'Imported via MangaFire API.'
        };
    });
}

export async function fetchMangaFireChapters(mangaId, lang = 'en') {
    const baseUrl = MANGAFIRE_API_BASE.replace(/\/+$/, '');
    const cleanId = (mangaId || '')
        .toString()
        .replace(/^https?:\/\/[^/]+\/manga\//i, '')
        .replace(/^\/+|\/+$/g, '');

    const targetLang = lang === 'all' ? 'en' : (lang || 'en');
    const endpoint = `${baseUrl}/manga/${encodeURIComponent(cleanId)}/chapters/${encodeURIComponent(targetLang)}`;

    const res = await fetch(endpoint, {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(12000)
    });

    if (!res.ok) {
        throw new Error(`MangaFire Chapters API returned HTTP ${res.status}`);
    }

    const json = await res.json();
    const rawList = Array.isArray(json)
        ? json
        : Array.isArray(json?.chapters)
        ? json.chapters
        : Array.isArray(json?.data)
        ? json.data
        : [];

    const normalized = rawList.map((ch, idx) => {
        const chId = (ch.id || ch.chapterId || ch.url || `ch-${idx + 1}`).toString();
        const rawTitle = ch.title || ch.name || `Chapter ${ch.number || idx + 1}`;
        const numMatch =
            (ch.number !== undefined ? String(ch.number) : rawTitle).match(/(\d+(\.\d+)?)/);
        const parsedNum = numMatch ? parseFloat(numMatch[1]) : idx + 1;

        return {
            id: chId,
            mangafireChapterId: chId,
            title: rawTitle,
            number: parsedNum
        };
    });

    normalized.sort((a, b) => (a.number || 0) - (b.number || 0));
    return normalized;
}

export async function fetchMangaFirePages(chapterId) {
    const baseUrl = MANGAFIRE_API_BASE.replace(/\/+$/, '');
    const cleanChId = (chapterId || '').toString().replace(/^\/+|\/+$/g, '');
    const endpoint = `${baseUrl}/chapter/${encodeURIComponent(cleanChId)}`;

    const res = await fetch(endpoint, {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) {
        throw new Error(`MangaFire Pages API returned HTTP ${res.status}`);
    }

    const json = await res.json();
    const rawImages = Array.isArray(json)
        ? json
        : Array.isArray(json?.images)
        ? json.images
        : Array.isArray(json?.pages)
        ? json.pages
        : Array.isArray(json?.data)
        ? json.data
        : [];

    return rawImages
        .map(img => (typeof img === 'string' ? img : img?.url || img?.img || img?.src || ''))
        .filter(Boolean);
}
