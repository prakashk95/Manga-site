import { NextResponse } from 'next/server';

const USER_AGENT = 'VaniScans/5.0 (+https://vaniscans.online)';
const MK_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': 'https://mangakatana.com/'
};

function isBlockedHost(hostname) {
    const h = hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return true;
    if (h === '::1' || h.startsWith('[')) return true;
    return false;
}

export async function GET(req) {
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get('url');
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        return new NextResponse('Missing valid image URL', { status: 400 });
    }

    let parsed;
    try { parsed = new URL(targetUrl); } catch (_) {
        return new NextResponse('Bad URL', { status: 400 });
    }
    if (isBlockedHost(parsed.hostname)) {
        return new NextResponse('Blocked host', { status: 403 });
    }

    try {
        const isKatana = !targetUrl.includes('mangadex.org');
        const imgRes = await fetch(targetUrl, {
            headers: {
                'User-Agent': isKatana ? MK_HEADERS['User-Agent'] : USER_AGENT,
                'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                'Referer': isKatana ? 'https://mangakatana.com/' : 'https://mangadex.org/'
            }
        });
        if (!imgRes.ok || !imgRes.body) return new NextResponse('Upstream image error', { status: imgRes.status || 502 });

        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
        if (!contentType.startsWith('image/')) {
            return new NextResponse('Not an image', { status: 415 });
        }

        // Stream straight through (no buffering) and let the CDN/browser cache it
        return new Response(imgRes.body, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
                'Netlify-Vary': 'query'
            }
        });
    } catch (err) {
        return new NextResponse(err.message, { status: 500 });
    }
}
