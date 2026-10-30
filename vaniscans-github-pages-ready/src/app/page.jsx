'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import MangaCard from '@/components/MangaCard';
import Pagination from '@/components/Pagination';
import { mergeMonetization } from '@/lib/monetization';
import { fetchAndSyncMangas, fetchAndSyncChapters } from '@/lib/clientStorage';
import { Flame, Star } from 'lucide-react';

const ITEMS_PER_PAGE = 30;

export default function HomePage() {
    const router = useRouter();
    const [mangas, setMangas] = useState([]);
    const [chaptersByManga, setChaptersByManga] = useState({});
    const [loadingCatalog, setLoadingCatalog] = useState(true);
    const [bookmarks, setBookmarks] = useState([]);
    const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

    const [tabMode, setTabMode] = useState('new');
    const [typeFilter, setTypeFilter] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const p = parseInt(params.get('page') || '1', 10);
            if (!isNaN(p) && p >= 1) setCurrentPage(p);
            const q = params.get('q') || params.get('search') || '';
            if (q) setSearchQuery(q);
            if (params.get('bookmarks') === '1') setShowBookmarksOnly(true);
        }

        try {
            const savedBm = JSON.parse(localStorage.getItem('vaniscans_bookmarks') || '[]');
            setBookmarks(savedBm);
        } catch (_) {}

        fetch('/api/monetization')
            .then(r => r.json())
            .then(data => {
                const m = mergeMonetization(data);
                if (m.gaEnabled && m.gaMeasurementId) {
                    const id = m.gaMeasurementId.trim();
                    if (!document.getElementById('vaniscans-ga-script')) {
                        const s1 = document.createElement('script');
                        s1.id = 'vaniscans-ga-script';
                        s1.async = true;
                        s1.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
                        document.head.appendChild(s1);

                        const s2 = document.createElement('script');
                        s2.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id.replace(/'/g, "\\'")}');`;
                        document.head.appendChild(s2);
                    }
                }
            })
            .catch(() => {});

        try {
            const cachedRaw = JSON.parse(localStorage.getItem('vaniscans_persistent_mangas_v4') || '[]');
            if (Array.isArray(cachedRaw) && cachedRaw.length > 0) {
                const cachedChMap = {};
                for (const cm of cachedRaw) {
                    if (Array.isArray(cm.latestChapters) && cm.latestChapters.length > 0) {
                        cachedChMap[cm.id] = cm.latestChapters;
                    }
                }
                setChaptersByManga(prev => ({ ...cachedChMap, ...prev }));
                setMangas(cachedRaw);
                setLoadingCatalog(false);
            }
        } catch (_) {}

        fetchAndSyncMangas()
            .then(async (data) => {
                if (Array.isArray(data)) {
                    const initialChMap = {};
                    const missingIds = [];

                    for (const m of data) {
                        if (Array.isArray(m.latestChapters) && m.latestChapters.length > 0) {
                            initialChMap[m.id] = m.latestChapters;
                        } else {
                            missingIds.push(m.id);
                        }
                    }

                    setChaptersByManga(initialChMap);
                    setMangas(data);
                    setLoadingCatalog(false);

                    if (missingIds.length > 0) {
                        await Promise.all(
                            missingIds.map(async (mId) => {
                                try {
                                    const chs = await fetchAndSyncChapters(mId);
                                    if (Array.isArray(chs) && chs.length > 0) {
                                        chs.sort((a, b) => (Number(b.number) || 0) - (Number(a.number) || 0));
                                        setChaptersByManga(prev => ({ ...prev, [mId]: chs }));
                                    }
                                } catch (_) {}
                            })
                        );
                    }
                } else {
                    setLoadingCatalog(false);
                }
            })
            .catch(() => setLoadingCatalog(false));

        const handleKeyDown = (e) => {
            if ((e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) || (e.altKey && (e.key === 'a' || e.key === 'A'))) {
                e.preventDefault();
                window.location.href = '/Fang-creater';
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const isBookmarked = (id) => bookmarks.includes(id);

    const toggleBookmark = (e, id) => {
        e.preventDefault();
        e.stopPropagation();
        let next = [...bookmarks];
        if (next.includes(id)) {
            next = next.filter(b => b !== id);
        } else {
            next.push(id);
        }
        setBookmarks(next);
        localStorage.setItem('vaniscans_bookmarks', JSON.stringify(next));
    };

    const getMangaSlug = (m) => {
        if (!m) return 'series';
        const base = (m.title || 'series').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const hash = (m.mangadexId || m.mangakatanaId || m.mangafireId || m.id || '').replace(/^manga-(md|mk|mf)-/, '').slice(0, 8);
        return hash ? `${base}-${hash}` : base;
    };

    const getChapterSlug = (ch, fallbackIndex = 1) => {
        if (!ch) return String(fallbackIndex);
        if (typeof ch.number === 'number' && !isNaN(ch.number)) return String(ch.number);
        const match = (ch.title || '').match(/(\d+(\.\d+)?)/);
        return match ? match[1] : String(fallbackIndex);
    };

    const getRelativeTime = (timestamp) => {
        if (!timestamp) return '1h ago';
        const diff = (Date.now() - Number(timestamp)) / 1000;
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    };

    const formatRatingOut10 = (r, count) => {
        if (!count || count <= 0 || !r || Number(r) <= 0) return '0/10';
        const num = Math.round(Number(r) * 10) / 10;
        return Number.isInteger(num) ? `${num}/10` : `${num.toFixed(1)}/10`;
    };

    const filteredMangas = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return mangas
            .filter(m => {
                if (showBookmarksOnly && !bookmarks.includes(m.id)) return false;
                if (typeFilter !== 'All') {
                    const genresList = Array.isArray(m.genres) ? m.genres : [];
                    const matchesGenre = genresList.some(g => g.toLowerCase() === typeFilter.toLowerCase());
                    if (!matchesGenre && typeFilter !== 'Manhwa') return false;
                }
                if (q) {
                    const titleMatch = (m.title || '').toLowerCase().includes(q);
                    const authorMatch = (m.author || '').toLowerCase().includes(q);
                    const genreMatch = Array.isArray(m.genres) && m.genres.some(g => g.toLowerCase().includes(q));
                    if (!titleMatch && !authorMatch && !genreMatch) return false;
                }
                return true;
            })
            .sort((a, b) => {
                if (tabMode === 'hot') {
                    const rDiff = (Number(b.rating) || 0) - (Number(a.rating) || 0);
                    if (rDiff !== 0) return rDiff;
                }
                const aChTime = (chaptersByManga[a.id]?.[0]?.createdAt) || a.updatedAt || 0;
                const bChTime = (chaptersByManga[b.id]?.[0]?.createdAt) || b.updatedAt || 0;
                return Number(bChTime) - Number(aChTime);
            });
    }, [mangas, chaptersByManga, showBookmarksOnly, bookmarks, typeFilter, searchQuery, tabMode]);

    const trendingMangas = useMemo(() => {
        return [...mangas]
            .sort((a, b) => {
                const countDiff = (Number(b.ratingCount) || 0) - (Number(a.ratingCount) || 0);
                if (countDiff !== 0) return countDiff;
                return (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0);
            })
            .slice(0, 10);
    }, [mangas]);

    const totalPages = Math.max(1, Math.ceil(filteredMangas.length / ITEMS_PER_PAGE));
    const safePage = Math.min(Math.max(1, currentPage), totalPages);

    const paginatedMangas = useMemo(() => {
        const start = (safePage - 1) * ITEMS_PER_PAGE;
        return filteredMangas.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredMangas, safePage]);

    const handlePageChange = (nextPage) => {
        const target = Math.min(Math.max(1, nextPage), totalPages);
        setCurrentPage(target);
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            if (target === 1) url.searchParams.delete('page');
            else url.searchParams.set('page', String(target));
            window.history.pushState({}, '', url.toString());
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const handleSearchChange = (val) => {
        setSearchQuery(val);
        setCurrentPage(1);
    };

    const handleRandomManga = () => {
        if (mangas.length === 0) return;
        const pick = mangas[Math.floor(Math.random() * mangas.length)];
        if (pick) router.push(`/comics/${getMangaSlug(pick)}`);
    };

    return (
        <div className="min-h-screen flex flex-col bg-[#0e1726] text-slate-100">
            <Navbar
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
                showBookmarksOnly={showBookmarksOnly}
                onToggleBookmarks={(val) => {
                    setShowBookmarksOnly(val);
                    setCurrentPage(1);
                }}
                onRandomManga={handleRandomManga}
            />

            <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
                {!showBookmarksOnly && !searchQuery.trim() && safePage === 1 && trendingMangas.length > 0 && (
                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Flame className="w-5 h-5 text-[#1d9bf0]" />
                                <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-white">
                                    Trending
                                </h2>
                            </div>
                            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                Most Popular Series
                            </span>
                        </div>

                        <div className="flex gap-3.5 overflow-x-auto pb-2 scrollbar-thin">
                            {trendingMangas.map((m, idx) => {
                                const slug = getMangaSlug(m);
                                return (
                                    <Link
                                        key={m.id}
                                        href={`/comics/${slug}`}
                                        className="group relative w-[130px] sm:w-[148px] shrink-0 bg-[#142033] border border-[#1f304d] hover:border-[#1d9bf0] rounded-xl overflow-hidden transition"
                                    >
                                        <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#0e1726]">
                                            <img
                                                src={m.cover}
                                                alt={m.title}
                                                loading="lazy"
                                                referrerPolicy="no-referrer"
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-[#0e1726] via-transparent to-transparent opacity-90"></div>
                                            <div className="absolute top-2 left-2 w-6 h-6 rounded-md bg-[#1d9bf0] text-white font-black text-xs flex items-center justify-center shadow">
                                                {idx + 1}
                                            </div>
                                            {m.ratingCount > 0 && (
                                                <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-black/60 px-1.5 py-0.5 rounded">
                                                    <Star className="w-3 h-3 fill-current" />
                                                    <span>{formatRatingOut10(m.rating, m.ratingCount)}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-2.5">
                                            <h3 className="text-xs font-bold text-slate-100 group-hover:text-[#38bdf8] truncate transition">
                                                {m.title}
                                            </h3>
                                            <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                                {(m.genres || ['Manhwa']).slice(0, 2).join(', ')}
                                            </p>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </section>
                )}

                <section className="space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#1e293b] pb-4">
                        <div>
                            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                                {showBookmarksOnly
                                    ? 'Saved Bookmarks'
                                    : searchQuery.trim()
                                    ? `Search Results for "${searchQuery.trim()}"`
                                    : 'Latest Updates'}
                            </h1>
                            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">
                                {showBookmarksOnly
                                    ? `${filteredMangas.length} BOOKMARKED SERIES`
                                    : searchQuery.trim()
                                    ? `FOUND ${filteredMangas.length} MATCHING SERIES ACROSS ALL PAGES`
                                    : 'FRESH CHAPTERS'}
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="inline-flex bg-[#142033] border border-[#1f304d] rounded-lg p-0.5">
                                <button
                                    type="button"
                                    onClick={() => { setTabMode('hot'); setCurrentPage(1); }}
                                    className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                                        tabMode === 'hot'
                                            ? 'bg-[#1d9bf0] text-white shadow'
                                            : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    Hot
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setTabMode('new'); setCurrentPage(1); }}
                                    className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                                        tabMode === 'new'
                                            ? 'bg-[#1d9bf0] text-white shadow'
                                            : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    New
                                </button>
                            </div>

                            <div className="flex items-center bg-[#142033] border border-[#1f304d] rounded-lg px-2.5 py-1 text-xs">
                                <span className="text-[10px] font-bold uppercase text-slate-400 mr-1.5">TYPE</span>
                                <select
                                    value={typeFilter}
                                    onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
                                    className="bg-transparent text-slate-100 font-semibold outline-none cursor-pointer"
                                >
                                    <option value="All" className="bg-[#142033]">All</option>
                                    <option value="Manhwa" className="bg-[#142033]">Manhwa</option>
                                    <option value="Action" className="bg-[#142033]">Action</option>
                                    <option value="Fantasy" className="bg-[#142033]">Fantasy</option>
                                    <option value="Regression" className="bg-[#142033]">Regression</option>
                                    <option value="Murim" className="bg-[#142033]">Murim</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {loadingCatalog ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {Array.from({ length: 12 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="h-[136px] bg-[#142033] border border-[#1f304d] rounded-xl animate-pulse flex overflow-hidden"
                                >
                                    <div className="w-[96px] h-full bg-[#1c2c46]"></div>
                                    <div className="flex-1 p-3.5 flex flex-col justify-between">
                                        <div className="space-y-2">
                                            <div className="h-3 w-16 bg-[#1c2c46] rounded"></div>
                                            <div className="h-4 w-3/4 bg-[#1c2c46] rounded"></div>
                                        </div>
                                        <div className="h-3 w-1/2 bg-[#1c2c46] rounded"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : paginatedMangas.length === 0 ? (
                        <div className="text-center py-16 bg-[#142033]/60 rounded-2xl border border-[#1f304d] p-8">
                            <h3 className="text-base font-bold text-slate-200">
                                {showBookmarksOnly ? 'No bookmarks saved yet' : 'No manga matched your search'}
                            </h3>
                            <p className="text-xs text-slate-400 mt-1">
                                {showBookmarksOnly
                                    ? 'Click the bookmark icon on any series to save it for quick access.'
                                    : 'Try searching a different title or clearing your filters.'}
                            </p>
                            {(searchQuery || showBookmarksOnly || typeFilter !== 'All') && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearchQuery('');
                                        setShowBookmarksOnly(false);
                                        setTypeFilter('All');
                                        setCurrentPage(1);
                                    }}
                                    className="mt-4 px-4 py-2 bg-[#1d9bf0] text-white text-xs font-bold rounded-lg hover:bg-[#1a8cd8] transition"
                                >
                                    Reset Filters
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {paginatedMangas.map((manga) => {
                                const chList = chaptersByManga[manga.id] || manga.latestChapters || [];
                                const latestCh = chList[0] || null;
                                const mSlug = getMangaSlug(manga);
                                const chSlug = getChapterSlug(latestCh, 1);
                                const chTimestamp = latestCh?.createdAt || manga.updatedAt;

                                return (
                                    <MangaCard
                                        key={manga.id}
                                        manga={manga}
                                        mangaSlug={mSlug}
                                        latestChapter={latestCh}
                                        chapterSlug={chSlug}
                                        relativeTime={getRelativeTime(chTimestamp)}
                                        isBookmarked={isBookmarked(manga.id)}
                                        onToggleBookmark={toggleBookmark}
                                    />
                                );
                            })}
                        </div>
                    )}

                    <Pagination
                        currentPage={safePage}
                        totalPages={totalPages}
                        onPageChange={handlePageChange}
                    />
                </section>
            </main>

            <footer className="bg-[#0b121e] border-t border-[#1e293b] py-8 mt-12 text-xs text-slate-400">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="space-y-1 text-center sm:text-left">
                        <div className="flex items-center justify-center sm:justify-start gap-2">
                            <span className="text-base font-black text-white">
                                Vani<span className="text-[#1d9bf0]">Scans</span>
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                            The easy way to read manga, manhwa &amp; manhua. Fresh chapters, updated hourly.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-3">
                        <Link href="/contact" className="px-3 py-1.5 rounded-lg bg-[#142033] hover:bg-[#1c2c46] text-slate-200 font-medium transition">
                            Contact
                        </Link>
                        <Link href="/dmca" className="px-3 py-1.5 rounded-lg bg-[#142033] hover:bg-[#1c2c46] text-slate-200 font-medium transition">
                            DMCA
                        </Link>
                        <Link href="/privacy" className="px-3 py-1.5 rounded-lg bg-[#142033] hover:bg-[#1c2c46] text-slate-200 font-medium transition">
                            Privacy
                        </Link>
                        <Link href="/terms" className="px-3 py-1.5 rounded-lg bg-[#142033] hover:bg-[#1c2c46] text-slate-200 font-medium transition">
                            Terms
                        </Link>
                    </div>

                    <div className="text-[11px] text-slate-500">
                        &copy; 2026 VaniScans &mdash; all rights reserved
                    </div>
                </div>
            </footer>
        </div>
    );
}
