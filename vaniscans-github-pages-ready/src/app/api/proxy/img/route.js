export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { NextResponse } from 'next/server';

const USER_AGENT = 'VaniScans/5.0 (+https://vaniscans.online)';
const MK_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': 'https://mangakatana.com/'
};

export async function GET(req) {
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get('url');
    if (!targetUrl || !targetUrl.startsWith('http')) {
        return new NextResponse('Missing valid image URL', { status: 400 });
    }

    try {
        const isKatana = !targetUrl.includes('mangadex.org');
        const imgRes = await fetch(targetUrl, {
            headers: {
                'User-Agent': isKatana ? MK_HEADERS['User-Agent'] : USER_AGENT,
                'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                'Referer': isKatana ? 'https://mangakatana.com/' : 'https://mangadex.org/'
            },
            cache: 'no-store'
        });
        if (!imgRes.ok) return new NextResponse('Upstream image error', { status: imgRes.status });

        const arrayBuffer = await imgRes.arrayBuffer();
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

        return new NextResponse(arrayBuffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'private, no-store, no-cache, must-revalidate',
                'Netlify-Vary': 'query'
            }
        });
    } catch (err) {
        return new NextResponse(err.message, { status: 500 });
    }
}
