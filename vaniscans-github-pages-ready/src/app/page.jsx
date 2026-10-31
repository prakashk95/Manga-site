import HomeClient from './HomeClient';
import { getCatalog } from '@/lib/catalog';

// Pre-rendered on the server; refreshed at most once a minute
export const revalidate = 60;

export default async function HomePage() {
    let mangas = [];
    try {
        mangas = await getCatalog();
    } catch (_) {}

    // Send only what the homepage actually draws
    const slim = mangas.map(m => ({
        id: m.id,
        mangadexId: m.mangadexId,
        mangakatanaId: m.mangakatanaId,
        mangafireId: m.mangafireId,
        title: m.title,
        author: m.author,
        cover: m.cover,
        banner: m.banner,
        genres: m.genres,
        status: m.status,
        rating: m.rating,
        synopsis: (m.synopsis || '').slice(0, 180),
        latestChapters: (m.latestChapters || []).slice(0, 2),
        updatedAt: m.updatedAt
    }));

    return <HomeClient initialMangas={slim} />;
}
