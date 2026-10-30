import Link from 'next/link';

export default function Pagination({ page, totalPages, searchQuery }) {
    const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
    if (totalPages <= 1) return null;

    return (
        <div className="flex items-center justify-center gap-4 my-8">
            {page > 1 ? (
                <Link
                    href={`/?page=${page - 1}${searchParam}`}
                    className="px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm hover:bg-dark-700 transition"
                >
                    &larr; Prev page
                </Link>
            ) : (
                <span className="px-4 py-2 bg-dark-800/40 border border-dark-700/40 rounded-lg text-sm text-gray-600 cursor-not-allowed">
                    &larr; Prev page
                </span>
            )}
            <span className="text-sm text-gray-400">
                Page <strong className="text-white">{page}</strong> of <strong className="text-white">{totalPages}</strong>
            </span>
            {page < totalPages ? (
                <Link
                    href={`/?page=${page + 1}${searchParam}`}
                    className="px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm hover:bg-dark-700 transition"
                >
                    Next page &rarr;
                </Link>
            ) : (
                <span className="px-4 py-2 bg-dark-800/40 border border-dark-700/40 rounded-lg text-sm text-gray-600 cursor-not-allowed">
                    Next page &rarr;
                </span>
            )}
        </div>
    );
}