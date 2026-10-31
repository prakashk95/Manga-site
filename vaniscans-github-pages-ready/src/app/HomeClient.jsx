'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function HomeClient({ initialMangas = [] }) {
    const [mangas] = useState(initialMangas);
    const chaptersByManga = React.useMemo(() => {
        const map = {};
        for (const m of initialMangas) map[m.id] = m.latestChapters || [];
        return map;
    }, [initialMangas]);
    const loadingCatalog = false;
    const loadingChaptersMap = {};
    const [bookmarks, setBookmarks] = useState([]);
    const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
    const [activeGenre, setActiveGenre] = useState('All');
    const [statusFilter, setStatusFilter] = useState('All');
    const [sortFilter, setSortFilter] = useState('latest');
    const [searchQuery, setSearchQuery] = useState('');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [heroSlide, setHeroSlide] = useState(0);

    useEffect(() => {
        try {
            const savedBm = JSON.parse(localStorage.getItem('vaniscans_bookmarks') || '[]');
            setBookmarks(savedBm);
        } catch (_) {}

        // Secret keyboard shortcut (Ctrl+Shift+A or Alt+A) to open Admin Panel
        const handleKeyDown = (e) => {
            if ((e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) || (e.altKey && (e.key === 'a' || e.key === 'A'))) {
                e.preventDefault();
                window.location.href = '/Fang-creater';
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        const timer = setInterval(() => {
            if (mangas.length > 0) {
                setHeroSlide(prev => (prev + 1) % Math.min(mangas.length, 4));
            }
        }, 6000);
        return () => clearInterval(timer);
    }, [mangas]);

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
        if (!timestamp) return 'Recently';
        const diff = (Date.now() - timestamp) / 1000;
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    };

    const featured = mangas.slice(0, 4);

    const filteredMangas = mangas.filter(m => {
        if (showBookmarksOnly && !isBookmarked(m.id)) return false;
        if (activeGenre !== 'All' && (!m.genres || !m.genres.some(g => g.toLowerCase() === activeGenre.toLowerCase()))) return false;
        if (statusFilter !== 'All' && m.status !== statusFilter) return false;
        if (searchQuery && !m.title.toLowerCase().includes(searchQuery.toLowerCase()) && !(m.author && m.author.toLowerCase().includes(searchQuery.toLowerCase()))) return false;
        return true;
    }).sort((a, b) => {
        if (sortFilter === 'latest') return (b.updatedAt || 0) - (a.updatedAt || 0);
        if (sortFilter === 'rating') return (b.rating || 0) - (a.rating || 0);
        if (sortFilter === 'alphabetical') return a.title.localeCompare(b.title);
        return 0;
    });

    const popularToday = [...mangas].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 6);

    return (
        <div className="min-h-screen flex flex-col bg-[#0b0c13] text-slate-100">
            {/* Public Navbar (No Admin Studio Link!) */}
            <header className="sticky top-0 z-40 bg-[#0c0d14]/90 backdrop-blur-md border-b border-[#1f2337]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-6">
                        <a href="/" onClick={(e) => { e.preventDefault(); setShowBookmarksOnly(false); setActiveGenre('All'); }} className="flex items-center gap-2.5 group">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-700 via-violet-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-600/30 group-hover:scale-105 transition">
                                <span className="text-white font-black text-lg">⚡</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xl font-black tracking-wider text-white flex items-center gap-1">
                                    VANI<span className="text-purple-500 neon-text-glow">SCANS</span>
                                </span>
                                <span className="text-[9px] tracking-widest uppercase text-purple-400/85 -mt-1 font-semibold">Webtoon & Manga Hub</span>
                            </div>
                        </a>

                        <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-slate-300">
                            <button onClick={() => { setShowBookmarksOnly(false); setActiveGenre('All'); setStatusFilter('All'); }} className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/5 transition flex items-center gap-1.5">
                                Home
                            </button>
                            <button onClick={() => { setShowBookmarksOnly(false); document.getElementById('catalogSection')?.scrollIntoView({ behavior: 'smooth' }); }} className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/5 transition flex items-center gap-1.5">
                                Browse
                            </button>
                            <button onClick={() => setShowBookmarksOnly(true)} className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${showBookmarksOnly ? 'bg-purple-600/20 text-purple-300' : 'hover:text-white hover:bg-white/5'}`}>
                                Bookmarks
                            </button>
                            <button onClick={() => { setShowBookmarksOnly(false); setActiveGenre('Action'); }} className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/5 transition">
                                Action
                            </button>
                            <button onClick={() => { setShowBookmarksOnly(false); setActiveGenre('Fantasy'); }} className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/5 transition">
                                Fantasy
                            </button>
                        </nav>
                    </div>

                    <div className="flex items-center gap-2.5 flex-1 max-w-sm justify-end">
                        <div className="relative w-full max-w-[180px] sm:max-w-xs">
                            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search series, authors..." 
                                className="w-full bg-[#141624] border border-[#23273e] text-slate-200 text-xs sm:text-sm rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-purple-500 transition placeholder:text-slate-500" />
                            <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
                        </div>
                        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 rounded-xl bg-[#141624] border border-[#23273e] text-slate-300">
                            ☰
                        </button>
                    </div>
                </div>

                {mobileMenuOpen && (
                    <div className="md:hidden bg-[#0e101a] border-b border-[#1f2337] px-4 py-4 space-y-2">
                        <button onClick={() => { setShowBookmarksOnly(false); setActiveGenre('All'); setMobileMenuOpen(false); }} className="w-full text-left px-3.5 py-2.5 rounded-xl hover:bg-white/5 text-sm font-semibold text-slate-200">Home</button>
                        <button onClick={() => { setShowBookmarksOnly(false); setMobileMenuOpen(false); document.getElementById('catalogSection')?.scrollIntoView({ behavior: 'smooth' }); }} className="w-full text-left px-3.5 py-2.5 rounded-xl hover:bg-white/5 text-sm font-semibold text-slate-200">Browse Catalog</button>
                        <button onClick={() => { setShowBookmarksOnly(true); setMobileMenuOpen(false); }} className="w-full text-left px-3.5 py-2.5 rounded-xl hover:bg-white/5 text-sm font-semibold text-slate-200">Saved Bookmarks</button>
                        <div className="pt-2 border-t border-[#1f2337] flex flex-wrap gap-2">
                            {['Action', 'Fantasy', 'Regression', 'Murim'].map(g => (
                                <button key={g} onClick={() => { setShowBookmarksOnly(false); setActiveGenre(g); setMobileMenuOpen(false); }} className="px-3 py-1.5 rounded-lg bg-[#16192b] text-xs font-medium text-slate-300">{g}</button>
                            ))}
                        </div>
                    </div>
                )}
            </header>

            {/* Main Content */}
            <main className="flex-grow space-y-8 pb-16">
                {/* Hero Carousel */}
                {!showBookmarksOnly && featured.length > 0 && (
                    <section className="relative bg-gradient-to-b from-[#141626] to-[#0b0c13] overflow-hidden border-b border-[#1f2337]">
                        <div className="relative max-w-7xl mx-auto min-h-[380px] sm:min-h-[440px] flex items-end p-6 sm:p-12">
                            {featured.map((manga, idx) => idx !== heroSlide ? null : (
                                <div key={manga.id} className={`absolute inset-0 w-full h-full flex items-end p-6 sm:p-12 transition-opacity duration-700 ${idx === heroSlide ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                                    <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${manga.banner || manga.cover}')` }}>
                                        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c13] via-[#0b0c13]/70 to-transparent"></div>
                                        <div className="absolute inset-0 bg-gradient-to-r from-[#0b0c13] via-[#0b0c13]/80 to-transparent"></div>
                                    </div>
                                    <div className="relative z-10 max-w-2xl space-y-3">
                                        <div className="flex items-center gap-2">
                                            <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest bg-purple-600 text-white shadow">Trending #{idx + 1}</span>
                                            <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/10 text-purple-300 backdrop-blur">{manga.status}</span>
                                        </div>
                                        <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-white leading-tight">{manga.title}</h1>
                                        <p className="text-xs sm:text-sm text-slate-300 line-clamp-2 leading-relaxed">{manga.synopsis}</p>
                                        <div className="flex items-center gap-3 pt-2">
                                            <Link href={`/comics/${getMangaSlug(manga)}`} className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg shadow-purple-600/30 flex items-center gap-2 transition">
                                                📖 Read Now
                                            </Link>
                                            <button onClick={(e) => toggleBookmark(e, manga.id)} className="p-2.5 bg-[#171a2d]/80 hover:bg-white/10 text-white rounded-xl border border-white/10 backdrop-blur transition">
                                                {isBookmarked(manga.id) ? '💜' : '🔖'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Filters */}
                <section id="catalogSection" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="bg-[#121422] border border-[#20243b] p-4 rounded-2xl flex flex-wrap gap-3 items-center justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs uppercase font-bold text-purple-400 tracking-wider mr-1">Genres:</span>
                            {['All', 'Action', 'Fantasy', 'Regression', 'Murim'].map(genre => (
                                <button key={genre} onClick={() => { setShowBookmarksOnly(false); setActiveGenre(genre); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${activeGenre === genre && !showBookmarksOnly ? 'bg-purple-600 text-white' : 'bg-[#1a1d30] hover:bg-purple-600/30 text-slate-300'}`}>
                                    {genre}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-[#181a2c] text-xs font-semibold text-slate-300 border border-[#272b46] rounded-xl px-3 py-2 outline-none">
                                <option value="All">All Statuses</option>
                                <option value="Ongoing">Ongoing</option>
                                <option value="Completed">Completed</option>
                            </select>
                            <select value={sortFilter} onChange={e => setSortFilter(e.target.value)} className="bg-[#181a2c] text-xs font-semibold text-slate-300 border border-[#272b46] rounded-xl px-3 py-2 outline-none">
                                <option value="latest">Latest Updates</option>
                                <option value="rating">Top Rated</option>
                                <option value="alphabetical">Title (A-Z)</option>
                            </select>
                        </div>
                    </div>
                </section>

                {/* Grid & Sidebar */}
                <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        <div className="lg:col-span-8 xl:col-span-9">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-2.5">
                                    <span className="w-2.5 h-6 bg-gradient-to-b from-purple-500 to-indigo-500 rounded-full"></span>
                                    <h2 className="text-lg sm:text-2xl font-black text-white tracking-wide">
                                        {showBookmarksOnly ? 'YOUR SAVED BOOKMARKS' : 'LATEST CHAPTER RELEASES'}
                                    </h2>
                                </div>
                                <span className="text-xs font-semibold px-3 py-1 bg-[#181c2e] text-purple-400 border border-purple-500/20 rounded-full">
                                    {loadingCatalog ? 'Loading...' : `${filteredMangas.length} Series`}
                                </span>
                            </div>

                            {loadingCatalog ? (
                                <div className="space-y-6">
                                    <div className="flex items-center justify-center gap-3 py-6 bg-[#121422] rounded-2xl border border-[#1f2337] text-purple-300 text-xs font-bold">
                                        <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                                        <span>Loading VaniScans catalog & latest chapters...</span>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-5">
                                        {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                                            <div key={n} className="flex flex-col bg-[#121422] rounded-2xl overflow-hidden border border-[#1f2337] animate-pulse">
                                                <div className="aspect-[3/4] bg-[#1a1d30] w-full"></div>
                                                <div className="p-3.5 space-y-2.5">
                                                    <div className="h-4 bg-[#1e2238] rounded w-3/4"></div>
                                                    <div className="h-3 bg-[#181b2e] rounded w-1/2"></div>
                                                    <div className="space-y-1.5 pt-2 border-t border-[#1a1d30]">
                                                        <div className="h-7 bg-[#181a2c] rounded-lg w-full"></div>
                                                        <div className="h-7 bg-[#181a2c] rounded-lg w-full"></div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : filteredMangas.length === 0 ? (
                                <div className="text-center py-20 bg-[#121422] rounded-2xl border border-dashed border-[#242842] p-8">
                                    <h3 className="text-lg font-bold text-slate-300">
                                        {showBookmarksOnly ? 'No bookmarks saved yet' : 'No series match your criteria'}
                                    </h3>
                                    <p className="text-sm text-slate-500 mt-1">
                                        {showBookmarksOnly ? 'Tap the bookmark icon on any series to save it here.' : 'Try clearing your search or filters.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-5">
                                    {filteredMangas.map((manga, gIdx) => {
                                        const chList = chaptersByManga[manga.id] || manga.latestChapters || [];
                                        const latest2 = chList.slice(0, 2);
                                        const isSyncingCh = !!loadingChaptersMap[manga.id];
                                        const mSlug = getMangaSlug(manga);
                                        return (
                                            <div key={manga.id} className="group flex flex-col bg-[#121422] rounded-2xl overflow-hidden border border-[#1f2337] hover:border-purple-500/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                                                <Link href={`/comics/${mSlug}`} className="relative aspect-[3/4] overflow-hidden block">
                                                    <img src={manga.cover} alt={manga.title} width="300" height="400" loading={gIdx < 4 ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                    <div className="absolute inset-0 bg-gradient-to-t from-[#121422] via-transparent to-transparent opacity-80"></div>
                                                    <div className="absolute top-2 left-2">
                                                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-purple-600 text-white shadow">{manga.status}</span>
                                                    </div>
                                                    <div className="absolute top-2 right-2">
                                                        <button onClick={e => toggleBookmark(e, manga.id)} className="p-1.5 rounded-lg bg-black/60 text-white hover:text-purple-400 backdrop-blur transition">
                                                            {isBookmarked(manga.id) ? '💜' : '🔖'}
                                                        </button>
                                                    </div>
                                                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] font-semibold text-slate-300">
                                                        <span className="flex items-center gap-1 text-amber-400">
                                                            ⭐ {manga.rating || '9.8'}
                                                        </span>
                                                        <span className="text-slate-400" suppressHydrationWarning>{getRelativeTime(manga.updatedAt)}</span>
                                                    </div>
                                                </Link>
                                                <div className="p-3.5 flex flex-col flex-grow justify-between gap-2.5">
                                                    <div>
                                                        <Link href={`/comics/${mSlug}`} className="text-sm font-bold text-white group-hover:text-purple-400 transition line-clamp-1">
                                                            {manga.title}
                                                        </Link>
                                                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{manga.author || 'Author Unknown'}</p>
                                                    </div>
                                                    <div className="space-y-1.5 pt-1 border-t border-[#1a1d30]">
                                                        {latest2.length > 0 ? (
                                                            latest2.map((ch, idx) => {
                                                                const pCount = typeof ch.pageCount === 'number' && ch.pageCount > 0
                                                                    ? ch.pageCount
                                                                    : (Array.isArray(ch.pages) ? ch.pages.length : 0);
                                                                return (
                                                                    <Link key={ch.id} href={`/comics/${mSlug}/chapter/${getChapterSlug(ch, idx + 1)}`} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#181a2c] hover:bg-purple-600 text-slate-300 hover:text-white transition text-xs font-semibold group/ch">
                                                                        <span className="truncate max-w-[125px]">{ch.title}</span>
                                                                        <span className="text-[10px] text-purple-400 group-hover/ch:text-purple-200">{pCount > 0 ? `${pCount}p` : 'Read'}</span>
                                                                    </Link>
                                                                );
                                                            })
                                                        ) : isSyncingCh ? (
                                                            <div className="flex items-center justify-center gap-1.5 text-[11px] text-purple-300 py-1.5">
                                                                <span className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></span>
                                                                <span>Loading chapters...</span>
                                                            </div>
                                                        ) : (
                                                            <div className="text-[11px] text-slate-500 italic py-1 text-center">No chapters uploaded</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Sidebar */}
                        <aside className="lg:col-span-4 xl:col-span-3 bg-[#121422] border border-[#1f2337] rounded-2xl p-5 space-y-4 sticky top-20">
                            <div className="flex items-center justify-between border-b border-[#1f2337] pb-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-purple-500 text-lg">🔥</span>
                                    <h3 className="text-sm font-black tracking-wider uppercase text-white">Popular Today</h3>
                                </div>
                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-purple-600/20 text-purple-300">Top Ranked</span>
                            </div>
                            <div className="space-y-3">
                                {loadingCatalog ? (
                                    <div className="space-y-3 animate-pulse">
                                        {[1, 2, 3, 4].map(n => (
                                            <div key={n} className="flex items-center gap-3 p-2">
                                                <div className="w-7 h-7 rounded-lg bg-[#1a1d30]"></div>
                                                <div className="w-12 h-16 rounded-lg bg-[#1a1d30]"></div>
                                                <div className="flex-1 space-y-2">
                                                    <div className="h-3 bg-[#1a1d30] rounded w-3/4"></div>
                                                    <div className="h-2.5 bg-[#181b2e] rounded w-1/2"></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : popularToday.length === 0 ? (
                                    <div className="text-xs text-slate-500 py-4 text-center">No series in catalog yet.</div>
                                ) : (
                                    popularToday.map((m, idx) => (
                                        <Link key={m.id} href={`/comics/${getMangaSlug(m)}`} className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#181b2e] transition group">
                                            <div className={`w-7 h-7 rounded-lg font-black text-xs flex items-center justify-center shrink-0 ${idx === 0 ? 'bg-purple-600 text-white shadow' : 'bg-[#1a1d30] text-slate-400'}`}>
                                                {idx + 1}
                                            </div>
                                            <img src={m.cover} alt={m.title} width="48" height="64" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="w-12 h-16 object-cover rounded-lg shrink-0 border border-white/5" />
                                            <div className="min-w-0 flex-1">
                                                <h4 className="text-xs font-bold text-white group-hover:text-purple-400 transition truncate">{m.title}</h4>
                                                <p className="text-[11px] text-slate-400 truncate">{(m.genres || []).slice(0, 2).join(', ')}</p>
                                                <div className="flex items-center gap-1 text-[11px] text-amber-400 font-semibold mt-0.5">
                                                    ⭐ {m.rating || '9.8'}
                                                </div>
                                            </div>
                                        </Link>
                                    ))
                                )}
                            </div>
                        </aside>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="bg-[#0a0b10] border-t border-[#1a1c2b] py-10 mt-auto text-xs text-slate-500">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center text-white font-bold">⚡</div>
                        <div>
                            <div className="font-black text-slate-300 text-sm">VANISCANS</div>
                            <div>High performance manhwa & webtoon reading hub.</div>
                        </div>
                    </div>
                    <div className="flex flex-wrap justify-center gap-6 text-slate-400 font-medium">
                        <button onClick={() => { setShowBookmarksOnly(false); setActiveGenre('All'); }} className="hover:text-purple-400 transition">Home</button>
                        <button onClick={() => { setShowBookmarksOnly(false); document.getElementById('catalogSection')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-purple-400 transition">Browse Catalog</button>
                        <button onClick={() => setShowBookmarksOnly(true)} className="hover:text-purple-400 transition">Bookmarks</button>
                    </div>
                    <div>&copy; 2026 VaniScans. All rights reserved.</div>
                </div>
            </footer>
        </div>
    );
}
