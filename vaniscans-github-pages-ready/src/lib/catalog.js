import { getDb, getCachedQuery } from '@/lib/db';

// Shared by the homepage (server component) and /api/mangas
export async function getCatalog() {
    return getCachedQuery('api_mangas_catalog', 60000, async () => {
        const db = await getDb();
        const rows = await db.execute('SELECT * FROM mangas ORDER BY updatedAt DESC');

        let chaptersByMangaId = {};
        try {
            const chRows = await db.execute(
                'SELECT id, mangaId, title, number, CASE WHEN json_valid(pages) THEN json_array_length(pages) ELSE 0 END as pageCount, createdAt FROM chapters ORDER BY number DESC'
            );
            for (const c of (chRows.rows || [])) {
                const mId = c.mangaId;
                if (!mId) continue;
                if (!chaptersByMangaId[mId]) chaptersByMangaId[mId] = [];
                if (chaptersByMangaId[mId].length < 3) {
                    chaptersByMangaId[mId].push({
                        id: c.id,
                        mangaId: mId,
                        title: c.title || `Chapter ${c.number || 1}`,
                        number: Number(c.number) || 1,
                        pageCount: Number(c.pageCount) || 0,
                        createdAt: Number(c.createdAt) || Date.now()
                    });
                }
            }
        } catch (_) {}

        return rows.rows.map(r => {
            let genres = ['Action'];
            try { genres = JSON.parse(r.genres); } catch (_) {}
            return {
                id: r.id,
                mangadexId: r.mangadexId || null,
                mangakatanaId: r.mangakatanaId || null,
                mangakatanaUrl: r.mangakatanaUrl || null,
                mangafireId: r.mangafireId || null,
                title: r.title,
                author: r.author || 'Author Unknown',
                cover: r.cover || '',
                banner: r.banner || r.cover || '',
                genres: Array.isArray(genres) ? genres : ['Action'],
                status: r.status || 'Ongoing',
                rating: Number(r.rating) || 9.8,
                synopsis: r.synopsis || '',
                metaTitle: r.metaTitle || '',
                metaDescription: r.metaDescription || '',
                latestChapters: chaptersByMangaId[r.id] || [],
                updatedAt: Number(r.updatedAt) || Date.now()
            };
        });
    });
}
