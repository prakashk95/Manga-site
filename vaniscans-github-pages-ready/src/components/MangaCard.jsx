import Link from 'next/link';
import Image from 'next/image';

export default function MangaCard({ manga }) {
    return (
        <div className="bg-dark-800 border border-dark-700 rounded-lg overflow-hidden flex flex-col hover:border-blue-500/50 transition group">
            <Link href={`/manga/${manga.id}`} className="relative aspect-[3/4] block overflow-hidden bg-dark-900">
                <Image
                    src={manga.cover || 'https://placehold.co/300x400?text=No+Cover'}
                    alt={manga.title}
                    fill
                    sizes="(max-width: 768px) 50vw, 20vw"
                    className="object-cover group-hover:scale-105 transition duration-300"
                />
                <span className="absolute top-2 left-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                    {manga.type || 'MANHWA'}
                </span>
            </Link>
            <div className="p-3 flex flex-col flex-1 justify-between">
                <div>
                    <Link href={`/manga/${manga.id}`} className="font-semibold text-sm line-clamp-1 hover:text-blue-400 transition">
                        {manga.title}
                    </Link>
                </div>
                {manga.latest_chapter && (
                    <div className="mt-2 pt-2 border-t border-dark-700/60 flex items-center justify-between text-xs text-gray-400">
                        <span className="hover:text-white cursor-pointer truncate">
                            Ch. {manga.latest_chapter.chapter_number}
                        </span>
                        <span className="text-[11px] text-gray-500 whitespace-nowrap ml-2">
                            {manga.latest_chapter.time_ago || '1h ago'}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}