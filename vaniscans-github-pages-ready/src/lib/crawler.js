const USER_AGENT = 'VaniScans/5.0 (+https://vaniscans.online)';
const MANGAKATANA_BASE = 'https://mangakatana.com';
const MANHUAUS_BASE = 'https://manhuaus.club';

export const MK_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': 'https://mangakatana.com/'
};

export const MU_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
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
        .replace(/<[^>]*>/g, ' ')
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

function normalizeAssetUrl(raw = '', baseOrigin = MANHUAUS_BASE) {
    if (!raw || typeof raw !== 'string') return '';
    const trimmed = raw.trim().replace(/\\+\//g, '/');
    if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('javascript:')) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    if (trimmed.startsWith('/')) return `${baseOrigin.replace(/\/+$/, '')}${trimmed}`;
    return '';
}

function extractBestImgUrl(imgTagHtml = '', baseOrigin = MANHUAUS_BASE) {
    if (!imgTagHtml) return '';
    const attrNames = [
        'data-src',
        'data-lazy-src',
        'data-cfsrc',
        'data-original',
        'data-full-url',
        'src'
    ];
    for (const attr of attrNames) {
        const m = imgTagHtml.match(new RegExp(`\\b${attr}=["']([^"']+)["']`, 'i'));
        if (m && m[1]) {
            const normalized = normalizeAssetUrl(m[1], baseOrigin);
            if (normalized && !/blank\.gif|placeholder|loading\.gif|1x1/i.test(normalized)) {
                return normalized;
            }
        }
    }
    const srcsetMatch = imgTagHtml.match(/(?:data-srcset|srcset)=["']([^"']+)["']/i);
    if (srcsetMatch && srcsetMatch[1]) {
        const firstPart = srcsetMatch[1].trim().split(',')[0].trim().split(/\s+/)[0];
        const normalized = normalizeAssetUrl(firstPart, baseOrigin);
        if (normalized) return normalized;
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
// MANHUAUS.CLUB & MANHUAUS.COM SCRAPER FUNCTIONS (V6 ROBUST ANCHOR SCANNER)
// ============================================================================

function resolveManhuausOrigin(urlStr = '') {
    try {
        if (urlStr && urlStr.startsWith('http')) {
            return new URL(urlStr).origin;
        }
    } catch (_) {}
    return MANHUAUS_BASE;
}

export function parseManhuausHtmlSearch(html, finalUrl = '', fallbackQuery = '') {
    const results = [];
    if (!html || isCloudflareOrBlockedHtml(html)) return results;

    const candidateUrl = (finalUrl || fallbackQuery || '').trim();
    const origin = resolveManhuausOrigin(candidateUrl);
    const isDirectMangaUrl =
        /\/manga\/[^/?#]+\/?$/i.test(candidateUrl) &&
        !/\/manga\/page\//i.test(candidateUrl);

    const isSingleSeriesPage =
        ((html.includes('summary_image') && html.includes('post-title')) ||
         html.includes('MANGA DISCUSSION') ||
         html.includes('No chapters match your search') ||
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
            .replace(/\s*[-–|]\s*(?:Manhuaus|Arena Scans).*$/i, '')
            .trim() || fallbackQuery || 'ManhuaUS Series';

        const summaryImgBlock = html.match(/<div[^>]*class="[^"]*summary_image[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        const rawCover =
            (summaryImgBlock ? extractBestImgUrl(summaryImgBlock[1], origin) : '') ||
            (ogImageMatch ? normalizeAssetUrl(ogImageMatch[1], origin) : '') ||
            'https://placehold.co/400x600/1a1d30/ec4899?text=ManhuaUS';

        const ogUrlMatch = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
        const mangaUrl = (ogUrlMatch ? ogUrlMatch[1].trim() : candidateUrl) || '';
        const slug = mangaUrl.split('/manga/')[1]?.split(/[/?#]/)[0]?.replace(/\/+$/, '') || ('mu-' + Date.now());

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
            : 'Imported directly from ManhuaUS.';

        const statusBlock = html.match(/<div[^>]*class="[^"]*post-status[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const isCompleted = (statusBlock && /completed/i.test(statusBlock[1])) || /Status\s*Completed/i.test(stripHtmlTags(html));

        results.push({
            manhuausId: slug,
            manhuausUrl: mangaUrl.startsWith('http') ? mangaUrl : `${origin}/manga/${slug}/`,
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
        const slug = mangaUrl.split('/manga/')[1]?.split(/[/?#]/)[0]?.replace(/\/+$/, '') || '';
        if (!slug || slug === 'page' || seenSlugs.has(slug)) continue;
        seenSlugs.add(slug);

        const imgTagMatch = block.match(/<img[^>]+>/i);
        const rawCover = (imgTagMatch ? extractBestImgUrl(imgTagMatch[0], origin) : '') ||
                         'https://placehold.co/400x600/1a1d30/ec4899?text=ManhuaUS';

        results.push({
            manhuausId: slug,
            manhuausUrl: mangaUrl.startsWith('http') ? mangaUrl : `${origin}${mangaUrl.startsWith('/') ? '' : '/'}${mangaUrl}`,
            sourceHost: 'manhuaus.club',
            title: title || slug,
            author: 'ManhuaUS Studio',
            cover: rawCover,
            genres: ['Action', 'Manhua', 'Fantasy'],
            status: 'Ongoing',
            rating: '9.7',
            synopsis: `Imported from ManhuaUS (${title || slug}).`
        });
    }

    if (results.length === 0) {
        const linkRegex = /<a[^>]+href=["'](https?:\/\/[^"']*manhuaus\.[a-z]+\/manga\/([^/"'?#]+)\/?|\/manga\/([^/"'?#]+)\/?)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let m;
        while ((m = linkRegex.exec(html)) !== null) {
            const rawHref = m[1];
            const slug = (m[2] || m[3] || '').trim();
            if (!slug || slug === 'page' || seenSlugs.has(slug)) continue;

            const inner = m[4] || '';
            const imgTag = inner.match(/<img[^>]+>/i);
            const label = stripHtmlTags(inner).replace(/^(?:Read now|Details|NEW)\s*/i, '').trim();
            if (!label || /^chapter\s*\d+/i.test(label) || label.length < 2) continue;

            seenSlugs.add(slug);
            results.push({
                manhuausId: slug,
                manhuausUrl: rawHref.startsWith('http') ? rawHref : `${origin}${rawHref.startsWith('/') ? '' : '/'}${rawHref}`,
                sourceHost: 'manhuaus.club',
                title: label,
                author: 'ManhuaUS Studio',
                cover: (imgTag ? extractBestImgUrl(imgTag[0], origin) : '') || 'https://placehold.co/400x600/1a1d30/ec4899?text=ManhuaUS',
                genres: ['Action', 'Manhua', 'Fantasy'],
                status: 'Ongoing',
                rating: '9.7',
                synopsis: `Imported from ManhuaUS (${label}).`
            });
        }
    }

    return results;
}

export function parseManhuausChaptersHtml(html, seriesUrl = '') {
    const rawChapters = [];
    const seenUrls = new Set();
    if (!html) return rawChapters;

    const origin = resolveManhuausOrigin(seriesUrl);

    // Universal anchor scanner for ManhuaUS / WordPress Madara / custom themes
    const aRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = aRegex.exec(html)) !== null) {
        const rawHref = match[1].trim();
        if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) continue;

        const cleanHref = rawHref.split('#')[0].trim();
        if (!cleanHref) continue;

        const fullUrl = cleanHref.startsWith('http')
            ? cleanHref
            : `${origin}${cleanHref.startsWith('/') ? '' : '/'}${cleanHref}`;

        // Skip pagination and external domains
        if (
            /\/manga\/page\/\d+/i.test(fullUrl) ||
            /[?&](?:page|cpage|m_orderby|s)=/i.test(fullUrl) ||
            \/about|\/privacy|\/terms|\/dmca|\/contact\/?$/i.test(fullUrl) ||
            !fullUrl.includes(new URL(origin).hostname)
        ) {
            continue;
        }

        const text = stripHtmlTags(match[2]);
        const cleanPath = fullUrl.replace(/[?#].*$/, '').replace(/\+$/, '');
        const lastSeg = cleanPath.split('/').pop() || '';

        const isChapterPath = /chapter|ch[-_]?\d+|ep[-_]?\d+|\b\d+(?:\.\d+)?\b/i.test(cleanPath);
        if (!isChapterPath) continue;

        if (
            /read\s+chapter\s+\d+\s+now/i.test(text) ||
            /^(?:first\s+chapter|latest\s+chapter|read\s+now|read\s+first|read\s+last|details|continue\s+reading|comments|manga\s+discussion)$/i.test(text)
        ) {
            continue;
        }

        const numMatch =
            text.match(/chapter\s*[-:#]?\s*(\d+(?:\.\d+)?)/i) ||
            text.match(/episode\s*[-:#]?\s*(\d+(?:\.\d+)?)/i) ||
            text.match(/(?:\b|^)(\d+(?:\.\d+)?)\s*chapter/i) ||
            lastSeg.match(/chapter[-_]?(\d+(?:[.-]\d+)?)/i) ||
            lastSeg.match(/^c(\d+(?:\.\d+)?)$/i) ||
            lastSeg.match(/^(\d+(?:\.\d+)?)$/);

        if (!numMatch) continue;

        if (seenUrls.has(fullUrl)) continue;
        seenUrls.add(fullUrl);

        const parsedNum = parseFloat(numMatch[1].replace('-', '.'));
        rawChapters.push({
            id: lastSeg || `ch-${parsedNum}`,
            url: fullUrl,
            title: `Chapter ${parsedNum}`,
            parsedNum
        });
    }

    const finalChapters = [];
    const seenNumbers = new Set();

    rawChapters.sort((a, b) => (a.parsedNum ?? 999999) - (b.parsedNum ?? 999999));

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

export function parseManhuausPagesHtml(html, chapterUrl = '') {
    const pages = [];
    const seen = new Set();
    if (!html || isCloudflareOrBlockedHtml(html)) return pages;

    const origin = resolveManhuausOrigin(chapterUrl);
    const isJunkImage = (u) =>
        !u ||
        /logo|avatar|banner|icon|gravatar|emoji|spinner|loader|preloader|ads|badge|favicon|cover|thumb-\d+x\d+|-\d{2,3}x\d{2,3}\./i.test(u);

    const pushPage = (rawUrl) => {
        const clean = normalizeAssetUrl(rawUrl, origin);
        if (clean && !isJunkImage(clean) && !seen.has(clean)) {
            seen.add(clean);
            pages.push(clean);
        }
    };

    // 1. Check preloaded JS arrays first
    const preloadedMatch =
        html.match(/chapter_preloaded_images\s*=\s*(\[[\s\S]*?\])\s*;/i) ||
        html.match(/["']images["']\s*:\s*(\[\s*["'](?:https?:)?\/\/[\s\S]*?\])/i) ||
        html.match(/(?:page_urls|chapterImages|readerImages|pages)\s*=\s*(\[\s*["'](?:https?:)?\/\/[\s\S]*?\])\s*;/i);

    if (preloadedMatch && preloadedMatch[1]) {
        const urlHits = preloadedMatch[1].match(/(?:https?:)?\\?\/\\?\/[^"'\s,\]]+/gi) || [];
        for (const hit of urlHits) {
            pushPage(hit.replace(/\\\//g, '/'));
        }
        if (pages.length >= 2) return pages;
    }

    // 2. Scoped reader container if available
    const containerRegexes = [
        /<div[^>]*class="[^"]*\b(?:reading-content|chapter-content|reader-area|reader-content|chapter-images|vung-doc|container-chapter-reader)\b[^"]*"[^>]*>([\s\S]*?)<(?:footer|div[^>]*class="[^"]*(?:entry-header|c-blog-post|wp-manga-nav|comments|discussion))/i,
        /<div[^>]*id="[^"]*(?:readerarea|chapter-reader|reading-content|images-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    ];

    let scopeHtml = '';
    for (const rx of containerRegexes) {
        const m = html.match(rx);
        if (m && m[1] && m[1].includes('<img')) {
            scopeHtml = m[1];
            break;
        }
    }

    const imgRegex = /<img\b[^>]+>/gi;
    let match;

    if (scopeHtml) {
        while ((match = imgRegex.exec(scopeHtml)) !== null) {
            const imgUrl = extractBestImgUrl(match[0], origin);
            pushPage(imgUrl);
        }
        if (pages.length > 0) return pages;
    }

    // 3. Full-document fallback for custom readers without legacy Madara classes
    const bodyHtml = html
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '');

    while ((match = imgRegex.exec(bodyHtml)) !== null) {
        const tag = match[0];
        if (/avatar|logo|site-branding|related|recommend/i.test(tag)) continue;
        const imgUrl = extractBestImgUrl(tag, origin);
        if (imgUrl && /\.(?:jpe?g|png|webp|avif)(?:[?#].*)?$/i.test(imgUrl)) {
            pushPage(imgUrl);
        }
    }

    return pages;
}

export async function fetchHtmlWithFallback(targetUrl) {
    const isManhuaus = targetUrl.includes('manhuaus.');
    const primaryHeaders = isManhuaus
        ? { ...MU_HEADERS, Referer: resolveManhuausOrigin(targetUrl) + '/' }
        : MK_HEADERS;

    // 1. Direct server-side fetch
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

    // 2. Sequential proxy relays with Cloudflare challenge filtering
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
        `Upstream source (${isManhuaus ? 'ManhuaUS' : 'target site'}) blocked automated server/proxy requests with Cloudflare 403. Use the "Paste Page HTML" option below or search MangaDex/MangaFire.`
    );
}

export async function fetchManhuausChaptersWithAjax(targetUrl) {
    const cleanSeriesUrl = targetUrl.replace(/\/+$/, '') + '/';
    const origin = resolveManhuausOrigin(cleanSeriesUrl);
    const { html } = await fetchHtmlWithFallback(cleanSeriesUrl);

    const allChapters = parseManhuausChaptersHtml(html, cleanSeriesUrl);

    // Check if the series page has paginated chapter tabs (up to 15 pages)
    const pageNums = new Set();
    const pageLinkRegex = /href=["']([^"']*(?:[?&](?:page|cpage|chapter_page)=(\d+))[^"']*)["']/gi;
    let pm;
    while ((pm = pageLinkRegex.exec(html)) !== null) {
        const pNum = parseInt(pm[2], 10);
        if (pNum > 1 && pNum <= 15 && !pageNums.has(pNum)) {
            pageNums.add(pNum);
            const rawHref = pm[1].replace(/&amp;/g, '&');
            const pUrl = rawHref.startsWith('http')
                ? rawHref
                : rawHref.startsWith('?')
                ? `${cleanSeriesUrl}${rawHref}`
                : `${origin}${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;
            try {
                const { html: subHtml } = await fetchHtmlWithFallback(pUrl);
                const subChs = parseManhuausChaptersHtml(subHtml, cleanSeriesUrl);
                for (const sc of subChs) {
                    if (!allChapters.some(existing => existing.number === sc.number)) {
                        allChapters.push(sc);
                    }
                }
            } catch (_) {}
        }
    }

    if (allChapters.length > 0) {
        allChapters.sort((a, b) => (a.number || 0) - (b.number || 0));
        return allChapters;
    }

    // Fallback 1: WordPress Madara direct AJAX chapters endpoint
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
            const chapters = parseManhuausChaptersHtml(ajaxHtml, cleanSeriesUrl);
            if (chapters.length > 0) return chapters;
        }
    } catch (_) {}

    // Fallback 2: WordPress admin-ajax.php with manga_get_chapters action
    try {
        const postIdMatch =
            html.match(/id=["']manga-chapters-holder["'][^>]+data-id=["'](\d+)["']/i) ||
            html.match(/var\s+manga\s*=\s*\{[^}]*["']manga_id["']\s*:\s*["']?(\d+)["']?/i);
        if (postIdMatch && postIdMatch[1]) {
            const body = new URLSearchParams({ action: 'manga_get_chapters', manga: postIdMatch[1] });
            const wpRes = await fetch(`${origin}/wp-admin/admin-ajax.php`, {
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
                const chapters = parseManhuausChaptersHtml(wpHtml, cleanSeriesUrl);
                if (chapters.length > 0) return chapters;
            }
        }
    } catch (_) {}

    return allChapters;
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
