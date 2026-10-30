'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Bookmark, Shuffle, Menu, X } from 'lucide-react';

export default function Navbar({
    searchQuery = '',
    onSearchChange = null,
    showBookmarksOnly = false,
    onToggleBookmarks = null,
    onRandomManga = null
}) {
    const router = useRouter();
    const [localSearch, setLocalSearch] = useState(searchQuery);
    const [mobileOpen, setMobileOpen] = useState(false);

    const activeSearch = onSearchChange ? searchQuery : localSearch;

    const handleInput = (val) => {
        if (onSearchChange) {
            onSearchChange(val);
        } else {
            setLocalSearch(val);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!onSearchChange) {
            const q = localSearch.trim();
            router.push(q ? `/?q=${encodeURIComponent(q)}` : '/');
        }
    };

    return (
        <header className="sticky top-0 z-50 bg-[#0e1726]/95 backdrop-blur-md border-b border-[#1e293b]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
                <Link
                    href="/"
                    onClick={() => {
                        if (onSearchChange) onSearchChange('');
                        if (onToggleBookmarks && showBookmarksOnly) onToggleBookmarks(false);
                    }}
                    className="flex items-center gap-2.5 shrink-0 group"
                >
                    <div className="w-9 h-9 rounded-lg bg-[#1d9bf0] flex items-center justify-center text-white font-black text-lg shadow-md shadow-[#1d9bf0]/20 group-hover:scale-105 transition">
                        V
                    </div>
                    <div className="flex flex-col leading-none">
                        <span className="text-lg font-black tracking-tight text-white">
                            Vani<span className="text-[#1d9bf0]">Scans</span>
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase">
                            Read Manga Online
                        </span>
                    </div>
                </Link>

                <form onSubmit={handleSubmit} className="flex-1 max-w-xl mx-auto relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                        type="text"
                        value={activeSearch}
                        onChange={(e) => handleInput(e.target.value)}
                        placeholder="Search titles, authors, genres across all pages..."
                        className="w-full bg-[#172336] border border-[#24344d] focus:border-[#1d9bf0] text-slate-100 placeholder:text-slate-400 text-xs sm:text-sm rounded-lg pl-10 pr-14 py-2 outline-none transition"
                    />
                    {activeSearch ? (
                        <button
                            type="button"
                            onClick={() => handleInput('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-[#0e1726]"
                        >
                            Clear
                        </button>
                    ) : (
                        <span className="hidden sm:inline-block absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 bg-[#0e1726] px-1.5 py-0.5 rounded border border-[#24344d]">
                            ⌘K
                        </span>
                    )}
                </form>

                <div className="flex items-center gap-2 shrink-0">
                    {onRandomManga && (
                        <button
                            type="button"
                            onClick={onRandomManga}
                            title="Random Series"
                            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-[#172336] transition"
                        >
                            <Shuffle className="w-4 h-4" />
                        </button>
                    )}

                    {onToggleBookmarks ? (
                        <button
                            type="button"
                            onClick={() => onToggleBookmarks(!showBookmarksOnly)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition ${
                                showBookmarksOnly
                                    ? 'bg-[#1d9bf0] text-white border-[#1d9bf0]'
                                    : 'bg-[#172336] text-slate-200 border-[#24344d] hover:border-slate-500'
                            }`}
                        >
                            <Bookmark className={`w-3.5 h-3.5 ${showBookmarksOnly ? 'fill-current' : ''}`} />
                            <span className="hidden sm:inline">Bookmarks</span>
                        </button>
                    ) : (
                        <Link
                            href="/?bookmarks=1"
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-[#172336] text-slate-200 border border-[#24344d] hover:border-slate-500 transition"
                        >
                            <Bookmark className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Bookmarks</span>
                        </Link>
                    )}

                    <button
                        type="button"
                        onClick={() => setMobileOpen(!mobileOpen)}
                        className="sm:hidden p-2 rounded-lg bg-[#172336] text-slate-300 border border-[#24344d]"
                    >
                        {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {mobileOpen && (
                <div className="sm:hidden bg-[#0e1726] border-b border-[#1e293b] px-4 py-3 flex flex-wrap gap-2">
                    <Link
                        href="/"
                        onClick={() => setMobileOpen(false)}
                        className="px-3 py-1.5 rounded-lg bg-[#172336] text-xs font-semibold text-slate-200"
                    >
                        Latest Updates
                    </Link>
                    {onToggleBookmarks && (
                        <button
                            type="button"
                            onClick={() => {
                                onToggleBookmarks(!showBookmarksOnly);
                                setMobileOpen(false);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#172336] text-xs font-semibold text-slate-200 flex items-center gap-1"
                        >
                            <Bookmark className="w-3.5 h-3.5" /> Bookmarks
                        </button>
                    )}
                </div>
            )}
        </header>
    );
}
