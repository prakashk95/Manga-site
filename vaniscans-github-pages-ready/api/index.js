const crypto = require('crypto');

const ADMIN_USER_HASH = '059a50ce956b7ec61527c7ecc0c55b5a009dc54ab4acddce8852b46baa2aba30';
const ADMIN_PASS_HASH = '9109551a88284a2754a704d50d6636fc596ae718df126354742f1637940bbc5a';
const MANGADEX_API = 'https://api.mangadex.org';
const USER_AGENT = 'VaniScans/3.0 (+https://vaniscans.online)';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path = urlObj.pathname.replace(/^\/api/, '');
    const qs = Object.fromEntries(urlObj.searchParams.entries());

    try {
        // 1. Admin Auth
        if (req.method === 'POST' && path === '/auth/login') {
            const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
            const { userHash, passHash } = body;
            if (!userHash || !passHash || userHash.length !== 64 || passHash.length !== 64) {
                return res.status(400).json({ success: false });
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
            return res.status(401).json({ success: false });
        }

        // 2. Binary Image Proxy (/api/mangadex/img)
        if (req.method === 'GET' && path === '/mangadex/img') {
            const targetUrl = qs.url || '';
            if (!targetUrl || !targetUrl.startsWith('http')) {
                return res.status(400).send('Invalid url');
            }
            const imgRes = await fetch(targetUrl, {
                headers: {
                    'User-Agent': USER_AGENT,
                    'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
                }
            });
            if (!imgRes.ok) return res.status(imgRes.status).send('Upstream error');
            const ct = imgRes.headers.get('content-type') || 'image/jpeg';
            res.setHeader('Content-Type', ct);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            const ab = await imgRes.arrayBuffer();
            return res.status(200).send(Buffer.from(ab));
        }

        // 3. MangaDex Search (/api/mangadex/search)
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

        // 4. MangaDex Chapter Feed (/api/mangadex/feed)
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

        // 5. MangaDex At-Home Pages (/api/mangadex/pages)
        if (req.method === 'GET' && path === '/mangadex/pages') {
            const chapterId = qs.chapterId;
            const url = `${MANGADEX_API}/at-home/server/${encodeURIComponent(chapterId)}`;
            const upstream = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
            const data = await upstream.json();
            return res.status(upstream.status).json(data);
        }

        return res.status(404).json({ error: 'Endpoint not found' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};
