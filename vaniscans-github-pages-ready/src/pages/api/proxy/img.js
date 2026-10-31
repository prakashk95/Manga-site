const USER_AGENT = 'VaniScans/6.0 (+https://vaniscans.online)';
const MK_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': 'https://mangakatana.com/'
};

export async function GET({ request }) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    if (!targetUrl || !targetUrl.startsWith('http')) {
        return new Response('Missing valid image URL', { status: 400 });
    }

    // List of resilient fallback strategies to fetch blocked manga images
    const fetchStrategies = [
        // Strategy 1: Direct fetch with spoofed MangaKatana/MangaDex headers
        async () => {
            const isKatana = !targetUrl.includes('mangadex.org');
            return await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                    'Referer': isKatana ? 'https://mangakatana.com/' : 'https://mangadex.org/'
                },
                signal: AbortSignal.timeout(8000)
            });
        },
        // Strategy 2: wsrv.nl image CDN proxy (bypasses cloud server IP blocks completely)
        async () => {
            return await fetch(`https://wsrv.nl/?url=${encodeURIComponent(targetUrl)}&output=webp`, {
                signal: AbortSignal.timeout(8000)
            });
        },
        // Strategy 3: AllOrigins proxy relay
        async () => {
            return await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, {
                signal: AbortSignal.timeout(8000)
            });
        }
    ];

    for (const strategy of fetchStrategies) {
        try {
            const imgRes = await strategy();
            if (imgRes && imgRes.ok) {
                const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
                return new Response(imgRes.body, {
                    status: 200,
                    headers: {
                        'Content-Type': contentType,
                        'Cache-Control': 'public, max-age=604800, s-maxage=604800, immutable',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
        } catch (_) {
            // Try next strategy
        }
    }

    return new Response('All image proxy strategies failed', { status: 500 });
}
