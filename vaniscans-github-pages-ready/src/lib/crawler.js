const USER_AGENT = 'VaniScans/5.0 (+https://vaniscans.online)';
const MANGAKATANA_BASE = 'https://mangakatana.com';
export const COMIX_BASE = 'https://comix.to';

export const MK_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': 'https://mangakatana.com/'
};

export const COMIX_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://comix.to/'
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

function normalizeAssetUrl(raw = '', baseOrigin = MANGAKATANA_BASE) {
    if (!raw || typeof raw !== 'string') return '';
    const trimmed = raw.trim().replace(/\\+\//g, '/');
    if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('javascript:')) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    if (trimmed.startsWith('/')) return `${baseOrigin.replace(/\/+$/, '')}${trimmed}`;
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

export async function fetchHtmlWithFallback(targetUrl, customHeaders = null) {
    const headersToUse = customHeaders || (targetUrl.includes('comix.to') ? COMIX_HEADERS : MK_HEADERS);

    // Try direct fetch first
    try {
        const directRes = await fetch(targetUrl, {
            headers: headersToUse,
            redirect: 'follow',
            cache: 'no-store',
            signal: AbortSignal.timeout(8000)
        });
        if (directRes.ok) {
            const html = await directRes.text();
            if (!isCloudflareOrBlockedHtml(html)) {
                return { html, finalUrl: directRes.url || targetUrl };
            }
        }
    } catch (_) {}

    // Add more proxy relays to bypass Cloudflare bot detection
    const relays = [
        { url: `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`, json: true },
        { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`, json: false },
        { url: `https://r.jina.ai/${targetUrl}`, json: false },
        { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, json: false },
        { url: `https://cors-anywhere.herokuapp.com/${targetUrl}`, json: false }
    ];

    for (const relay of relays) {
        try {
            const res = await fetch(relay.url, {
                cache: 'no-store',
                signal: AbortSignal.timeout(12000)
            });
            if (!res.ok) continue;

            if (relay.json) {
                const j = await res.json();
                if (j && typeof j.contents === 'string' && !isCloudflareOrBlockedHtml(j.contents)) {
                    return { html: j.contents, finalUrl: j.status?.url || targetUrl };
                }
            } else {
                const text = await res.text();
                // If it's from Jina, it might be markdown but still contains the data we need
                if (!isCloudflareOrBlockedHtml(text) || relay.url.includes('jina.ai')) {
                    return { html: text, finalUrl: targetUrl };
                }
            }
        } catch (_) {}
    }

    throw new Error('Upstream host blocked automated requests.');
}

// ============================================================================
// COMIX.TO SCRAPER FUNCTIONS (Matches User's FastAPI BeautifulSoup Selectors)
// ============================================================================

export function parseComixHtmlSearch(html = '', finalUrl = '', fallbackQuery = '') {
    const results = [];
    if (!html) return results;

    // 1. Check if single comic detail page (e.g. https://comix.to/comic/manga-slug)
    const isDetailPage =
        (finalUrl && /\/comic\/[^/?#]+/i.test(finalUrl)) ||
        ((html.includes('id="chapter-list"') || html.includes('class="chapters-list"') || html.includes('class="comic-poster"')) &&
         !html.includes('/search?q='));

    if (isDetailPage) {
        const titleMatch =
            html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
            html.match(/<[^>]+class="[^"]*comic-title[^"]*"[^>]*>([\s\S]*?)<\/[a-z0-9]+>/i);
        const descMatch =
            html.match(/<[^>]+class="[^"]*(?:description|summary|comic-description|text-muted)[^"]*"[^>]*>([\s\S]*?)<\/[a-z0-9]+>/i);
        const coverMatch =
            html.match(/<div[^>]+class="[^"]*(?:comic-poster|profile-manga)[^"]*"[^>]*>[\s\S]*?<img[^>]+(?:data-src|src)=["']([^"']+)["']/i) ||
            html.match(/<meta[^>]+property="og:image"[^>]+content=["']([^"']+)["']/i) ||
            html.match(/<img[^>]+class="[^"]*rounded[^"]*"[^>]+(?:data-src|src)=["']([^"']+)["']/i);
        const ogUrlMatch = html.match(/<meta[^>]+property="og:url"[^>]+content=["']([^"']+)["']/i);

        const mangaUrl = (ogUrlMatch ? ogUrlMatch[1].trim() : finalUrl) || `${COMIX_BASE}/comic/${fallbackQuery}`;
        const slug = mangaUrl.replace(/\/+$/, '').split('/').pop() || `co-${Date.now()}`;
        const rawCover = coverMatch ? normalizeAssetUrl(coverMatch[1], COMIX_BASE) : '';

        results.push({
            comixId: slug,
            comixUrl: mangaUrl.startsWith('http') ? mangaUrl : `${COMIX_BASE}${mangaUrl.startsWith('/') ? '' : '/'}${mangaUrl}`,
            sourceHost: 'comix.to',
            title: titleMatch ? stripHtmlTags(titleMatch[1]) : (fallbackQuery || slug),
            author: 'Comix.to',
            cover: rawCover || 'https://placehold.co/400x600/1a1d30/3b82f6?text=Comix.to',
            genres: ['Action', 'Comic'],
            status: 'Ongoing',
            rating: '9.6',
            synopsis: descMatch ? stripHtmlTags(descMatch[1]) : `Imported from Comix.to (${slug}).`
        });
        return results;
    }

    // 2. Parse search result cards (.item, .comic-item, .card, div.grid > div)
    const seenUrls = new Set();
    // The search page for /?s= might return initial-data, but if it renders HTML, it might be different.
    // The previous parsing logic might need to be adjusted if the HTML structure changed.
    const cardBlocks = html.split(/<div[^>]+class="[^"]*(?:\bitem\b|comic-item|\bcard\b)[^"]*"[^>]*>/i).slice(1);
    const blocksToScan = cardBlocks.length > 0 ? cardBlocks : html.split(/<a[^>]+href=["'](?=\/?(?:comic|manga|series|title)\/)/i).slice(1);

    // Fallback: search for data in initial-data script tag as well
    const m = html.match(/<script[^>]*id="initial-data"[^>]*>([\s\S]*?)<\/script>/i);
    if (m) {
        try {
            const data = JSON.parse(m[1]);
            if (data.queries) {
                for (const key in data.queries) {
                    const q = JSON.parse(key);
                    // Search query results: ["manga","search",{"q":"query",...}]
                    const isSearchQuery = q[0] === 'manga' && q[1] === 'search';
                    const isHotList = q[0] === 'manga' && q[1] === 'list' && q[2]?.scope === 'hot';

                    if (isSearchQuery || isHotList) {
                        const items = (data.queries[key].items || data.queries[key]) || [];
                        const finalItems = Array.isArray(items) ? items : (items.items || []);

                        for (const item of finalItems) {
                            const mangaUrl = `${COMIX_BASE}/title/${item.hid}`;
                            if (seenUrls.has(mangaUrl)) continue;
                            seenUrls.add(mangaUrl);
                            results.push({
                                comixId: item.hid,
                                comixUrl: mangaUrl,
                                sourceHost: 'comix.to',
                                title: item.title,
                                author: 'Comix.to',
                                cover: item.poster?.medium || 'https://placehold.co/400x600/1a1d30/3b82f6?text=Comix.to',
                                genres: ['Action', 'Comic'],
                                status: item.status === 'releasing' ? 'Ongoing' : 'Completed',
                                rating: '9.6',
                                synopsis: item.synopsis || `Imported from Comix.to (${item.title}).`
                            });
                        }
                    }
                }
            }
        } catch(e) {}
    }

    for (const block of blocksToScan) {
        const titleElMatch =
            block.match(/<h3[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i) ||
            block.match(/<[^>]+class="[^"]*title[^"]*"[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i) ||
            block.match(/<a[^>]+class="[^"]*(?:text-pri|font-semibold)[^"]*"[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i) ||
            block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);

        if (!titleElMatch) continue;

        let mangaUrl = titleElMatch[1].trim();
        if (mangaUrl.startsWith('/')) mangaUrl = `${COMIX_BASE}${mangaUrl}`;
        if (!mangaUrl.startsWith('http')) continue;
        if (seenUrls.has(mangaUrl)) continue;

        const cleanTitle = stripHtmlTags(titleElMatch[2]);
        if (!cleanTitle) continue;
        seenUrls.add(mangaUrl);

        const slug = mangaUrl.replace(/\/+$/, '').split('/').pop() || `co-${results.length + 1}`;
        const imgMatch = block.match(/<img[^>]+(?:data-src|src)=["']([^"']+)["']/i);
        const coverUrl = imgMatch ? normalizeAssetUrl(imgMatch[1], COMIX_BASE) : '';

        results.push({
            comixId: slug,
            comixUrl: mangaUrl,
            sourceHost: 'comix.to',
            title: cleanTitle,
            author: 'Comix.to',
            cover: coverUrl || 'https://placehold.co/400x600/1a1d30/3b82f6?text=Comix.to',
            genres: ['Action', 'Comic'],
            status: 'Ongoing',
            rating: '9.6',
            synopsis: `Imported from Comix.to (${cleanTitle}).`
        });
    }

    return results;
}

export function parseComixChaptersHtml(html = '') {
    const rawChapters = [];
    const seenUrls = new Set();
    if (!html) return rawChapters;

    // First try to extract from initial-data if it's there
    const m = html.match(/<script[^>]*id="initial-data"[^>]*>([\s\S]*?)<\/script>/i);
    if (m) {
        try {
            const data = JSON.parse(m[1]);
            // Extract the first and latest chapter URLs if available in the detail data
            for (const key in data.queries) {
                if (key.includes('"manga","detail"')) {
                    const detail = data.queries[key];
                    if (detail.firstChapterUrl) {
                        const url = detail.firstChapterUrl.startsWith('http') ? detail.firstChapterUrl : `${COMIX_BASE}${detail.firstChapterUrl}`;
                        if (!seenUrls.has(url)) {
                            seenUrls.add(url);
                            rawChapters.push({
                                id: url.split('/').pop(),
                                url: url,
                                title: 'First Chapter',
                                parsedNum: 1
                            });
                        }
                    }
                    if (detail.latestChapterUrl) {
                        const url = detail.latestChapterUrl.startsWith('http') ? detail.latestChapterUrl : `${COMIX_BASE}${detail.latestChapterUrl}`;
                        if (!seenUrls.has(url)) {
                            seenUrls.add(url);
                            rawChapters.push({
                                id: url.split('/').pop(),
                                url: url,
                                title: `Chapter ${detail.latestChapter || 'Latest'}`,
                                parsedNum: detail.latestChapter ? parseFloat(detail.latestChapter) : null
                            });
                        }
                    }
                }
            }
        } catch(e) {}
    }

    // Matches #chapter-list li a, .chapters-list a, ul.list-none li a, .chapter-item
    // Updated to handle /title/slug/{chapter-slug} format
    const aRegex = /<a[^>]+href=["'](\/title\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = aRegex.exec(html)) !== null) {
        let chUrl = match[1].trim();
        const rawTitle = stripHtmlTags(match[2]);
        if (!chUrl || chUrl === '#' || chUrl.startsWith('javascript:')) continue;

        // Ensure it's a chapter link (contains both a slug and a chapter identifier)
        const parts = chUrl.split('/').filter(Boolean);
        if (parts.length < 3 || !/chapter/i.test(chUrl)) continue;

        if (chUrl.startsWith('/')) chUrl = `${COMIX_BASE}${chUrl}`;
        if (!chUrl.startsWith('http') || seenUrls.has(chUrl)) continue;
        seenUrls.add(chUrl);

        const chSlug = parts.pop();
        const numMatch = chSlug.match(/(\d+(?:\.\d+)?)/) || rawTitle.match(/(\d+(?:\.\d+)?)/);
        const parsedNum = numMatch ? parseFloat(numMatch[1]) : null;

        rawChapters.push({
            id: chSlug,
            url: chUrl,
            title: rawTitle || `Chapter ${parsedNum || rawChapters.length + 1}`,
            parsedNum
        });
    }

    // Sort chapters by number if possible, then reverse to match expected order
    rawChapters.sort((a, b) => {
        if (a.parsedNum !== null && b.parsedNum !== null) return a.parsedNum - b.parsedNum;
        return 0;
    });

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

export function parseComixPagesHtml(html = '') {
    const pages = [];
    const seen = new Set();
    if (!html) return pages;

    // Matches .reader-area img, .reading-content img, .chapter-images img, div.page-img img
    const readerSectionMatch = html.match(
        /<div[^>]+class="[^"]*(?:reader-area|reading-content|chapter-images|page-img)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    );
    const scopeHtml = readerSectionMatch ? readerSectionMatch[1] : html;

    const imgRegex = /<img[^>]+>/gi;
    let match;
    while ((match = imgRegex.exec(scopeHtml)) !== null) {
        const tag = match[0];
        if (/logo|avatar|banner|icon|favicon/i.test(tag)) continue;

        const srcMatch =
            tag.match(/data-src=["']([^"']+)["']/i) ||
            tag.match(/data-url=["']([^"']+)["']/i) ||
            tag.match(/src=["']([^"']+)["']/i);
        if (!srcMatch || !srcMatch[1]) continue;

        const cleanUrl = normalizeAssetUrl(srcMatch[1], COMIX_BASE);
        if (cleanUrl && !seen.has(cleanUrl)) {
            seen.add(cleanUrl);
            pages.push(cleanUrl);
        }
    }

    return pages;
}

export async function fetchComixSearch(query = '') {
    const cleanQ = (query || '').trim();
    // The previous URL was /search?q= which now 404s. Using /?s=
    let targetUrl = `${COMIX_BASE}/?s=${encodeURIComponent(cleanQ)}`;
    if (cleanQ.startsWith('http') && cleanQ.includes('comix.to')) {
        targetUrl = cleanQ;
    } else if (cleanQ && !cleanQ.includes(' ') && cleanQ.includes('/comic/')) {
        targetUrl = `${COMIX_BASE}${cleanQ.startsWith('/') ? '' : '/'}${cleanQ}`;
    }

    const { html, finalUrl } = await fetchHtmlWithFallback(targetUrl, COMIX_HEADERS);
    return parseComixHtmlSearch(html, finalUrl || targetUrl, cleanQ);
}

export async function fetchComixChapters(urlOrSlug = '') {
    const clean = (urlOrSlug || '').trim();
    // New pattern: /title/{hid}
    const slug = clean.replace(/^\/+|\/+$/g, '').replace(/^comic\//i, '').replace(/^title\//i, '').split('?')[0];
    const targetUrl = `${COMIX_BASE}/title/${slug}`;
    const { html } = await fetchHtmlWithFallback(targetUrl, COMIX_HEADERS);
    return parseComixChaptersHtml(html);
}

export async function fetchComixPages(chapterUrl = '') {
    const clean = (chapterUrl || '').trim();
    // For reading, it might be /title/{hid}/{chapter-slug}
    const targetUrl = clean.startsWith('http')
        ? clean
        : `${COMIX_BASE}${clean.startsWith('/') ? '' : '/'}${clean}`;
    const { html } = await fetchHtmlWithFallback(targetUrl, COMIX_HEADERS);
    return parseComixPagesHtml(html);
}

export const MANGAFIRE_API_BASE =
    (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env.PUBLIC_MANGAFIRE_API_URL || import.meta.env.MANGAFIRE_API_URL)) ||
    (typeof process !== 'undefined' && process.env && (process.env.PUBLIC_MANGAFIRE_API_URL || process.env.MANGAFIRE_API_URL)) ||
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
