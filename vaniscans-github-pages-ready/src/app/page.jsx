import Navbar from '@/components/Navbar';
import MangaCard from '@/components/MangaCard';
import Pagination from '@/components/Pagination';
import { getDb, initDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }) {
    const resolvedParams = await searchParams;
    const page = parseInt(resolvedParams?.page || '1', 10);
    const searchQuery = resolvedParams?.search || '';
    const limit = 30;
    const offset = (page - 1) * limit;

    let mangas = [];
    let totalPages = 1;

    try {
        const db = getDb();
        await initDb();

        let countQuery = "SELECT COUNT(*) as count FROM mangas";
        let countParams = [];
        let dataQuery = "SELECT * FROM mangas";
        let dataParams = [];

        if (searchQuery) {
            countQuery += " WHERE title LIKE ?";
            countParams.push(`%${searchQuery}%`);
            dataQuery += " WHERE title LIKE ?";
            dataParams.push(`%${searchQuery}%`);
        }

        dataQuery += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";
        dataParams.push(limit, offset);

        const countRes = await db.execute({ sql: countQuery, args: countParams });
        const totalCount = countRes.rows[0]?.count || 0;
        totalPages = Math.ceil(totalCount / limit) || 1;

        const res = await db.execute({ sql: dataQuery, args: dataParams });
        
        mangas = await Promise.all(res.rows.map(async (m) => {
            const chRes = await db.execute({
                sql: "SELECT chapter_number, published_at FROM chapters WHERE manga_id = ? ORDER BY chapter_number DESC LIMIT 1",
                args: [m.id]
            });
            const latest_chapter = chRes.rows[0] ? {
                chapter_number: chRes.rows[0].chapter_number,
                time_ago: '1h ago'
            } : { chapter_number: 1, time_ago: '1h ago' };

            return { ...m, latest_chapter };
        }));
    } catch (err) {
        console.error("Database fetch error:", err);
    }

    return (
        <div className="min-h-screen bg-dark-900 text-white flex flex-col">
            <Navbar />
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
                <div className="mb-6 flex items-center justify-between border-b border-dark-700 pb-3">
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <span className="w-2 h-6 bg-blue-600 rounded-sm inline-block"></span>
                        Latest Updates
                    </h1>
                    {searchQuery && (
                        <p className="text-sm text-gray-400">
                            Search results for &quot;<span className="text-white font-medium">{searchQuery}</span>&quot;
                        </p>
                    )}
                </div>

                {mangas.length === 0 ? (
                    <div className="text-center py-20 bg-dark-800/50 rounded-lg border border-dark-700">
                        <p className="text-gray-400">No manga found matching your query.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {mangas.map((manga) => (
                            <MangaCard key={manga.id} manga={manga} />
                        ))}
                    </div>
                )}

                <Pagination page={page} totalPages={totalPages} searchQuery={searchQuery} />
            </main>
            <footer className="bg-dark-800 border-t border-dark-700 py-6 text-center text-xs text-gray-500">
                <p>VaniScans &copy; 2026. Powered by Turso & Render.</p>
            </footer>
        </div>
    );
}