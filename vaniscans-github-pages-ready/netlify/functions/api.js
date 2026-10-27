const crypto = require('crypto');

const ADMIN_USER_HASH = '059a50ce956b7ec61527c7ecc0c55b5a009dc54ab4acddce8852b46baa2aba30';
const ADMIN_PASS_HASH = '9109551a88284a2754a704d50d6636fc596ae718df126354742f1637940bbc5a';
const MANGADEX_API = 'https://api.mangadex.org';
const MANGADEX_UPLOADS = 'https://uploads.mangadex.org';
const USER_AGENT = 'VaniScans/3.0 (+https://vaniscans.online)';

// Warm serverless memory store for Netlify (syncs with client DB)
let memoryDB = {
    mangas: [],
    chapters: [],
    monetization: {}
};

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

        // 2. Binary Image Proxy for MangaDex Pages & Covers (Bypasses ALL hotlink/CORS/ISP blocks!)
        if (event.httpMethod === 'GET' && path === '/mangadex/img') {
            let targetUrl = qs.url || '';
            if (qs.chapterId && qs.pageIndex !== undefined) {
                // Dynamically resolve fresh At-Home URL if requested by chapterId + pageIndex!
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

            const imgRes = await fetch(targetUrl, {
                headers: {
                    'User-Agent': USER_AGENT,
                    'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
                }
            });

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

        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Endpoint not found' }) };
    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message || 'Server error' })
        };
    }
};
