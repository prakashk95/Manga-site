import { getDb, getCachedQuery } from '@/lib/db';

export const revalidate = 3600;

function getMangaSlug(m) {
    if (!m) return 'series';
    const base = (m.title || 'series').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const hash = (m.mangadexId || m.mangakatanaId || m.mangafireId || m.id || '').replace(/^manga-(md|mk|mf)-/, '').slice(0, 8).toLowerCase();
    return hash ? `${base}-${hash}` : base;
}

function getChapterSlug(ch, index = 0) {
    if (!ch) return '1';
    if (typeof ch.number === 'number' && !isNaN(ch.number)) return String(ch.number);
    const match = (ch.title || '').match(/(\d+(\.\d+)?)/);
    return match ? match[1] : String(index + 1);
}

export default async function sitemap() {
    const baseUrl = 'https://vaniscans.online';
    const staticPages = [
        { url: `${baseUrl}/`, lastModified: new Date(), changeFrequency: 'hourly', priority: 1.0 },
        { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
        { url: `${baseUrl}/privacy`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
        { url: `${baseUrl}/terms`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
        { url: `${baseUrl}/dmca`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
        { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    ];

    try {
        const dynamicEntries = await getCachedQuery('seo_sitemap_xml', 3600000, async () => {
            const db = await getDb();
            const mangaRes = await db.execute('SELECT id, mangadexId, mangakatanaId, mangafireId, title, updatedAt FROM mangas ORDER BY updatedAt DESC');
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
                    lastModified: m.updatedAt ? new Date(Number(m.updatedAt)) : new Date(),
                    changeFrequency: 'daily',
                    priority: 0.9,
                });
            }

            for (let i = 0; i < chapters.length; i++) {
                const c = chapters[i];
                const mSlug = slugByMangaId[c.mangaId];
                if (!mSlug) continue;
                const chSlug = getChapterSlug(c, i);
                entries.push({
                    url: `${baseUrl}/comics/${mSlug}/chapter/${chSlug}`,
                    lastModified: c.createdAt ? new Date(Number(c.createdAt)) : new Date(),
                    changeFrequency: 'weekly',
                    priority: 0.8,
                });
            }

            return entries;
        });

        return [...staticPages, ...dynamicEntries];
    } catch (_) {
        return staticPages;
    }
}
