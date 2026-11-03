export async function GET({ request }) {
    try {
        const url = new URL(request.url);
        let targetUrl = (url.searchParams.get('url') || '').trim();
        const mode = url.searchParams.get('mode') || '';
        const source = url.searchParams.get('source') || '';
        const chapterUrl = url.searchParams.get('chapterUrl') || '';

        if (targetUrl.startsWith('//')) {
            targetUrl = `https:${targetUrl}`;
        }

        if (!targetUrl || !targetUrl.startsWith('http')) {
            return new Response('Missing or invalid target URL', { status: 400 });
        }

        const isFanfox =
            source === 'fanfox' ||
            targetUrl.includes('fanfox.net') ||
            targetUrl.includes('zjcdn.com') ||
            targetUrl.includes('mfcdn') ||
            targetUrl.includes('mangafox') ||
            chapterUrl.includes('fanfox.net');

        let referer = 'https://mangakatana.com/';
        if (isFanfox) {
            referer = 'https://fanfox.net/';
        } else if (
            source === 'mgeko' ||
            targetUrl.includes('mgeko.cc') ||
            targetUrl.includes('imgsrv') ||
            chapterUrl.includes('mgeko.cc')
        ) {
            referer = 'https://www.mgeko.cc/';
        } else if (
            source === 'comix' ||
            targetUrl.includes('comix.to') ||
            chapterUrl.includes('comix.to')
        ) {
            referer = 'https://comix.to/';
        } else if (targetUrl.includes('mangadex.org')) {
            referer = 'https://mangadex.org/';
        } else if (source === 'mangafire' || targetUrl.includes('mangafire')) {
            referer = 'https://mangafire.to/';
        }

        if (mode === 'html') {
            const htmlRes = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cookie': 'isAdult=1',
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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'Referer': referer
        };

        const tryFetchImage = async (u) => {
            let res = await fetch(u, { headers, redirect: 'follow', signal: AbortSignal.timeout(8000) }).catch(() => null);
            // fmcdn.mfcdn.net often fails TLS handshake over https://; retry over http://
            if ((!res || !res.ok) && isFanfox && u.startsWith('https://')) {
                const httpUrl = u.replace(/^https:\/\//i, 'http://');
                res = await fetch(httpUrl, { headers, redirect: 'follow', signal: AbortSignal.timeout(8000) }).catch(() => null);
            }
            // Fallback to wsrv.nl CDN proxy (use http:// for mfcdn so wsrv.nl avoids SSL cert error)
            if (!res || !res.ok) {
                const wsrvTarget = isFanfox ? u.replace(/^https:\/\//i, 'http://') : u;
                res = await fetch(
                    `https://wsrv.nl/?url=${encodeURIComponent(wsrvTarget)}&output=webp`,
                    { headers: { 'User-Agent': headers['User-Agent'] }, signal: AbortSignal.timeout(8000) }
                ).catch(() => null);
            }
            return res && res.ok ? res : null;
        };

        let imgRes = await tryFetchImage(targetUrl);

        // If a FanFox cover token (?token=...&ttl=...) expired and chapterUrl (manga page) was provided,
        // scrape the fresh cover URL from the FanFox manga page.
        if (!imgRes && isFanfox && chapterUrl && chapterUrl.includes('fanfox.net/manga/')) {
            try {
                const pageRes = await fetch(chapterUrl, {
                    headers: {
                        'User-Agent': headers['User-Agent'],
                        'Accept': 'text/html,application/xhtml+xml',
                        'Cookie': 'isAdult=1',
                        'Referer': 'https://fanfox.net/'
                    },
                    signal: AbortSignal.timeout(8000)
                });
                if (pageRes.ok) {
                    const html = await pageRes.text();
                    const m =
                        html.match(/<img[^>]+class="[^"]*detail-info-cover-img[^"]*"[^>]+(?:data-src|src)=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]+property="og:image"[^>]+content=["']([^"']+)["']/i);
                    if (m && m[1]) {
                        let freshCover = m[1].trim().replace(/&amp;/g, '&');
                        if (freshCover.startsWith('//')) freshCover = `https:${freshCover}`;
                        if (freshCover.startsWith('http') && freshCover !== targetUrl) {
                            imgRes = await tryFetchImage(freshCover);
                        }
                    }
                }
            } catch (_) {}
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
