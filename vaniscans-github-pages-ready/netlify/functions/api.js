const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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

// Persist inside the deployed function bundle. On Netlify the function dir is
// read-only, so we also keep an in-memory copy and fall back to /tmp. Writes
// NEVER silently vanish: if every store fails, writeDB returns false and the
// caller can surface the error instead of pretending the save worked.
const LOCAL_DB_PATH = (function resolveDbPath() {
    const candidates = [
        path.join(__dirname, 'manga.json'),                 // alongside the deployed function
        path.join(__dirname, '..', 'data', 'manga.json'),   // netlify/functions/../data
        path.join(process.cwd(), 'backend', 'data', 'manga.json'),
        path.join('/tmp', 'vaniscans-manga.json')           // writable fallback
    ];
    for (const p of candidates) {
        try {
            const dir = path.dirname(p);
            if (fs.existsSync(dir) && fs.existsSync(p)) return p;
        } catch (_) {}
    }
    return candidates[candidates.length - 1]; // default to writable /tmp
})();

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL ? process.env.FIREBASE_DB_URL.replace(/\/$/, '') : '';
const FIREBASE_SECRET = process.env.FIREBASE_SECRET || '';

let memoryDB = null;

function emptyDB() {
    return { mangas: [], chapters: [], comments: {}, monetization: {} };
}

// Shipped seed catalog. A fresh Netlify deploy (cold start, no persisted data)
// falls back to this so the site is never empty out of the box.
const SEED_DB = {
    mangas: [
        {
            id: 'manga-seed-1',
            mangadexId: '9b3398e6-7c3e-4f3a-9b3d-3f7c0e2e5a1c',
            title: 'Solo Leveling',
            author: 'Chugong',
            cover: 'https://uploads.mangadex.org/covers/9b3398e6-7c3e-4f3a-9b3d-3f7c0e2e5a1c/512.jpg',
            banner: 'https://uploads.mangadex.org/covers/9b3398e6-7c3e-4f3a-9b3d-3f7c0e2e5a1c/512.jpg',
            genres: ['Action', 'Fantasy', 'Regression'],
            status: 'Ongoing',
            rating: 9.8,
            synopsis: 'E-rank hunter Jin-woo is the weakest. After a near-fatal dungeon encounter, a mysterious system offers him a second chance — to level up or die trying.',
            updatedAt: Date.now()
        },
        {
            id: 'manga-seed-2',
            mangadexId: '3457a6e1-2f6b-4c8a-9d3e-7f1a2b3c4d5e',
            title: 'Chainsaw Man',
            author: 'Tatsuki Fujimoto',
            cover: 'https://uploads.mangadex.org/covers/3457a6e1-2f6b-4c8a-9d3e-7f1a2b3c4d5e/512.jpg',
            banner: 'https://uploads.mangadex.org/covers/3457a6e1-2f6b-4c8a-9d3e-7f1a2b3c4d5e/512.jpg',
            genres: ['Action', 'Horror'],
            status: 'Completed',
            rating: 9.7,
            synopsis: 'Denji is a poor young man who becomes Chainsaw Man — a devil hunter with a chainsaw for a heart — and dives headfirst into a brutal war with devils.',
            updatedAt: Date.now()
        },
        {
            id: 'manga-seed-3',
            mangadexId: '7a2f4c8e-1b3d-4e6f-9a2c-5d7e8f1a3b9c',
            title: 'One Piece',
            author: 'Eiichiro Oda',
            cover: 'https://uploads.mangadex.org/covers/7a2f4c8e-1b3d-4e6f-9a2c-5d7e8f1a3b9c/512.jpg',
            banner: 'https://uploads.mangadex.org/covers/7a2f4c8e-1b3d-4e6f-9a2c-5d7e8f1a3b9c/512.jpg',
            genres: ['Adventure', 'Action', 'Fantasy'],
            status: 'Ongoing',
            rating: 9.9,
            synopsis: 'Monkey D. Luffy sets sail to become the Pirate King, gathering a crew and facing the most fearsome oceans and enemies the world has to offer.',
            updatedAt: Date.now()
        },
        {
            id: 'manga-seed-4',
            mangadexId: '1c9e5b2a-4d8f-4736-a1e0-6f2c8b4d7e91',
            title: 'Jujutsu Kaisen',
            author: 'Gege Akutami',
            cover: 'https://uploads.mangadex.org/covers/1c9e5b2a-4d8f-4736-a1e0-6f2c8b4d7e91/512.jpg',
            banner: 'https://uploads.mangadex.org/covers/1c9e5b2a-4d8f-4736-a1e0-6f2c8b4d7e91/512.jpg',
            genres: ['Action', 'Supernatural'],
            status: 'Completed',
            rating: 9.6,
            synopsis: 'Yuji Itadori swallows a cursed finger to save his friends, becoming the host of a terrifying curse and joining a school of jujutsu sorcerers.',
            updatedAt: Date.now()
        }
    ],
    chapters: [],
    comments: {},
    monetization: {}
};

async function readDB() {
    // 1. Firebase (configure FIREBASE_DB_URL / FIREBASE_SECRET in Netlify env vars for durable storage)
    if (FIREBASE_DB_URL) {
        try {
            const authParam = FIREBASE_SECRET ? `?auth=${FIREBASE_SECRET}` : '';
            const res = await fetch(`${FIREBASE_DB_URL}/db.json${authParam}`);
            if (res.ok) {
                const data = await res.json();
                if (data) {
                    memoryDB = data;
                    return data;
                }
            }
        } catch (e) {
            console.error('Firebase readDB error:', e.message);
        }
    }
    // 2. In-memory (survives within a warm Lambda container)
    if (memoryDB) return memoryDB;
    // 3. Local file
    try {
        if (fs.existsSync(LOCAL_DB_PATH)) {
            const raw = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
            const data = JSON.parse(raw);
            memoryDB = data;
            return data;
        }
    } catch (e) {
        console.error('Local readDB error:', e.message);
    }
    // 4. Shipped seed catalog (never return a truly empty site on a fresh deploy)
    memoryDB = SEED_DB;
    return SEED_DB;
}

async function writeDB(dbData) {
    memoryDB = dbData; // always keep the in-memory copy current
    let anySucceeded = false;

    // 1. Firebase
    if (FIREBASE_DB_URL) {
        try {
            const authParam = FIREBASE_SECRET ? `?auth=${FIREBASE_SECRET}` : '';
            const res = await fetch(`${FIREBASE_DB_URL}/db.json${authParam}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dbData)
            });
            if (res.ok) anySucceeded = true;
        } catch (e) {
            console.error('Firebase writeDB error:', e.message);
        }
    }
    // 2. Local file
    try {
        const dir = path.dirname(LOCAL_DB_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(dbData, null, 2), 'utf-8');
        anySucceeded = true;
    } catch (e) {
        console.error('Local writeDB error:', e.message);
    }

    if (!anySucceeded) {
        console.error('writeDB: ALL persistence backends failed — data is only in memory for this request!');
    }
    return anySucceeded;
}

function stripHtmlTags(str) {
    return (str || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();
}

function parseMangaKatanaHtmlSearch(html, finalUrl = '', fallbackQuery = '') {
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

function parseMangaKatanaPagesHtml(html) {
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
            if (isKatana) reqHeaders['Referer'] = 'https://mangakatana.com/';

            const imgRes = await fetch(targetUrl, { headers: reqHeaders });
            if (!imgRes.ok) return { statusCode: imgRes.status, headers, body: 'Upstream image error' };

            const arrayBuffer = await imgRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

            return {
                statusCode: 200,
                headers: { ...headers, 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' },
                body: buffer.toString('base64'),
                isBase64Encoded: true
            };
        }

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
            return { statusCode: res.status, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
        }

        if (event.httpMethod === 'GET' && path === '/mangadex/feed') {
            const mangaId = qs.mangaId;
            const limit = Math.min(parseInt(qs.limit || '100', 10), 500);
            const offset = parseInt(qs.offset || '0', 10);
            const lang = qs.lang || 'en';

            const params = new URLSearchParams();
            params.append('limit', String(limit));
            params.append('offset', String(offset));
            if (lang !== 'all') params.append('translatedLanguage[]', lang);
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
            return { statusCode: res.status, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
        }

        if (event.httpMethod === 'GET' && path === '/mangadex/pages') {
            const chapterId = qs.chapterId;
            const url = `${MANGADEX_API}/at-home/server/${encodeURIComponent(chapterId)}`;
            const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
            const data = await res.json();
            return { statusCode: res.status, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
        }

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
            return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ result: 'ok', data: results }) };
        }

        if (event.httpMethod === 'GET' && path === '/mangakatana/chapters') {
            const rawUrl = (qs.url || qs.slug || '').trim();
            const targetUrl = rawUrl.startsWith('http') ? rawUrl : `${MANGAKATANA_BASE}/manga/${rawUrl.replace(/^\/+/, '')}`;
            const res = await fetch(targetUrl, { headers: MK_HEADERS, redirect: 'follow' });
            const html = await res.text();
            const chapters = parseMangaKatanaChaptersHtml(html);
            return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ result: 'ok', data: chapters }) };
        }

        if (event.httpMethod === 'GET' && path === '/mangakatana/pages') {
            const targetUrl = (qs.url || '').trim();
            if (!targetUrl.startsWith('http')) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid chapter url required' }) };
            }
            const res = await fetch(targetUrl, { headers: MK_HEADERS, redirect: 'follow' });
            const html = await res.text();
            const pages = parseMangaKatanaPagesHtml(html);
            return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ result: 'ok', pages }) };
        }

        const db = await readDB();

        if (event.httpMethod === 'GET' && (path === '/manga' || path === '/mangas' || path === '/')) {
            return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(db.mangas || []) };
        }

        if (event.httpMethod === 'POST' && (path === '/manga' || path === '/mangas' || path === '')) {
            const manga = JSON.parse(event.body || '{}');
            if (!manga || !manga.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid manga payload' }) };
            }
            const idx = (db.mangas || []).findIndex(
                m => m.id === manga.id ||
                     (manga.mangadexId && m.mangadexId === manga.mangadexId) ||
                     (manga.mangakatanaId && m.mangakatanaId === manga.mangakatanaId)
            );
            if (!db.mangas) db.mangas = [];
            if (idx > -1) {
                db.mangas[idx] = { ...db.mangas[idx], ...manga, id: db.mangas[idx].id };
            } else {
                db.mangas.unshift(manga);
            }
            await writeDB(db);
            return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(manga) };
        }

        if (event.httpMethod === 'DELETE' && path.startsWith('/mangas/')) {
            const id = path.replace('/mangas/', '');
            db.mangas = (db.mangas || []).filter(m => m.id !== id);
            db.chapters = (db.chapters || []).filter(c => c.mangaId !== id);
            await writeDB(db);
            return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true }) };
        }

        if (event.httpMethod === 'GET' && path.match(/^\/mangas\/[^\/]+\/chapters$/)) {
            const mangaId = path.split('/')[2];
            const chapters = (db.chapters || []).filter(c => c.mangaId === mangaId);
            return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(chapters) };
        }

        if (event.httpMethod === 'GET' && path.startsWith('/chapters/')) {
            const id = path.replace('/chapters/', '');
            const chapter = (db.chapters || []).find(c => c.id === id);
            if (!chapter) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Chapter not found' }) };
            return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(chapter) };
        }

        if (event.httpMethod === 'POST' && path === '/chapters') {
            const chapter = JSON.parse(event.body || '{}');
            if (!chapter || !chapter.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid chapter data' }) };
            }
            if (!db.chapters) db.chapters = [];
            const idx = db.chapters.findIndex(c => c.id === chapter.id);
            if (idx > -1) {
                db.chapters[idx] = chapter;
            } else {
                db.chapters.push(chapter);
            }
            await writeDB(db);
            return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(chapter) };
        }

        if (event.httpMethod === 'POST' && path === '/chapters/bulk') {
            const body = JSON.parse(event.body || '{}');
            const chapters = body.chapters;
            if (!Array.isArray(chapters)) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Chapters array required' }) };
            }
            if (!db.chapters) db.chapters = [];
            chapters.forEach(ch => {
                const idx = db.chapters.findIndex(c => c.id === ch.id);
                if (idx > -1) db.chapters[idx] = ch;
                else db.chapters.push(ch);
            });
            await writeDB(db);
            return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, count: chapters.length }) };
        }

        if (path === '/monetization') {
            if (event.httpMethod === 'GET') {
                return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(db.monetization || {}) };
            }
            if (event.httpMethod === 'POST' || event.httpMethod === 'PUT') {
                const settings = JSON.parse(event.body || '{}');
                db.monetization = settings;
                await writeDB(db);
                return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(db.monetization) };
            }
        }

        if (path.startsWith('/comments/')) {
            const parts = path.replace(/^\/comments\//, '').split('/');
            const chapterId = decodeURIComponent(parts[0] || '');
            const commentId = parts[1] ? decodeURIComponent(parts[1]) : null;

            if (!db.comments) db.comments = {};

            if (event.httpMethod === 'GET') {
                return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(db.comments[chapterId] || []) };
            }
            if (event.httpMethod === 'POST') {
                const body = JSON.parse(event.body || '{}');
                if (!body || !body.text) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Comment text required' }) };
                if (!Array.isArray(db.comments[chapterId])) {
                    db.comments[chapterId] = [];
                }
                db.comments[chapterId].unshift(body);
                await writeDB(db);
                return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
            }
            if (event.httpMethod === 'DELETE' && commentId) {
                if (Array.isArray(db.comments[chapterId])) {
                    db.comments[chapterId] = db.comments[chapterId].filter(c => c.id !== commentId);
                    await writeDB(db);
                }
                return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true }) };
            }
        }

        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Endpoint not found' }) };
    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Server error' }) };
    }
};
