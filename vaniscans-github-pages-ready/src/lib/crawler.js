const USER_AGENT = 'VaniScans/5.0 (+https://vaniscans.online)';
const MANGAKATANA_BASE = 'https://mangakatana.com';
const MANHUAUS_BASE = 'https://manhuaus.club';

export const MK_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://mangakatana.com/'
};

export const MU_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://manhuaus.club/'
};

export function isCloudflareOrBlockedHtml(html = '') {
    if (!html || typeof html !== 'string' || html.trim().length < 250) return true;
    return (
        html.includes('Just a moment...') ||
        html.includes('cf-browser-verification') ||
        html.includes('Attention Required! | Cloudflare') ||
        html.includes('Enable JavaScript and cookies to continue') ||
        /<title>\s*(?:Access denied|403 Forbidden|Just a moment)/i.test(html)
    );
}

export function stripHtmlTags(str) {
    return (str || '')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#8217;/g, "'")
        .replace(/&#8211;|&#8212;/g, '-')
        .replace(/&#8220;|&#8221;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractBestImgUrl(imgTagHtml = '') {
    if (!imgTagHtml) return '';
    const attrNames = ['data-src', 'data-lazy-src', 'data-cfsrc', 'data-original', 'src'];
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
    if (!html) return results;

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
    if (!html) return rawChapters;
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
    if (!html) return [];
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
// MANHUAUS.CLUB SCRAPER FUNCTIONS (Supports both Madara & Redesigned Theme)
// ============================================================================

export function parseManhuausHtmlSearch(html, finalUrl = '', fallbackQuery = '') {
    const results = [];
    if (!html || isCloudflareOrBlockedHtml(html)) return results;

    const candidateUrl = (finalUrl || fallbackQuery || '').trim();
    const isDirectMangaUrl =
        /\/manga\/[^/?#]+\/?$/i.test(candidateUrl) &&
        !/\/manga\/page\//i.test(candidateUrl);

    const isSingleSeriesPage =
        ((html.includes('summary_image') && html.includes('post-title')) ||
         html.includes('MANGA DISCUSSION') ||
         html.includes('manga-chapters-holder') ||
         isDirectMangaUrl) &&
        !html.includes('c-tabs-item__content') &&
        !html.includes('search-wrap');

    if (isSingleSeriesPage) {
        const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
        const h1Match =
            html.match(/<div[^>]*class="[^"]*post-title[^"]*"[^>]*>[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
            html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);

        let rawTitle = h1Match
            ? h1Match[1].replace(/<span[^>]*>[\s\S]*?<\/span>/gi, '')
            : (ogTitleMatch ? ogTitleMatch[1] : '');
        const cleanTitle = stripHtmlTags(rawTitle)
            .replace(/\s*[-–|]\s*Manhuaus.*$/i, '')
            .trim() || fallbackQuery || 'ManhuaUS Series';

        const summaryImgBlock = html.match(/<div[^>]*class="[^"]*summary_image[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        const rawCover =
            (summaryImgBlock ? extractBestImgUrl(summaryImgBlock[1]) : '') ||
            (ogImageMatch ? ogImageMatch[1].trim() : '') ||
            'https://placehold.co/400x600/1a1d30/ec4899?text=ManhuaUS';

        const ogUrlMatch = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
        const mangaUrl = (ogUrlMatch ? ogUrlMatch[1].trim() : candidateUrl) || '';
        const slug = mangaUrl.split('/manga/')[1]?.split('/')[0]?.replace(/\/+$/, '') || ('mu-' + Date.now());

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
        const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
        const synopsis = summaryBlock
            ? stripHtmlTags(summaryBlock[1])
            : ogDescMatch
            ? stripHtmlTags(ogDescMatch[1])
            : 'Imported directly from ManhuaUS.club.';

        const statusBlock = html.match(/<div[^>]*class="[^"]*post-status[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const isCompleted = (statusBlock && /completed/i.test(statusBlock[1])) || /\bCompleted\b/i.test(html);

        results.push({
            manhuausId: slug,
            manhuausUrl: mangaUrl.startsWith('http') ? mangaUrl : `${MANHUAUS_BASE}/manga/${slug}/`,
            sourceHost: 'manhuaus.club',
            title: cleanTitle,
            author: author || 'ManhuaUS Creator',
            cover: rawCover,
            genres: genres.length > 0 ? genres.slice(0, 4) : ['Action', 'Manhua', 'Fantasy'],
            status: isCompleted ? 'Completed' : 'Ongoing',
            rating: '9.7',
            synopsis
        });
        return results;
    }

    // Parse Madara search cards OR modern grid cards
    const blocks = html.includes('c-tabs-item__content')
        ? html.split(/<div[^>]+class="[^"]*c-tabs-item__content[^"]*"[^>]*>/i).slice(1)
        : html.includes('page-item-detail')
        ? html.split(/<div[^>]+class="[^"]*page-item-detail[^"]*"[^>]*>/i).slice(1)
        : [];

    const seenSlugs = new Set();
    for (const block of blocks) {
        const titleLink =
            block.match(/<div[^>]*class="[^"]*post-title[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
            block.match(/<h3[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
            block.match(/<h4[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        if (!titleLink) continue;

        const mangaUrl = titleLink[1].trim();
        const title = stripHtmlTags(titleLink[2]);
        const slug = mangaUrl.split('/manga/')[1]?.split('/')[0]?.replace(/\/+$/, '') || '';
        if (!slug || slug === 'page' || seenSlugs.has(slug)) continue;
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
            genres: genres.length > 0 ? genres.slice(0, 4) : ['Action', 'Manhua', 'Fantasy'],
            status: isCompleted ? 'Completed' : 'Ongoing',
            rating: '9.7',
            synopsis: `Imported from ManhuaUS.club (${title || slug}).`
        });
    }

    // Fallback generic anchor scan for redesigned ManhuaUS catalog/search pages
    if (results.length === 0) {
        const linkRegex = /<a[^>]+href=["'](https?:\/\/[^"']*manhuaus\.club\/manga\/([^/"'?#]+)\/?|\/manga\/([^/"'?#]+)\/?)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let m;
        while ((m = linkRegex.exec(html)) !== null) {
            const rawHref = m[1];
            const slug = (m[2] || m[3] || '').trim();
            if (!slug || slug === 'page' || seenSlugs.has(slug)) continue;

            const inner = m[4] || '';
            const imgTag = inner.match(/<img[^>]+>/i);
            let label = stripHtmlTags(inner).replace(/^(?:Read now|Details|NEW)\s*/i, '').trim();
            if (!label || /^chapter\s*\d+/i.test(label) || label.length < 2) continue;

            seenSlugs.add(slug);
            results.push({
                manhuausId: slug,
                manhuausUrl: rawHref.startsWith('http') ? rawHref : `${MANHUAUS_BASE}${rawHref.startsWith('/') ? '' : '/'}${rawHref}`,
                sourceHost: 'manhuaus.club',
                title: label,
                author: 'ManhuaUS Studio',
                cover: (imgTag ? extractBestImgUrl(imgTag[0]) : '') || 'https://placehold.co/400x600/1a1d30/ec4899?text=ManhuaUS',
                genres: ['Action', 'Manhua', 'Fantasy'],
                status: 'Ongoing',
                rating: '9.7',
                synopsis: `Imported from ManhuaUS.club (${label}).`
            });
        }
    }

    return results;
}

export function parseManhuausChaptersHtml(html) {
    const rawChapters = [];
    const seenUrls = new Set();
    if (!html) return rawChapters;

    // 1. Classic Madara li.wp-manga-chapter
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

    // 2. Redesigned ManhuaUS anchor cards (e.g., /manga/<slug>/chapter-1/ or /chapter-1/)
    if (rawChapters.length === 0) {
        const anchorRegex = /<a[^>]+href=["']([^"']*\/manga\/[^/"']+\/[^/"']+\/?|[^"']*chapter[-_]\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
        while ((match = anchorRegex.exec(html)) !== null) {
            const chUrl = match[1].trim();
            if (!chUrl || seenUrls.has(chUrl) || /\/manga\/page\//i.test(chUrl)) continue;

            const text = stripHtmlTags(match[2]);
            if (/^(?:First chapter|Latest chapter|Read now|Details)$/i.test(text)) continue;

            const parts = chUrl.replace(/\/+$/, '').split('/').filter(Boolean);
            const chSlug = parts[parts.length - 1] || '';
            const numMatch =
                chSlug.match(/chapter[-_]?(\d+(?:[.-]\d+)?)/i) ||
                text.match(/chapter\s*(\d+(?:\.\d+)?)/i);
            if (!numMatch) continue;

            seenUrls.add(chUrl);
            const parsedNum = parseFloat(numMatch[1].replace('-', '.'));
            rawChapters.push({
                id: chSlug || `ch-${rawChapters.length + 1}`,
                url: chUrl.startsWith('http') ? chUrl : `${MANHUAUS_BASE}${chUrl.startsWith('/') ? '' : '/'}${chUrl}`,
                title: `Chapter ${parsedNum}`,
                parsedNum
            });
        }
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

    finalChapters.sort((a, b) => (a.number || 0) - (b.number || 0));
    return finalChapters;
}

export function parseManhuausPagesHtml(html) {
    const pages = [];
    const seen = new Set();
    if (!html) return pages;

    const readingMatch = html.match(/<div[^>]*class="[^"]*\b(?:reading-content|chapter-content|reader-area)\b[^"]*"[^>]*>([\s\S]*?)<div[^>]*class="[^"]*(?:entry-header|c-blog-post|wp-manga-nav|footer|comments)/i);
    const scopeHtml = readingMatch ? readingMatch[1] : html;

    const imgRegex = /<img[^>]+>/gi;
    let match;
    while ((match = imgRegex.exec(scopeHtml)) !== null) {
        const tag = match[0];
        const isReaderImg =
            /wp-manga-chapter-img|chapter-img|page-img/i.test(tag) ||
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

    // 1. Direct server-side fetch with source-matched headers (no self-loopback)
    try {
        const directRes = await fetch(targetUrl, {
            headers: primaryHeaders,
            redirect: 'follow',
            cache: 'no-store',
            signal: AbortSignal.timeout(9000)
        });
        if (directRes.ok) {
            const html = await directRes.text();
            if (!isCloudflareOrBlockedHtml(html)) {
                return { html, finalUrl: directRes.url || targetUrl };
            }
        }
    } catch (_) {}

    // 2. Sequential proxy relays (checks for valid non-Cloudflare HTML instead of crashing via aggregate promise)
    const relays = [
        { url: `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`, json: true },
        { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`, json: false },
        { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, json: false },
        { url: `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`, json: false }
    ];

    for (const relay of relays) {
        try {
            const res = await fetch(relay.url, {
                cache: 'no-store',
                signal: AbortSignal.timeout(10000)
            });
            if (!res.ok) continue;

            if (relay.json) {
                const j = await res.json();
                if (j && typeof j.contents === 'string' && !isCloudflareOrBlockedHtml(j.contents)) {
                    return { html: j.contents, finalUrl: j.status?.url || targetUrl };
                }
            } else {
                const text = await res.text();
                if (!isCloudflareOrBlockedHtml(text)) {
                    return { html: text, finalUrl: targetUrl };
                }
            }
        } catch (_) {}
    }

    throw new Error(
        `Upstream source (${isManhuaus ? 'ManhuaUS.club' : 'target site'}) blocked automated server/proxy requests with Cloudflare 403. Use the "Paste Page HTML" option below or search MangaDex/MangaFire.`
    );
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
            signal: AbortSignal.timeout(9000)
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
                signal: AbortSignal.timeout(9000)
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
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.MANGAFIRE_API_URL) ||
    process.env.MANGAFIRE_API_URL ||
    'http://localhost:3001/api';

export async function fetchMangaFireSearch(query = '', page = 1) {
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
