import { getDb, getCachedQuery, getMangaSlug } from '@/lib/db';

function getChapterSlug(ch, index = 0) {
    if (!ch) return '1';
    if (typeof ch.number === 'number' && !isNaN(ch.number)) return String(ch.number);
    const match = (ch.title || '').match(/(\d+(\.\d+)?)/);
    return match ? match[1] : String(index + 1);
}

function escapeXml(unsafe = '') {
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export async function GET() {
    const baseUrl = 'https://vaniscans.online';
    const nowIso = new Date().toISOString();
    const staticPages = [
        { url: `${baseUrl}/`, lastMod: nowIso, changeFreq: 'hourly', priority: '1.0' },
        { url: `${baseUrl}/about`, lastMod: nowIso, changeFreq: 'monthly', priority: '0.5' },
        { url: `${baseUrl}/privacy`, lastMod: nowIso, changeFreq: 'monthly', priority: '0.4' },
        { url: `${baseUrl}/terms`, lastMod: nowIso, changeFreq: 'monthly', priority: '0.4' },
        { url: `${baseUrl}/dmca`, lastMod: nowIso, changeFreq: 'monthly', priority: '0.4' },
        { url: `${baseUrl}/contact`, lastMod: nowIso, changeFreq: 'monthly', priority: '0.5' },
    ];

    let dynamicEntries = [];
    try {
        dynamicEntries = await getCachedQuery('seo_sitemap_xml', 3600000, async () => {
            const db = await getDb();
            const mangaRes = await db.execute('SELECT * FROM mangas ORDER BY updatedAt DESC');
            const chRes = await db.execute('SELECT id, mangaId, title, number, createdAt FROM chapters ORDER BY number DESC');

            const mangas = mangaRes.rows || [];
            const chapters = chRes.rows || [];

            const slugByMangaId = {};
            const entries = [];

            for (const m of mangas) {
                const slug = getMangaSlug(m);
                slugByMangaId[m.id] = slug;
                entries.push({
                    url: `${baseUrl}/comics/${slug}`,
                    lastMod: m.updatedAt ? new Date(Number(m.updatedAt)).toISOString() : nowIso,
                    changeFreq: 'daily',
                    priority: '0.9',
                });
            }

            for (let i = 0; i < chapters.length; i++) {
                const c = chapters[i];
                const mSlug = slugByMangaId[c.mangaId];
                if (!mSlug) continue;
                const chSlug = getChapterSlug(c, i);
                entries.push({
                    url: `${baseUrl}/comics/${mSlug}/chapter/${chSlug}`,
                    lastMod: c.createdAt ? new Date(Number(c.createdAt)).toISOString() : nowIso,
                    changeFreq: 'weekly',
                    priority: '0.8',
                });
            }

            return entries;
        });
    } catch (_) {}

    const allEntries = [...staticPages, ...dynamicEntries];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allEntries.map(e => `  <url>
    <loc>${escapeXml(e.url)}</loc>
    <lastmod>${e.lastMod}</lastmod>
    <changefreq>${e.changeFreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    return new Response(xml, {
        status: 200,
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600'
        }
    });
}
