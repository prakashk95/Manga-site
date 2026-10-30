import { NextResponse } from 'next/server';
import { getDb, getCachedQuery, invalidateDbCache } from '@/lib/db';

export async function GET() {
    try {
        const mangas = await getCachedQuery('api_mangas_catalog', 60000, async () => {
            const db = await getDb();
            const rows = await db.execute('SELECT * FROM mangas ORDER BY updatedAt DESC');

            // Use SQLite json_array_length(pages) so we NEVER pull megabytes of raw image URLs just to count pages!
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

        return NextResponse.json(mangas, {
            headers: {
                'Cache-Control': 'public, max-age=15, s-maxage=30, stale-while-revalidate=300'
            }
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const db = await getDb();
        const manga = await req.json();
        if (!manga || !manga.id || !manga.title) {
            return NextResponse.json({ error: 'Invalid manga payload' }, { status: 400 });
        }

        let existing = await db.execute({ sql: 'SELECT * FROM mangas WHERE id = ?', args: [manga.id] });
        if (existing.rows.length === 0 && manga.mangadexId) {
            existing = await db.execute({ sql: 'SELECT * FROM mangas WHERE mangadexId = ?', args: [manga.mangadexId] });
        }
        if (existing.rows.length === 0 && manga.mangakatanaId) {
            existing = await db.execute({ sql: 'SELECT * FROM mangas WHERE mangakatanaId = ?', args: [manga.mangakatanaId] });
        }
        if (existing.rows.length === 0 && manga.mangafireId) {
            existing = await db.execute({ sql: 'SELECT * FROM mangas WHERE mangafireId = ?', args: [manga.mangafireId] });
        }

        const existingRow = existing.rows.length > 0 ? existing.rows[0] : null;
        const finalId = existingRow ? existingRow.id : manga.id;
        const genresJson = JSON.stringify(Array.isArray(manga.genres) ? manga.genres : ['Action']);
        const updatedAt = Number(manga.updatedAt) || Date.now();

        const metaTitle = typeof manga.metaTitle === 'string' && manga.metaTitle.trim()
            ? manga.metaTitle.trim()
            : (existingRow?.metaTitle || `Read ${manga.title} - VaniScans`);

        const metaDescription = typeof manga.metaDescription === 'string' && manga.metaDescription.trim()
            ? manga.metaDescription.trim()
            : (existingRow?.metaDescription || `Read ${manga.title} / ${manga.synopsis || 'Read online on VaniScans.'}`);

        await db.execute({
            sql: `INSERT INTO mangas (
                id, mangadexId, mangakatanaId, mangakatanaUrl, mangafireId,
                title, author, cover, banner, genres, status, rating, synopsis, updatedAt, metaTitle, metaDescription
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                mangadexId = excluded.mangadexId,
                mangakatanaId = excluded.mangakatanaId,
                mangakatanaUrl = excluded.mangakatanaUrl,
                mangafireId = excluded.mangafireId,
                title = excluded.title,
                author = excluded.author,
                cover = excluded.cover,
                banner = excluded.banner,
                genres = excluded.genres,
                status = excluded.status,
                rating = excluded.rating,
                synopsis = excluded.synopsis,
                updatedAt = excluded.updatedAt,
                metaTitle = excluded.metaTitle,
                metaDescription = excluded.metaDescription`,
            args: [
                finalId,
                manga.mangadexId || null,
                manga.mangakatanaId || null,
                manga.mangakatanaUrl || null,
                manga.mangafireId || null,
                manga.title,
                manga.author || 'Author Unknown',
                manga.cover || '',
                manga.banner || manga.cover || '',
                genresJson,
                manga.status || 'Ongoing',
                Number(manga.rating) || 9.8,
                manga.synopsis || '',
                updatedAt,
                metaTitle,
                metaDescription
            ]
        });

        invalidateDbCache();
        return NextResponse.json({ ...manga, id: finalId, metaTitle, metaDescription, updatedAt });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
