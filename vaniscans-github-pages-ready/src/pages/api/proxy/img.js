const USER_AGENT = 'VaniScans/6.0 (+https://vaniscans.online)';
const MK_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': 'https://mangakatana.com/'
};

export async function GET({ request }) {
    try {
        const url = new URL(request.url);
        const targetUrl = url.searchParams.get('url');

        if (!targetUrl || !targetUrl.startsWith('http')) {
            return new Response('Missing or invalid target URL', { status: 400 });
        }

        const isKatana = !targetUrl.includes('mangadex.org');
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'Referer': isKatana ? 'https://mangakatana.com/' : 'https://mangadex.org/'
        };

        // Try direct fetch first
        let imgRes = await fetch(targetUrl, { headers, signal: AbortSignal.timeout(8000) }).catch(() => null);

        // Fallback to wsrv.nl CDN proxy if direct fetch is blocked by Render IP restrictions
        if (!imgRes || !imgRes.ok) {
            imgRes = await fetch(`https://wsrv.nl/?url=${encodeURIComponent(targetUrl)}&output=webp`, {
                signal: AbortSignal.timeout(8000)
            }).catch(() => null);
        }

        if (!imgRes || !imgRes.ok) {
            return new Response('Upstream image load failed', { status: 502 });
        }

        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
        return new Response(imgRes.body, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=604800, s-maxage=604800, immutable',
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (err) {
        return new Response(`Proxy Error: ${err.message}`, { status: 500 });
    }
}
