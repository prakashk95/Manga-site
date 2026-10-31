export async function GET() {
    const body = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /Fang-creater

Sitemap: https://vaniscans.online/sitemap.xml
Host: https://vaniscans.online
`;
    return new Response(body, {
        status: 200,
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=86400'
        }
    });
}
