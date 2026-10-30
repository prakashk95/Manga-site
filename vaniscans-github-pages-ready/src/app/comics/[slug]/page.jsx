'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { fetchAndSyncMangas, fetchAndSyncChapters } from '@/lib/clientStorage';
import { Bookmark, Star, Play, ArrowUpDown, Search, BookOpen } from 'lucide-react';

function upsertMetaTag(attrName, attrValue, content) {
    if (typeof document === 'undefined' || !content) return;
    let tag = document.head.querySelector(`meta[${attrName}="${attrValue}"]`);
    if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attrName, attrValue);
        document.head.appendChild(tag);
    }
    tag.setAttribute('content', content);
}

function humanizeSlug(slug = '') {
    const cleaned = decodeURIComponent(slug)
        .replace(/-[a-z0-9]{8}$/i, '')
        .replace(/^manga-(md|mk|mf)-/, '')
        .replace(/-/g, ' ')
        .trim();
    if (!cleaned) return 'Manga';
    return cleaned.replace(/\b\w/g, c => c.toUpperCase());
}

function getOrCreateUserRatingKey() {
    if (typeof window === 'undefined') return 'anon';
    try {
        let key = localStorage.getItem('vaniscans_user_rating_key');
        if (!key) {
            key = 'usr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
            localStorage.setItem('vaniscans_user_rating_key', key);
        }
        return key;
    } catch (_) {
        return 'anon';
    }
}

export default function MangaDetailPage() {
    const params = useParams();
    const slug = params?.slug || '';

    const [manga, setManga] = useState(null);
    const [chapters, setChapters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingChapters, setLoadingChapters] = useState(true);
    const [isBookmarked, setIsBookmarked] = useState(false);
    const [filterTerm, setFilterTerm] = useState('');
    const [sortAsc, setSortAsc] = useState(false);
    const [expandSynopsis, setExpandSynopsis] = useState(false);

    const [ratingDisplay, setRatingDisplay] = useState('0/10');
    const [ratingCount, setRatingCount] = useState(0);
    const [userScore, setUserScore] = useState(null);
    const [showRateModal, setShowRateModal] = useState(false);
    const [hoverScore, setHoverScore] = useState(0);
    const [submittingRating, setSubmittingRating] = useState(false);

    useEffect(() => {
        if (!slug) return;
        const readable = humanizeSlug(slug);
        document.title = `Read ${readable} - VaniScans`;

        let isMounted = true;

        const loadRatingForManga = async (mId) => {
            try {
                const uKey = getOrCreateUserRatingKey();
                const res = await fetch(`/api/ratings?mangaId=${encodeURIComponent(mId)}&userKey=${encodeURIComponent(uKey)}`, {
                    cache: 'no-store'
                });
                if (res.ok) {
                    const data = await res.json();
                    if (isMounted) {
                        setRatingDisplay(data.display || '0/10');
                        setRatingCount(Number(data.count) || 0);
                        setUserScore(data.userScore || null);
                    }
                }
            } catch (_) {}
        };

        try {
            const cachedList = JSON.parse(localStorage.getItem('vaniscans_persistent_mangas_v4') || '[]');
            const foundCached = cachedList.find(m => {
                const mSlug = (m.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                const shortHash = (m.mangadexId || m.mangakatanaId || m.mangafireId || m.id || '').replace(/^manga-(md|mk|mf)-/, '').slice(0, 8).toLowerCase();
                const fullSlug = shortHash ? `${mSlug}-${shortHash}` : mSlug;
                return fullSlug === slug.toLowerCase() || mSlug === slug.toLowerCase() || m.id.toLowerCase() === slug.toLowerCase();
            });
            if (foundCached) {
                setManga(foundCached);
                setLoading(false);
                try {
                    const bms = JSON.parse(localStorage.getItem('vaniscans_bookmarks') || '[]');
                    setIsBookmarked(bms.includes(foundCached.id));
                } catch (_) {}
            }
        } catch (_) {}

        fetchAndSyncMangas()
            .then(async (list) => {
                if (!isMounted) return;
                if (!Array.isArray(list)) {
                    setLoading(false);
                    setLoadingChapters(false);
                    return;
                }
                const found = list.find(m => {
                    const mSlug = (m.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                    const shortHash = (m.mangadexId || m.mangakatanaId || m.mangafireId || m.id || '').replace(/^manga-(md|mk|mf)-/, '').slice(0, 8).toLowerCase();
                    const fullSlug = shortHash ? `${mSlug}-${shortHash}` : mSlug;
                    return fullSlug === slug.toLowerCase() || mSlug === slug.toLowerCase() || m.id.toLowerCase() === slug.toLowerCase();
                });

                if (found) {
                    setManga(found);
                    loadRatingForManga(found.id);

                    const seoTitle = (found.metaTitle && found.metaTitle.trim())
                        ? found.metaTitle.trim()
                        : `Read ${found.title} - VaniScans`;
                    const seoDesc = (found.metaDescription && found.metaDescription.trim())
                        ? found.metaDescription.trim()
                        : `Read ${found.title} / ${found.synopsis || 'Read manga, manhwa and webtoons online on VaniScans.'}`;

                    document.title = seoTitle;
                    upsertMetaTag('name', 'description', seoDesc);
                    upsertMetaTag('property', 'og:title', seoTitle);
                    upsertMetaTag('property', 'og:description', seoDesc);
                    upsertMetaTag('name', 'twitter:title', seoTitle);
                    upsertMetaTag('name', 'twitter:description', seoDesc);
                    if (found.cover) {
                        upsertMetaTag('property', 'og:image', found.cover);
                    }

                    try {
                        const bms = JSON.parse(localStorage.getItem('vaniscans_bookmarks') || '[]');
                        setIsBookmarked(bms.includes(found.id));
                    } catch (_) {}

                    const chs = await fetchAndSyncChapters(found.id);
                    if (isMounted && Array.isArray(chs)) setChapters(chs);
                }
                if (isMounted) {
                    setLoading(false);
                    setLoadingChapters(false);
                }
            })
            .catch(() => {
                if (isMounted) {
                    setLoading(false);
                    setLoadingChapters(false);
                }
            });

        return () => { isMounted = false; };
    }, [slug]);

    const toggleBookmark = () => {
        if (!manga) return;
        try {
            let bms = JSON.parse(localStorage.getItem('vaniscans_bookmarks') || '[]');
            if (bms.includes(manga.id)) {
                bms = bms.filter(id => id !== manga.id);
                setIsBookmarked(false);
            } else {
                bms.push(manga.id);
                setIsBookmarked(true);
            }
            localStorage.setItem('vaniscans_bookmarks', JSON.stringify(bms));
        } catch (_) {}
    };

    const handleRateSubmit = async (scoreValue) => {
        if (!manga || submittingRating) return;
        setSubmittingRating(true);
        try {
            const uKey = getOrCreateUserRatingKey();
            const res = await fetch('/api/ratings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mangaId: manga.id,
                    score: scoreValue,
                    userKey: uKey
                })
            });
            if (res.ok) {
                const data = await res.json();
                setRatingDisplay(data.display || `${scoreValue}/10`);
                setRatingCount(Number(data.count) || 1);
                setUserScore(scoreValue);
                setShowRateModal(false);
            }
        } catch (_) {} finally {
            setSubmittingRating(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col bg-[#0e1726] text-slate-100">
                <Navbar />
                <div className="flex-grow flex flex-col items-center justify-center space-y-3">
                    <div className="w-8 h-8 border-2 border-[#1d9bf0] border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs font-semibold text-slate-400">Loading series...</span>
                </div>
            </div>
        );
    }

    if (!manga) {
        return (
            <div className="min-h-screen flex flex-col bg-[#0e1726] text-slate-100">
                <Navbar />
                <div className="flex-grow flex flex-col items-center justify-center space-y-4 p-4 text-center">
                    <h1 className="text-xl font-bold">Series not found</h1>
                    <p className="text-xs text-slate-400">The manga you are looking for may have been removed or the URL is incorrect.</p>
                    <Link href="/" className="px-4 py-2 bg-[#1d9bf0] text-white rounded-lg text-xs font-bold">
                        Back to Home
                    </Link>
                </div>
            </div>
        );
    }

    const sortedChapters = [...chapters].sort((a, b) => {
        const numA = Number(a.number) || 0;
        const numB = Number(b.number) || 0;
        return sortAsc ? numA - numB : numB - numA;
    });

    const ascChapters = [...chapters].sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
    const firstCh = ascChapters[0];

    const filteredChapters = sortedChapters.filter(ch =>
        (ch.title || '').toLowerCase().includes(filterTerm.toLowerCase())
    );

    const getChapterSlug = (ch, index = 0) => {
        if (!ch) return '1';
        if (typeof ch.number === 'number' && !isNaN(ch.number)) return String(ch.number);
        const match = (ch.title || '').match(/(\d+(\.\d+)?)/);
        return match ? match[1] : String(index + 1);
    };

    const seoTitle = (manga.metaTitle && manga.metaTitle.trim())
        ? manga.metaTitle.trim()
        : `Read ${manga.title} - VaniScans`;
    const seoDesc = (manga.metaDescription && manga.metaDescription.trim())
        ? manga.metaDescription.trim()
        : `Read ${manga.title} / ${manga.synopsis || 'Read manga, manhwa and webtoons online on VaniScans.'}`;

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'ComicSeries',
        name: seoTitle,
        headline: seoTitle,
        description: seoDesc,
        author: {
            '@type': 'Person',
            name: manga.author || 'Author Unknown'
        },
        image: manga.cover || '',
        genre: Array.isArray(manga.genres) ? manga.genres : ['Action']
    };

    return (
        <div className="min-h-screen flex flex-col bg-[#0e1726] text-slate-100">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <Navbar />

            <section className="relative overflow-hidden border-b border-[#1e293b] pt-6 sm:pt-8 pb-8">
                <div
                    className="absolute inset-0 bg-cover bg-center opacity-25 blur-2xl scale-110 pointer-events-none"
                    style={{ backgroundImage: `url('${manga.banner || manga.cover}')` }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-[#0e1726]/70 via-[#0e1726]/85 to-[#0e1726] pointer-events-none" />

                <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-center sm:items-start">
                        <div className="w-44 sm:w-56 shrink-0 rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-[#142033]">
                            <img
                                src={manga.cover}
                                alt={manga.title}
                                referrerPolicy="no-referrer"
                                className="w-full aspect-[3/4] object-cover"
                            />
                        </div>

                        <div className="flex-1 min-w-0 space-y-3.5 text-center sm:text-left">
                            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                                {manga.title}
                            </h1>

                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-[11px] font-bold uppercase tracking-wider">
                                <span className="px-2.5 py-0.5 rounded bg-[#1e293b] text-slate-200 border border-[#334155]">
                                    MANGA
                                </span>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                    {manga.status || 'Ongoing'}
                                </span>
                            </div>

                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs sm:text-sm text-slate-300 pt-0.5">
                                <div className="flex items-center gap-1.5">
                                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                                    <span className="font-extrabold text-white">{ratingDisplay}</span>
                                    <span className="text-slate-400 text-xs">
                                        ({ratingCount} {ratingCount === 1 ? 'vote' : 'votes'})
                                    </span>
                                </div>
                                <span className="text-slate-600">&bull;</span>
                                <div className="flex items-center gap-1.5 text-slate-300">
                                    <Bookmark className="w-3.5 h-3.5 text-slate-400" />
                                    <span>{isBookmarked ? 'Following' : 'Follow series'}</span>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 pt-0.5">
                                {(manga.genres || ['Action']).map((g) => (
                                    <span
                                        key={g}
                                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-[#172336] text-slate-300 border border-[#24344d]"
                                    >
                                        {g}
                                    </span>
                                ))}
                            </div>

                            <div className="text-xs text-slate-300">
                                <span className="text-slate-400">Author </span>
                                <strong className="text-white font-semibold">{manga.author || 'Unknown'}</strong>
                            </div>

                            <div className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-3xl">
                                <p className={expandSynopsis ? '' : 'line-clamp-2'}>
                                    {manga.synopsis || 'No synopsis available for this series.'}
                                </p>
                                {(manga.synopsis || '').length > 140 && (
                                    <button
                                        type="button"
                                        onClick={() => setExpandSynopsis(!expandSynopsis)}
                                        className="text-[#38bdf8] hover:underline text-xs font-semibold mt-1"
                                    >
                                        {expandSynopsis ? 'Show less' : 'Read more'}
                                    </button>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 pt-2">
                                {chapters.length > 0 && (
                                    <Link
                                        href={`/comics/${slug}/chapter/${getChapterSlug(firstCh, 0)}`}
                                        className="px-5 py-2.5 rounded-lg bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-lg shadow-[#1d9bf0]/25 transition"
                                    >
                                        <Play className="w-3.5 h-3.5 fill-current" />
                                        <span>Start reading</span>
                                    </Link>
                                )}

                                <button
                                    type="button"
                                    onClick={toggleBookmark}
                                    className={`px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-2 border transition ${
                                        isBookmarked
                                            ? 'bg-[#172336] text-[#38bdf8] border-[#1d9bf0]'
                                            : 'bg-[#172336] hover:bg-[#1f304a] text-slate-200 border-[#24344d]'
                                    }`}
                                >
                                    <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
                                    <span>{isBookmarked ? 'Following' : 'Follow'}</span>
                                </button>

                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setShowRateModal(!showRateModal)}
                                        title="Rate this manga"
                                        className={`p-2.5 rounded-lg border transition flex items-center gap-1.5 text-xs font-semibold ${
                                            userScore
                                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                                : 'bg-[#172336] hover:bg-[#1f304a] border-[#24344d] text-slate-200'
                                        }`}
                                    >
                                        <Star className={`w-4 h-4 ${userScore ? 'fill-amber-400 text-amber-400' : ''}`} />
                                        <span>{userScore ? `Your Rating: ${userScore}/10` : 'Rate'}</span>
                                    </button>

                                    {showRateModal && (
                                        <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-72 bg-[#142033] border border-[#2c446b] rounded-xl p-4 shadow-2xl z-50 text-left space-y-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-white">
                                                    Rate {manga.title}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowRateModal(false)}
                                                    className="text-xs text-slate-400 hover:text-white"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                            <p className="text-[11px] text-slate-400">
                                                Select a score from 1 to 10 stars:
                                            </p>
                                            <div className="grid grid-cols-5 gap-1.5">
                                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                                                    const active = (hoverScore || userScore || 0) >= num;
                                                    return (
                                                        <button
                                                            key={num}
                                                            type="button"
                                                            disabled={submittingRating}
                                                            onMouseEnter={() => setHoverScore(num)}
                                                            onMouseLeave={() => setHoverScore(0)}
                                                            onClick={() => handleRateSubmit(num)}
                                                            className={`py-1.5 rounded-lg text-xs font-bold border flex items-center justify-center gap-1 transition ${
                                                                active
                                                                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                                                                    : 'bg-[#0e1726] text-slate-300 border-[#24344d] hover:border-amber-400'
                                                            }`}
                                                        >
                                                            <span>{num}</span>
                                                            <Star className="w-3 h-3 fill-current" />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <main className="flex-grow max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="bg-[#142033] border border-[#1f304d] rounded-xl p-5 sm:p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1f304d] pb-4">
                        <div className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-[#1d9bf0]" />
                            <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                                Chapters {loadingChapters ? '(Loading...)' : `(${chapters.length})`}
                            </h2>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="relative flex-1 sm:w-56">
                                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={filterTerm}
                                    onChange={(e) => setFilterTerm(e.target.value)}
                                    placeholder="Find chapter..."
                                    className="w-full bg-[#0e1726] border border-[#24344d] focus:border-[#1d9bf0] text-xs text-white rounded-lg pl-8 pr-3 py-2 outline-none"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => setSortAsc(!sortAsc)}
                                className="px-3 py-2 bg-[#0e1726] hover:bg-[#172336] text-slate-300 rounded-lg border border-[#24344d] text-xs font-semibold flex items-center gap-1.5 transition"
                                title="Toggle Sort Order"
                            >
                                <ArrowUpDown className="w-3.5 h-3.5" />
                                <span>{sortAsc ? 'Oldest' : 'Newest'}</span>
                            </button>
                        </div>
                    </div>

                    {loadingChapters ? (
                        <div className="py-12 flex items-center justify-center gap-2 text-xs text-slate-400">
                            <div className="w-4 h-4 border-2 border-[#1d9bf0] border-t-transparent rounded-full animate-spin"></div>
                            <span>Loading chapters...</span>
                        </div>
                    ) : chapters.length === 0 ? (
                        <div className="py-12 text-center text-xs text-slate-400">
                            No chapters uploaded yet.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[560px] overflow-y-auto pr-1">
                            {filteredChapters.map((ch, idx) => (
                                <Link
                                    key={ch.id}
                                    href={`/comics/${slug}/chapter/${getChapterSlug(ch, idx)}`}
                                    className="flex items-center justify-between p-3 bg-[#0e1726] hover:bg-[#192841] border border-[#1f304d] hover:border-[#1d9bf0] rounded-lg transition group"
                                >
                                    <div className="min-w-0 pr-2">
                                        <div className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-[#38bdf8] truncate transition">
                                            {ch.title}
                                        </div>
                                        <span className="text-[11px] text-slate-500">
                                            {ch.pages?.length || ch.pageCount || 0} pages
                                        </span>
                                    </div>
                                    <span className="text-[11px] font-bold px-2.5 py-1 rounded bg-[#142033] group-hover:bg-[#1d9bf0] text-slate-300 group-hover:text-white transition shrink-0">
                                        Read
                                    </span>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            <footer className="bg-[#0b121e] border-t border-[#1e293b] py-8 mt-auto text-xs text-slate-400">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="font-black text-white text-sm">
                        Vani<span className="text-[#1d9bf0]">Scans</span>
                    </div>
                    <div className="flex flex-wrap justify-center gap-4 text-slate-400">
                        <Link href="/about" className="hover:text-white transition">About</Link>
                        <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
                        <Link href="/terms" className="hover:text-white transition">Terms</Link>
                        <Link href="/dmca" className="hover:text-white transition">DMCA</Link>
                        <Link href="/contact" className="hover:text-white transition">Contact</Link>
                    </div>
                    <div>&copy; 2026 VaniScans</div>
                </div>
            </footer>
        </div>
    );
}
