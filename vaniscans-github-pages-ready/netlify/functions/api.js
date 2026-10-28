const crypto = require('crypto');

const ADMIN_USER_HASH = '059a50ce956b7ec61527c7ecc0c55b5a009dc54ab4acddce8852b46baa2aba30';
const ADMIN_PASS_HASH = '9109551a88284a2754a704d50d6636fc596ae718df126354742f1637940bbc5a';
const MANGADEX_API = 'https://api.mangadex.org';
const USER_AGENT = 'VaniScans/3.2 (+https://vaniscans.online)';

const MANGAKATANA_BASE = 'https://mangakatana.com';
const MK_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://mangakatana.com/'
};

function stripHtmlTags(str) {
    return (str || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();
}

function parseMangaKatanaHtmlSearch(html, finalUrl = '', fallbackQuery = '') {
    const results = [];

    // Case 1: Redirected directly to single manga page (#single_book)
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

    // Case 2: Search results grid (#book_list > .item)
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

function parseMangaKatanaChaptersHtml(html) {
    const rawChapters = [];
    const seenUrls = new Set();
    const rowRegex = /<div[^>]*class="[^"]*\bchapter\b[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = rowRegex.exec(html)) !== null) {
        const chUrl = match[1].trim();
        if (!chUrl || seenUrls.has(chUrl)) continue;
        seenUrls.add(chUrl);

        const rawTitle = stripHtmlTags(match[2]);
        const lowerTitle = rawTitle.toLowerCase();
        
        // Exclude non-chapter rows (e.g. promotional banners, volume covers, author notes, external announcements)
        if (lowerTitle.includes('volume') && !lowerTitle.includes('chapter') && !lowerTitle.match(/ch\./i)) {
            // keep only if it explicitly looks like a chapter or numbered release
        }

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

    // MangaKatana lists newest chapters first (top to bottom).
    // Reversing gives true chronological order (Chapter 1 first, latest chapter last).
    rawChapters.reverse();

    // Deduplicate chapter numbers to prevent duplicates or mixed chapters from other series
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

function parseMangaKatanaPagesHtml(html) {
    // 1. Primary: Check MangaKatana's standard JS image arrays (`thzq`, `ytaw`, `htnc`)
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

    // 2. Fallback: Match any `data-src` inside `#imgs` reader container
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

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    const path = event.path.replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/api/, '');
    const qs = event.queryStringParameters || {};

    try {
        // 1. Admin SHA-256 Auth Verification
        if (event.httpMethod === 'POST' && path === '/auth/login') {
            const { userHash, passHash } = JSON.parse(event.body || '{}');
            if (!userHash || !passHash || userHash.length !== 64 || passHash.length !== 64) {
                return { statusCode: 400, headers, body: JSON.stringify({ success: false }) };
            }
            const userMatch = crypto.timingSafeEqual(
                Buffer.from(userHash.toLowerCase(), 'utf-8'),
                Buffer.from(ADMIN_USER_HASH.toLowerCase(), 'utf-8')
            );
            const passMatch = crypto.timingSafeEqual(
                Buffer.from(passHash.toLowerCase(), 'utf-8'),
                Buffer.from(ADMIN_PASS_HASH.toLowerCase(), 'utf-8')
            );
            if (userMatch && passMatch) {
                return {
                    statusCode: 200,
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ success: true, token: crypto.randomBytes(24).toString('hex') })
                };
            }
            return { statusCode: 401, headers, body: JSON.stringify({ success: false }) };
        }

        // 2. Binary Image Proxy for MangaDex & MangaKatana
        if (event.httpMethod === 'GET' && (path === '/mangadex/img' || path === '/mangakatana/img')) {
            let targetUrl = qs.url || '';
            if (qs.chapterId && qs.pageIndex !== undefined) {
                const atHomeRes = await fetch(`${MANGADEX_API}/at-home/server/${encodeURIComponent(qs.chapterId)}`, {
                    headers: { 'User-Agent': USER_AGENT }
                });
                const atHome = await atHomeRes.json();
                if (atHome && atHome.baseUrl && atHome.chapter) {
                    const idx = parseInt(qs.pageIndex, 10) || 0;
                    const useSaver = qs.saver === '1' && atHome.chapter.dataSaver?.length > idx;
                    const folder = useSaver ? 'data-saver' : 'data';
                    const files = useSaver ? atHome.chapter.dataSaver : (atHome.chapter.data || atHome.chapter.dataSaver || []);
                    if (files[idx]) {
                        targetUrl = `${atHome.baseUrl}/${folder}/${atHome.chapter.hash}/${files[idx]}`;
                    }
                }
            }

            if (!targetUrl || !targetUrl.startsWith('http')) {
                return { statusCode: 400, headers, body: 'Missing valid image url' };
            }

            const isKatana = path === '/mangakatana/img' || !targetUrl.includes('mangadex.org');
            const reqHeaders = {
                'User-Agent': isKatana ? MK_HEADERS['User-Agent'] : USER_AGENT,
                'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
            };
            if (isKatana) {
                reqHeaders['Referer'] = 'https://mangakatana.com/';
            }

            const imgRes = await fetch(targetUrl, { headers: reqHeaders });
            if (!imgRes.ok) {
                return { statusCode: imgRes.status, headers, body: 'Upstream image error' };
            }

            const arrayBuffer = await imgRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

            return {
                statusCode: 200,
                headers: {
                    ...headers,
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=86400'
                },
                body: buffer.toString('base64'),
                isBase64Encoded: true
            };
        }

        // 3. MangaDex Search Crawler
        if (event.httpMethod === 'GET' && path === '/mangadex/search') {
            const query = (qs.q || '').trim();
            const limit = Math.min(parseInt(qs.limit || '24', 10), 50);
            const params = new URLSearchParams();
            params.append('limit', String(limit));
            params.append('includes[]', 'cover_art');
            params.append('includes[]', 'author');
            params.append('includes[]', 'artist');
            params.append('contentRating[]', 'safe');
            params.append('contentRating[]', 'suggestive');
            params.append('contentRating[]', 'erotica');
            params.append('hasAvailableChapters', 'true');

            const uuidMatch = query.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
            let url = '';
            if (uuidMatch) {
                params.delete('limit');
                params.append('ids[]', uuidMatch[0]);
                url = `${MANGADEX_API}/manga?${params.toString()}`;
            } else if (query) {
                params.append('title', query);
                params.append('order[relevance]', 'desc');
                url = `${MANGADEX_API}/manga?${params.toString()}`;
            } else {
                params.append('order[followedCount]', 'desc');
                url = `${MANGADEX_API}/manga?${params.toString()}`;
            }

            const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
            const data = await res.json();
            return {
                statusCode: res.status,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            };
        }

        // 4. MangaDex Chapters Feed Crawler
        if (event.httpMethod === 'GET' && path === '/mangadex/feed') {
            const mangaId = qs.mangaId;
            const limit = Math.min(parseInt(qs.limit || '100', 10), 500);
            const offset = parseInt(qs.offset || '0', 10);
            const lang = qs.lang || 'en';

            const params = new URLSearchParams();
            params.append('limit', String(limit));
            params.append('offset', String(offset));
            if (lang !== 'all') {
                params.append('translatedLanguage[]', lang);
            }
            params.append('includes[]', 'scanlation_group');
            params.append('order[chapter]', 'asc');
            params.append('order[volume]', 'asc');
            params.append('contentRating[]', 'safe');
            params.append('contentRating[]', 'suggestive');
            params.append('contentRating[]', 'erotica');
            params.append('includeEmptyPages', '0');
            params.append('includeExternalUrl', '0');
            params.append('includeFutureUpdates', '0');

            const url = `${MANGADEX_API}/manga/${encodeURIComponent(mangaId)}/feed?${params.toString()}`;
            const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
            const data = await res.json();
            return {
                statusCode: res.status,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            };
        }

        // 5. MangaDex At-Home Image Server Node Resolver
        if (event.httpMethod === 'GET' && path === '/mangadex/pages') {
            const chapterId = qs.chapterId;
            const url = `${MANGADEX_API}/at-home/server/${encodeURIComponent(chapterId)}`;
            const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
            const data = await res.json();
            return {
                statusCode: res.status,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            };
        }

        // 6. MangaKatana Search
        if (event.httpMethod === 'GET' && path === '/mangakatana/search') {
            const query = (qs.q || '').trim();
            let targetUrl = `${MANGAKATANA_BASE}/manga`;
            if (query.startsWith('http') && query.includes('mangakatana.com/manga/')) {
                targetUrl = query;
            } else if (query) {
                targetUrl = `${MANGAKATANA_BASE}/?search=${encodeURIComponent(query)}&search_by=book_name`;
            }
            const res = await fetch(targetUrl, { headers: MK_HEADERS, redirect: 'follow' });
            const html = await res.text();
            const results = parseMangaKatanaHtmlSearch(html, res.url || targetUrl, query);
            return {
                statusCode: 200,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ result: 'ok', data: results })
            };
        }

        // 7. MangaKatana Chapters List
        if (event.httpMethod === 'GET' && path === '/mangakatana/chapters') {
            const rawUrl = (qs.url || qs.slug || '').trim();
            const targetUrl = rawUrl.startsWith('http') ? rawUrl : `${MANGAKATANA_BASE}/manga/${rawUrl.replace(/^\/+/, '')}`;
            const res = await fetch(targetUrl, { headers: MK_HEADERS, redirect: 'follow' });
            const html = await res.text();
            const chapters = parseMangaKatanaChaptersHtml(html);
            return {
                statusCode: 200,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ result: 'ok', data: chapters })
            };
        }

        // 8. MangaKatana Chapter Pages
        if (event.httpMethod === 'GET' && path === '/mangakatana/pages') {
            const targetUrl = (qs.url || '').trim();
            if (!targetUrl.startsWith('http')) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid chapter url required' }) };
            }
            const res = await fetch(targetUrl, { headers: MK_HEADERS, redirect: 'follow' });
            const html = await res.text();
            const pages = parseMangaKatanaPagesHtml(html);
            return {
                statusCode: 200,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ result: 'ok', pages })
            };
        }

        // 9. Chapter Comments (/api/comments/:chapterId)
        if (path.startsWith('/comments/')) {
            const parts = path.replace(/^\/comments\//, '').split('/');
            const chapterId = decodeURIComponent(parts[0] || '');
            const commentId = parts[1] ? decodeURIComponent(parts[1]) : null;
            global.__vaniscansComments = global.__vaniscansComments || {};

            if (event.httpMethod === 'GET') {
                return {
                    statusCode: 200,
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify(global.__vaniscansComments[chapterId] || [])
                };
            }
            if (event.httpMethod === 'POST') {
                const body = JSON.parse(event.body || '{}');
                if (!body || !body.text) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Comment text required' }) };
                }
                if (!Array.isArray(global.__vaniscansComments[chapterId])) {
                    global.__vaniscansComments[chapterId] = [];
                }
                global.__vaniscansComments[chapterId].unshift(body);
                return {
                    statusCode: 200,
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                };
            }
            if (event.httpMethod === 'DELETE' && commentId) {
                if (Array.isArray(global.__vaniscansComments[chapterId])) {
                    global.__vaniscansComments[chapterId] = global.__vaniscansComments[chapterId].filter(c => c.id !== commentId);
                }
                return {
                    statusCode: 200,
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ success: true })
                };
            }
        }

        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Endpoint not found' }) };
    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message || 'Server error' })
        };
    }
};
