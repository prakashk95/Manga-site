const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '../data/manga.json');
const ADMIN_USER_HASH = '059a50ce956b7ec61527c7ecc0c55b5a009dc54ab4acddce8852b46baa2aba30';
const ADMIN_PASS_HASH = '9109551a88284a2754a704d50d6636fc596ae718df126354742f1637940bbc5a';
const MANGADEX_API = 'https://api.mangadex.org';
const USER_AGENT = 'VaniScans/3.0 (+https://vaniscans.online)';

function readDB() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            return { mangas: [], chapters: [], monetization: {} };
        }
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        console.error('Error reading manga.json:', err);
        return { mangas: [], chapters: [], monetization: {} };
    }
}

function writeDB(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

exports.verifyAdminLogin = (req, res) => {
    const { userHash, passHash } = req.body;
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

        const imgRes = await fetch(targetUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
            }
        });

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
        m => m.id === manga.id || (manga.mangadexId && m.mangadexId === manga.mangadexId)
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
