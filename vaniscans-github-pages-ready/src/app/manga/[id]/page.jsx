import Navbar from '@/components/Navbar';
import { getDb, initDb } from '@/lib/db';
import Image from 'next/image';
import Link from 'next/link';
import { Bookmark, Star, BookOpen } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function MangaDetailPage({ params }) {
    const resolvedParams = await params;
    const mangaId = resolvedParams.id;

    let manga = null;
    let chapters = [];

    try {
        const db = getDb();
        await initDb();

        const mRes = await db.execute({
            sql: "SELECT * FROM mangas WHERE id = ? OR slug = ?",
            args: [mangaId, mangaId]
        });
        manga = mRes.rows[0];

        if (manga) {
            const cRes = await db.execute({
                sql: "SELECT * FROM chapters WHERE manga_id = ? ORDER BY chapter_number DESC",
                args: [manga.id]
            });
            chapters = cRes.rows;
        }
    } catch (err) {
        console.error("Error loading manga detail:", err);
    }

    if (!manga) {
        return (
            <div className="min-h-screen bg-dark-900 text-white">
                <Navbar />
                <div className="text-center py-20">
                    <h1 className="text-2xl font-bold">Manga not found</h1>
                    <Link href="/" className="text-blue-500 mt-4 inline-block underline">Return home</Link>
                </div>
            </div>
        );
    }

    const ratingAvg = manga.rating_count > 0 ? (manga.rating / manga.rating_count).toFixed(1) : '9.2';

    return (
        <div className="min-h-screen bg-dark-900 text-white flex flex-col">
            <Navbar />
            <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
                <div className="flex flex-col md:flex-row gap-6 bg-dark-800 border border-dark-700 rounded-xl p-6 relative overflow-hidden">
                    <div className="w-48 h-64 relative rounded-lg overflow-hidden shrink-0 mx-auto md:mx-0 shadow-lg bg-dark-900">
                        <Image
                            src={manga.cover || 'https://placehold.co/300x400?text=No+Cover'}
                            alt={manga.title}
                            fill
                            className="object-cover"
                        />
                    </div>
                    <div className="flex-1 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded uppercase">
                                    {manga.type || 'MANHWA'}
                                </span>
                                <span className="bg-dark-700 text-gray-300 text-xs px-2 py-0.5 rounded">
                                    {manga.status || 'Ongoing'}
                                </span>
                            </div>
                            <h1 className="text-2xl md:text-3xl font-black mb-3">{manga.title}</h1>
                            <div className="flex items-center gap-4 text-sm text-gray-300 mb-4">
                                <div className="flex items-center gap-1 text-yellow-400 font-bold">
                                    <Star className="w-4 h-4 fill-current" />
                                    <span>{ratingAvg}/10</span>
                                    <span className="text-gray-400 text-xs font-normal">({manga.rating_count || 128} votes)</span>
                                </div>
                            </div>
                            <p className="text-gray-300 text-sm leading-relaxed line-clamp-3 mb-6">
                                {manga.summary || 'Enjoy reading high quality manga and manhwa updates on VaniScans.'}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            {chapters.length > 0 && (
                                <Link
                                    href={`/read/${manga.id}?ch=${chapters[chapters.length - 1].chapter_number}`}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg text-sm flex items-center gap-2 transition"
                                >
                                    <BookOpen className="w-4 h-4" /> Start reading
                                </Link>
                            )}
                            <button className="bg-dark-700 hover:bg-dark-600 text-gray-200 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 transition border border-dark-600">
                                <Bookmark className="w-4 h-4" /> Follow
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mt-8 bg-dark-800 border border-dark-700 rounded-xl p-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span className="w-2 h-5 bg-blue-600 rounded-sm inline-block"></span>
                        Chapters ({chapters.length})
                    </h2>
                    <div className="max-h-96 overflow-y-auto space-y-2 pr-2">
                        {chapters.length === 0 ? (
                            <p className="text-sm text-gray-400 py-4 text-center">No chapters available yet.</p>
                        ) : (
                            chapters.map((ch) => (
                                <Link
                                    key={ch.id}
                                    href={`/read/${manga.id}?ch=${ch.chapter_number}`}
                                    className="flex items-center justify-between p-3 bg-dark-900/60 hover:bg-dark-700/60 border border-dark-700/60 rounded-lg transition text-sm"
                                >
                                    <span className="font-medium">Chapter {ch.chapter_number} {ch.title ? `- ${ch.title}` : ''}</span>
                                    <span className="text-xs text-gray-400">1h ago</span>
                                </Link>
                            ))
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}