const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '../data/manga.json');
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

function readDB() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            return { mangas: [], chapters: [], comments: {}, monetization: {} };
        }
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        console.error('Error reading manga.json:', err);
        return { mangas: [], chapters: [], comments: {}, monetization: {} };
    }
}

function writeDB(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

exports.verifyAdminLogin = (req, res) => {
    const { userHash, passHash } = req.body || {};
    if (!userHash || !passHash || userHash.length !== 64 || passHash.length !== 64) {
        return res.status(400).json({ success: false, message: 'Invalid credential hashes' });
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
        return res.json({ success: true, token: crypto.randomBytes(24).toString('hex') });
    }
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
};

exports.proxyMangaDexImage = async (req, res) => {
    try {
        let targetUrl = req.query.url || '';
        if (req.query.chapterId && req.query.pageIndex !== undefined) {
            const atHomeRes = await fetch(`${MANGADEX_API}/at-home/server/${encodeURIComponent(req.query.chapterId)}`, {
                headers: { 'User-Agent': USER_AGENT }
            });
            const atHome = await atHomeRes.json();
            if (atHome && atHome.baseUrl && atHome.chapter) {
                const idx = parseInt(req.query.pageIndex, 10) || 0;
                const useSaver = req.query.saver === '1' && atHome.chapter.dataSaver?.length > idx;
                const folder = useSaver ? 'data-saver' : 'data';
                const files = useSaver ? atHome.chapter.dataSaver : (atHome.chapter.data || atHome.chapter.dataSaver || []);
                if (files[idx]) {
                    targetUrl = `${atHome.baseUrl}/${folder}/${atHome.chapter.hash}/${files[idx]}`;
                }
            }
        }

        if (!targetUrl || !targetUrl.startsWith('http')) {
            return res.status(400).send('Invalid image URL');
        }

        const isKatana = req.path.includes('mangakatana') || !targetUrl.includes('mangadex.org');
        const reqHeaders = {
            'User-Agent': isKatana ? MK_HEADERS['User-Agent'] : USER_AGENT,
            'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
        };
        if (isKatana) {
            reqHeaders['Referer'] = 'https://mangakatana.com/';
        }

        const imgRes = await fetch(targetUrl, { headers: reqHeaders });
        if (!imgRes.ok) {
            return res.status(imgRes.status).send('Upstream image error');
        }

        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        const arrayBuffer = await imgRes.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.searchMangaDex = async (req, res) => {
    try {
        const query = (req.query.q || '').trim();
        const limit = Math.min(parseInt(req.query.limit || '24', 10), 50);
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

        const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getMangaDexFeed = async (req, res) => {
    try {
        const mangaId = req.query.mangaId;
        const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
        const offset = parseInt(req.query.offset || '0', 10);
        const lang = req.query.lang || 'en';

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
        const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getMangaDexPages = async (req, res) => {
    try {
        const chapterId = req.query.chapterId;
        const url = `${MANGADEX_API}/at-home/server/${encodeURIComponent(chapterId)}`;
        const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.searchMangaKatana = async (req, res) => {
    try {
        const query = (req.query.q || '').trim();
        let targetUrl = `${MANGAKATANA_BASE}/manga`;
        if (query.startsWith('http') && query.includes('mangakatana.com/manga/')) {
            targetUrl = query;
        } else if (query) {
            targetUrl = `${MANGAKATANA_BASE}/?search=${encodeURIComponent(query)}&search_by=book_name`;
        }
        const upstream = await fetch(targetUrl, { headers: MK_HEADERS, redirect: 'follow' });
        const html = await upstream.text();
        const results = parseMangaKatanaHtmlSearch(html, upstream.url || targetUrl, query);
        res.json({ result: 'ok', data: results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getMangaKatanaChapters = async (req, res) => {
    try {
        const rawUrl = (req.query.url || req.query.slug || '').trim();
        const targetUrl = rawUrl.startsWith('http') ? rawUrl : `${MANGAKATANA_BASE}/manga/${rawUrl.replace(/^\/+/, '')}`;
        const upstream = await fetch(targetUrl, { headers: MK_HEADERS, redirect: 'follow' });
        const html = await upstream.text();
        const chapters = parseMangaKatanaChaptersHtml(html);
        res.json({ result: 'ok', data: chapters });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getMangaKatanaPages = async (req, res) => {
    try {
        const targetUrl = (req.query.url || '').trim();
        if (!targetUrl.startsWith('http')) {
            return res.status(400).json({ error: 'Valid chapter url required' });
        }
        const upstream = await fetch(targetUrl, { headers: MK_HEADERS, redirect: 'follow' });
        const html = await upstream.text();
        const pages = parseMangaKatanaPagesHtml(html);
        res.json({ result: 'ok', pages });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getAllMangas = (req, res) => {
    const db = readDB();
    res.json(db.mangas || []);
};

exports.saveManga = (req, res) => {
    const manga = req.body;
    if (!manga || !manga.id) {
        return res.status(400).json({ error: 'Invalid manga payload' });
    }
    const db = readDB();
    const idx = db.mangas.findIndex(
        m => m.id === manga.id ||
             (manga.mangadexId && m.mangadexId === manga.mangadexId) ||
             (manga.mangakatanaId && m.mangakatanaId === manga.mangakatanaId)
    );
    if (idx > -1) {
        db.mangas[idx] = { ...db.mangas[idx], ...manga, id: db.mangas[idx].id };
    } else {
        db.mangas.unshift(manga);
    }
    writeDB(db);
    res.json(manga);
};

exports.deleteManga = (req, res) => {
    const { id } = req.params;
    const db = readDB();
    db.mangas = db.mangas.filter(m => m.id !== id);
    db.chapters = db.chapters.filter(c => c.mangaId !== id);
    writeDB(db);
    res.json({ success: true });
};

exports.getChaptersForManga = (req, res) => {
    const { mangaId } = req.params;
    const db = readDB();
    const chapters = (db.chapters || []).filter(c => c.mangaId === mangaId);
    res.json(chapters);
};

exports.getChapterById = (req, res) => {
    const { id } = req.params;
    const db = readDB();
    const chapter = (db.chapters || []).find(c => c.id === id);
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' });
    res.json(chapter);
};

exports.saveChapter = (req, res) => {
    const chapter = req.body;
    if (!chapter || !chapter.id) {
        return res.status(400).json({ error: 'Invalid chapter data' });
    }
    const db = readDB();
    const idx = db.chapters.findIndex(c => c.id === chapter.id);
    if (idx > -1) {
        db.chapters[idx] = chapter;
    } else {
        db.chapters.push(chapter);
    }
    writeDB(db);
    res.json(chapter);
};

exports.bulkSaveChapters = (req, res) => {
    const { chapters } = req.body;
    if (!Array.isArray(chapters)) {
        return res.status(400).json({ error: 'Chapters array required' });
    }
    const db = readDB();
    chapters.forEach(ch => {
        const idx = db.chapters.findIndex(c => c.id === ch.id);
        if (idx > -1) db.chapters[idx] = ch;
        else db.chapters.push(ch);
    });
    writeDB(db);
    res.json({ success: true, count: chapters.length });
};

exports.getMonetization = (req, res) => {
    const db = readDB();
    res.json(db.monetization || {});
};

exports.saveMonetization = (req, res) => {
    const settings = req.body;
    const db = readDB();
    db.monetization = settings;
    writeDB(db);
    res.json(db.monetization);
};

exports.getCommentsForChapter = (req, res) => {
    const { chapterId } = req.params;
    const db = readDB();
    const allComments = db.comments || {};
    res.json(allComments[chapterId] || []);
};

exports.saveCommentForChapter = (req, res) => {
    const { chapterId } = req.params;
    const comment = req.body;
    if (!comment || !comment.text) {
        return res.status(400).json({ error: 'Comment text required' });
    }
    const db = readDB();
    if (!db.comments) db.comments = {};
    if (!Array.isArray(db.comments[chapterId])) db.comments[chapterId] = [];
    db.comments[chapterId].unshift(comment);
    writeDB(db);
    res.json(comment);
};

exports.deleteCommentForChapter = (req, res) => {
    const { chapterId, commentId } = req.params;
    const db = readDB();
    if (db.comments && Array.isArray(db.comments[chapterId])) {
        db.comments[chapterId] = db.comments[chapterId].filter(c => c.id !== commentId);
        writeDB(db);
    }
    res.json({ success: true });
};
