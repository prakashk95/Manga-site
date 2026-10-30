'use client';

import React from 'react';
import Link from 'next/link';
import { Bookmark, BookOpen } from 'lucide-react';

export default function MangaCard({
    manga,
    mangaSlug,
    latestChapter,
    chapterSlug,
    relativeTime,
    isBookmarked,
    onToggleBookmark
}) {
    const typeLabel =
        Array.isArray(manga.genres) && manga.genres.some(g => /manhua/i.test(g))
            ? 'MANHUA'
            : Array.isArray(manga.genres) && manga.genres.some(g => /manga/i.test(g))
            ? 'MANGA'
            : 'MANHWA';

    const chNumDisplay = latestChapter
        ? `Ch. ${latestChapter.number !== undefined ? latestChapter.number : 1}`
        : 'Ch. 1';

    return (
        <div className="group relative flex bg-[#142033] hover:bg-[#192841] border border-[#1f304d] hover:border-[#2c446b] rounded-xl overflow-hidden transition-all duration-200 h-[132px] sm:h-[142px]">
            <Link
                href={`/comics/${mangaSlug}`}
                className="relative w-[92px] sm:w-[100px] h-full shrink-0 overflow-hidden bg-[#0e1726] block"
            >
                <img
                    src={manga.cover || 'https://placehold.co/300x420/142033/38bdf8?text=No+Cover'}
                    alt={manga.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
            </Link>

            <div className="flex-1 min-w-0 p-3 sm:p-3.5 flex flex-col justify-between">
                <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-400/90">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                            {typeLabel}
                        </span>

                        <button
                            type="button"
                            onClick={(e) => onToggleBookmark(e, manga.id)}
                            title={isBookmarked ? 'Remove Bookmark' : 'Bookmark Series'}
                            className={`p-1 rounded hover:bg-white/10 transition ${
                                isBookmarked ? 'text-[#1d9bf0]' : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-current' : ''}`} />
                        </button>
                    </div>

                    <Link
                        href={`/comics/${mangaSlug}`}
                        className="text-xs sm:text-sm font-bold text-slate-100 hover:text-[#38bdf8] transition line-clamp-2 leading-snug"
                    >
                        {manga.title}
                    </Link>
                </div>

                <div className="pt-2 border-t border-[#1f304d]/80 flex items-center justify-between gap-2 text-xs">
                    {latestChapter ? (
                        <Link
                            href={`/comics/${mangaSlug}/chapter/${chapterSlug}`}
                            className="inline-flex items-center gap-1.5 text-[#38bdf8] hover:text-white font-semibold truncate transition"
                        >
                            <BookOpen className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{chNumDisplay}</span>
                        </Link>
                    ) : (
                        <Link
                            href={`/comics/${mangaSlug}`}
                            className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white font-medium truncate transition"
                        >
                            <BookOpen className="w-3.5 h-3.5 shrink-0" />
                            <span>View Series</span>
                        </Link>
                    )}

                    <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
                        {relativeTime}
                    </span>
                </div>
            </div>
        </div>
    );
}
