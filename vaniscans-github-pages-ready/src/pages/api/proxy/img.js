export async function GET({ request }) {
    try {
        const url = new URL(request.url);
        const targetUrl = url.searchParams.get('url');
        const mode = url.searchParams.get('mode') || '';
        const source = url.searchParams.get('source') || '';
        const chapterUrl = url.searchParams.get('chapterUrl') || '';

        if (!targetUrl || !targetUrl.startsWith('http')) {
            return new Response('Missing or invalid target URL', { status: 400 });
        }

        let referer = 'https://mangakatana.com/';
        if (
            source === 'manhuaus' ||
            targetUrl.includes('manhuaus') ||
            chapterUrl.includes('manhuaus.club')
        ) {
            referer = 'https://manhuaus.club/';
        } else if (targetUrl.includes('mangadex.org')) {
            referer = 'https://mangadex.org/';
        } else if (source === 'mangafire' || targetUrl.includes('mangafire')) {
            referer = 'https://mangafire.to/';
        }

        if (mode === 'html') {
            const htmlRes = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': referer
                },
                redirect: 'follow',
                signal: AbortSignal.timeout(10000)
            }).catch(() => null);

            if (!htmlRes || !htmlRes.ok) {
                return new Response('Upstream HTML fetch failed', { status: 502 });
            }
            const htmlText = await htmlRes.text();
            return new Response(htmlText, {
                status: 200,
                headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cache-Control': 'no-store',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'Referer': referer
        };

        // Try direct fetch first
        let imgRes = await fetch(targetUrl, { headers, signal: AbortSignal.timeout(8000) }).catch(() => null);

        // Fallback to wsrv.nl CDN proxy if direct fetch is blocked by IP restrictions
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
