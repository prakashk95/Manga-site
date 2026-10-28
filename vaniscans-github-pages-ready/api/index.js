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

const LOCAL_DB_PATH = (function resolveDbPath() {
    const candidates = [
        path.join(__dirname, 'manga.json'),
        path.join(__dirname, '..', 'data', 'manga.json'),
        path.join(process.cwd(), 'backend', 'data', 'manga.json'),
        path.join('/tmp', 'vaniscans-manga.json')
    ];
    for (const p of candidates) {
        try {
            const dir = path.dirname(p);
            if (fs.existsSync(dir) && fs.existsSync(p)) return p;
        } catch (_) {}
    }
    return candidates[candidates.length - 1];
})();

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL ? process.env.FIREBASE_DB_URL.replace(/\/$/, '') : '';
const FIREBASE_SECRET = process.env.FIREBASE_SECRET || '';

let memoryDB = null;

function emptyDB() {
    return { mangas: [], chapters: [], comments: {}, monetization: {} };
}

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
    if (memoryDB) return memoryDB;
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
    memoryDB = SEED_DB;
    return SEED_DB;
}

async function writeDB(dbData) {
    memoryDB = dbData;
    let anySucceeded = false;

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
    try {
        const dir = path.dirname(LOCAL_DB_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(dbData, null, 2), 'utf-8');
        anySucceeded = true;
    } catch (e) {
        console.error('Local writeDB error:', e.message);
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

async function parseBody(req) {
    if (req.body) {
        if (typeof req.body === 'object') return req.body;
        try { return JSON.parse(req.body); } catch (_) {}
    }
    return new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => {
            try { resolve(JSON.parse(data || '{}')); } catch (_) { resolve({}); }
        });
        setTimeout(() => resolve({}), 2000);
    });
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path = urlObj.pathname.replace(/^\/api/, '');
    const qs = Object.fromEntries(urlObj.searchParams.entries());

    try {
        // 1. Admin Auth
        if (req.method === 'POST' && path === '/auth/login') {
            const body = await parseBody(req);
            const { userHash, passHash } = body;
            if (!userHash || !passHash || userHash.length !== 64 || passHash.length !== 64) {
                return res.status(400).json({ success: false, message: 'Invalid hashes' });
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
                return res.status(200).json({ success: true, token: crypto.randomBytes(24).toString('hex') });
            }
            return res.status(401).json({ success: false, message: 'Incorrect credentials' });
        }

        // 2. Image Proxy
        if (req.method === 'GET' && (path === '/mangadex/img' || path === '/mangakatana/img')) {
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
                return res.status(400).send('Missing valid image url');
            }

            const isKatana = path === '/mangakatana/img' || !targetUrl.includes('mangadex.org');
            const reqHeaders = {
                'User-Agent': isKatana ? MK_HEADERS['User-Agent'] : USER_AGENT,
                'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
            };
            if (isKatana) reqHeaders['Referer'] = 'https://mangakatana.com/';

            const imgRes = await fetch(targetUrl, { headers: reqHeaders });
            if (!imgRes.ok) return res.status(imgRes.status).send('Upstream image error');
            const ct = imgRes.headers.get('content-type') || 'image/jpeg';
            res.setHeader('Content-Type', ct);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            const ab = await imgRes.arrayBuffer();
            return res.status(200).send(Buffer.from(ab));
        }

        // 3. MangaDex Search
        if (req.method === 'GET' && path === '/mangadex/search') {
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

            const upstream = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
            const data = await upstream.json();
            return res.status(upstream.status).json(data);
        }

        // 4. MangaDex Feed
        if (req.method === 'GET' && path === '/mangadex/feed') {
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
            const upstream = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
            const data = await upstream.json();
            return res.status(upstream.status).json(data);
        }

        // 5. MangaDex Pages
        if (req.method === 'GET' && path === '/mangadex/pages') {
            const chapterId = qs.chapterId;
            const url = `${MANGADEX_API}/at-home/server/${encodeURIComponent(chapterId)}`;
            const upstream = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
            const data = await upstream.json();
            return res.status(upstream.status).json(data);
        }

        // 6. MangaKatana Search
        if (req.method === 'GET' && path === '/mangakatana/search') {
            const query = (qs.q || '').trim();
            let targetUrl = `${MANGAKATANA_BASE}/manga`;
            if (query.startsWith('http') && query.includes('mangakatana.com/manga/')) {
                targetUrl = query;
            } else if (query) {
                targetUrl = `${MANGAKATANA_BASE}/?search=${encodeURIComponent(query)}&search_by=book_name`;
            }
            const upstream = await fetch(targetUrl, { headers: MK_HEADERS, redirect: 'follow' });
            const html = await upstream.text();
            const results = parseMangaKatanaHtmlSearch(html, upstream.url || targetUrl, query);
            return res.status(200).json({ result: 'ok', data: results });
        }

        // 7. MangaKatana Chapters
        if (req.method === 'GET' && path === '/mangakatana/chapters') {
            const rawUrl = (qs.url || qs.slug || '').trim();
            const targetUrl = rawUrl.startsWith('http') ? rawUrl : `${MANGAKATANA_BASE}/manga/${rawUrl.replace(/^\/+/, '')}`;
            const upstream = await fetch(targetUrl, { headers: MK_HEADERS, redirect: 'follow' });
            const html = await upstream.text();
            const chapters = parseMangaKatanaChaptersHtml(html);
            return res.status(200).json({ result: 'ok', data: chapters });
        }

        // 8. MangaKatana Pages
        if (req.method === 'GET' && path === '/mangakatana/pages') {
            const targetUrl = (qs.url || '').trim();
            if (!targetUrl.startsWith('http')) {
                return res.status(400).json({ error: 'Valid chapter url required' });
            }
            const upstream = await fetch(targetUrl, { headers: MK_HEADERS, redirect: 'follow' });
            const html = await upstream.text();
            const pages = parseMangaKatanaPagesHtml(html);
            return res.status(200).json({ result: 'ok', pages });
        }

        // 9. Database CRUD endpoints (Mangas & Chapters)
        const db = await readDB();

        // GET /manga
        if (req.method === 'GET' && (path === '/manga' || path === '/')) {
            return res.status(200).json(db.mangas || []);
        }

        // POST /manga (Save Manga)
        if (req.method === 'POST' && (path === '/manga' || path === '')) {
            const manga = await parseBody(req);
            if (!manga || !manga.id) {
                return res.status(400).json({ error: 'Invalid manga payload' });
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
            return res.status(200).json(manga);
        }

        // DELETE /manga/:id
        if (req.method === 'DELETE' && path.startsWith('/manga/')) {
            const id = path.replace('/manga/', '');
            db.mangas = (db.mangas || []).filter(m => m.id !== id);
            db.chapters = (db.chapters || []).filter(c => c.mangaId !== id);
            await writeDB(db);
            return res.status(200).json({ success: true });
        }

        // GET /manga/:mangaId/chapters
        if (req.method === 'GET' && path.match(/^\/manga\/[^\/]+\/chapters$/)) {
            const mangaId = path.split('/')[2];
            const chapters = (db.chapters || []).filter(c => c.mangaId === mangaId);
            return res.status(200).json(chapters);
        }

        // GET /chapters/:id
        if (req.method === 'GET' && path.startsWith('/chapters/')) {
            const id = path.replace('/chapters/', '');
            const chapter = (db.chapters || []).find(c => c.id === id);
            if (!chapter) return res.status(404).json({ error: 'Chapter not found' });
            return res.status(200).json(chapter);
        }

        // POST /chapters (Save Chapter)
        if (req.method === 'POST' && path === '/chapters') {
            const chapter = await parseBody(req);
            if (!chapter || !chapter.id) {
                return res.status(400).json({ error: 'Invalid chapter data' });
            }
            if (!db.chapters) db.chapters = [];
            const idx = db.chapters.findIndex(c => c.id === chapter.id);
            if (idx > -1) {
                db.chapters[idx] = chapter;
            } else {
                db.chapters.push(chapter);
            }
            await writeDB(db);
            return res.status(200).json(chapter);
        }

        // POST /chapters/bulk
        if (req.method === 'POST' && path === '/chapters/bulk') {
            const body = await parseBody(req);
            const chapters = body.chapters;
            if (!Array.isArray(chapters)) {
                return res.status(400).json({ error: 'Chapters array required' });
            }
            if (!db.chapters) db.chapters = [];
            chapters.forEach(ch => {
                const idx = db.chapters.findIndex(c => c.id === ch.id);
                if (idx > -1) db.chapters[idx] = ch;
                else db.chapters.push(ch);
            });
            await writeDB(db);
            return res.status(200).json({ success: true, count: chapters.length });
        }

        // Monetization endpoints
        if (path === '/monetization') {
            if (req.method === 'GET') {
                return res.status(200).json(db.monetization || {});
            }
            if (req.method === 'POST' || req.method === 'PUT') {
                const settings = await parseBody(req);
                db.monetization = settings;
                await writeDB(db);
                return res.status(200).json(db.monetization);
            }
        }

        // Comments endpoints (/comments/:chapterId)
        if (path.startsWith('/comments/')) {
            const parts = path.replace(/^\/comments\//, '').split('/');
            const chapterId = decodeURIComponent(parts[0] || '');
            const commentId = parts[1] ? decodeURIComponent(parts[1]) : null;

            if (!db.comments) db.comments = {};

            if (req.method === 'GET') {
                return res.status(200).json(db.comments[chapterId] || []);
            }
            if (req.method === 'POST') {
                const body = await parseBody(req);
                if (!body || !body.text) return res.status(400).json({ error: 'Comment text required' });
                if (!Array.isArray(db.comments[chapterId])) {
                    db.comments[chapterId] = [];
                }
                db.comments[chapterId].unshift(body);
                await writeDB(db);
                return res.status(200).json(body);
            }
            if (req.method === 'DELETE' && commentId) {
                if (Array.isArray(db.comments[chapterId])) {
                    db.comments[chapterId] = db.comments[chapterId].filter(c => c.id !== commentId);
                    await writeDB(db);
                }
                return res.status(200).json({ success: true });
            }
        }

        return res.status(404).json({ error: 'Endpoint not found' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};
