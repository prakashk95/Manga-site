'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { fetchAndSyncMangas, fetchAndSyncChapters } from '@/lib/clientStorage';

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

    useEffect(() => {
        if (!slug) return;
        const readable = humanizeSlug(slug);
        document.title = `Read ${readable} - VaniScans`;

        let isMounted = true;

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

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#0b0c13] text-purple-400 space-y-3">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs font-semibold text-slate-400">Loading manga details...</span>
            </div>
        );
    }

    if (!manga) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#0b0c13] text-slate-300 space-y-4">
                <h1 className="text-xl font-bold">Series not found</h1>
                <p className="text-xs text-slate-500">The manga you are looking for may have been removed or the URL is incorrect.</p>
                <Link href="/" className="px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold">Back to Home</Link>
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
    const latestCh = ascChapters[ascChapters.length - 1];

    const filteredChapters = sortedChapters.filter(ch => ch.title.toLowerCase().includes(filterTerm.toLowerCase()));

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
        <div className="min-h-screen flex flex-col bg-[#0b0c13] text-slate-100 pb-20">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <header className="sticky top-0 z-40 bg-[#0c0d14]/90 backdrop-blur-md border-b border-[#1f2337]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-white">
                        ← Back to Catalog
                    </Link>
                </div>
            </header>

            <div className="relative w-full h-80 sm:h-96 bg-cover bg-center" style={{ backgroundImage: `url('${manga.banner || manga.cover}')` }}>
                <div className="absolute inset-0 banner-gradient backdrop-blur-sm"></div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 relative z-20">
                <div className="flex flex-col lg:flex-row gap-8 items-start">
                    <div className="w-full lg:w-72 shrink-0 bg-[#121422] border border-[#20243b] rounded-2xl p-5 shadow-2xl">
                        <img src={manga.cover} alt={manga.title} referrerPolicy="no-referrer" className="w-full aspect-[3/4] object-cover rounded-xl shadow-lg border border-white/5 mb-4" />
                        <div className="space-y-2.5">
                            {chapters.length > 0 && (
                                <div className="grid grid-cols-2 gap-2">
                                    <Link href={`/comics/${slug}/chapter/${getChapterSlug(firstCh, 0)}`} className="py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white shadow-lg flex items-center justify-center gap-1.5 transition">
                                        ▶ First Ch
                                    </Link>
                                    <Link href={`/comics/${slug}/chapter/${getChapterSlug(latestCh, ascChapters.length - 1)}`} className="py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider bg-[#181b2e] hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 flex items-center justify-center gap-1.5 transition">
                                        ⚡ Latest Ch
                                    </Link>
                                </div>
                            )}
                            <button onClick={toggleBookmark} className={`w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 border transition ${isBookmarked ? 'bg-purple-600 text-white border-purple-500' : 'bg-[#181b2e] text-slate-300 border-[#272b46]'}`}>
                                🔖 {isBookmarked ? 'Bookmarked' : 'Add to Bookmarks'}
                            </button>
                            <div className="pt-4 border-t border-[#1d2136] space-y-2 text-xs text-slate-400">
                                <div className="flex justify-between"><span>Status:</span> <span className="font-semibold text-emerald-400">{manga.status}</span></div>
                                <div className="flex justify-between"><span>Author:</span> <span className="font-semibold text-slate-200">{manga.author}</span></div>
                                <div className="flex justify-between"><span>Rating:</span> <span className="font-semibold text-amber-400">⭐ {manga.rating}</span></div>
                                <div className="flex justify-between"><span>Chapters:</span> <span className="font-semibold text-purple-400">{chapters.length}</span></div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-grow w-full space-y-6">
                        <div className="bg-[#121422] border border-[#20243b] rounded-2xl p-6 sm:p-8 space-y-3">
                            <div className="flex flex-wrap gap-2">
                                {(manga.genres || ['Action']).map(g => (
                                    <span key={g} className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-purple-600/20 text-purple-300 border border-purple-500/30">{g}</span>
                                ))}
                            </div>
                            <h1 className="text-2xl sm:text-4xl font-black text-white">{manga.title}</h1>
                            <p className="text-sm leading-relaxed text-slate-400">{manga.synopsis}</p>
                        </div>

                        <div className="bg-[#121422] border border-[#20243b] rounded-2xl p-6 sm:p-8 space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <h2 className="text-lg font-bold text-white">
                                    CHAPTERS {loadingChapters ? '(Loading...)' : `(${chapters.length})`}
                                </h2>
                                <div className="flex items-center gap-3">
                                    <input type="text" value={filterTerm} onChange={e => setFilterTerm(e.target.value)} placeholder="Search chapters..." className="bg-[#181b2e] border border-[#242842] text-xs text-white rounded-xl px-3 py-2 outline-none w-44" />
                                    <button onClick={() => setSortAsc(!sortAsc)} className="p-2 bg-[#181b2e] text-slate-300 rounded-xl border border-[#242842]" title="Invert order">↕</button>
                                </div>
                            </div>

                            {loadingChapters ? (
                                <div className="py-12 flex items-center justify-center gap-2 text-xs text-purple-400">
                                    <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                                    <span>Loading chapters from cloud...</span>
                                </div>
                            ) : chapters.length === 0 ? (
                                <div className="py-12 text-center text-xs text-slate-500">No chapters uploaded yet.</div>
                            ) : (
                                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                                    {filteredChapters.map((ch, idx) => (
                                        <Link key={ch.id} href={`/comics/${slug}/chapter/${getChapterSlug(ch, idx)}`} className="flex items-center justify-between p-3.5 bg-[#16192a] hover:bg-purple-600/25 border border-[#20243b] rounded-xl transition group">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-[#1f233a] group-hover:bg-purple-600 text-purple-400 group-hover:text-white flex items-center justify-center text-xs font-bold transition">📄</div>
                                                <div>
                                                    <h4 className="text-sm font-semibold text-white group-hover:text-purple-300 transition">{ch.title}</h4>
                                                    <span className="text-[11px] text-slate-500">{ch.pages?.length || 0} pages</span>
                                                </div>
                                            </div>
                                            <span className="text-xs font-bold px-3 py-1 bg-[#1f233a] group-hover:bg-purple-600 text-slate-300 group-hover:text-white rounded-xl transition">Read</span>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <footer className="bg-[#0a0b10] border-t border-[#1a1c2b] py-10 mt-16 text-xs text-slate-500">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center text-white font-bold">⚡</div>
                        <div>
                            <div className="font-black text-slate-300 text-sm">VANISCANS</div>
                            <div>High performance manhwa & webtoon reading hub.</div>
                        </div>
                    </div>
                    <div className="flex flex-wrap justify-center gap-6 text-slate-300 font-medium">
                        <Link href="/about" className="hover:text-purple-400 transition">About Us</Link>
                        <Link href="/privacy" className="hover:text-purple-400 transition">Privacy Policy</Link>
                        <Link href="/terms" className="hover:text-purple-400 transition">Terms of Service</Link>
                        <Link href="/dmca" className="hover:text-purple-400 transition">DMCA</Link>
                        <Link href="/contact" className="hover:text-purple-400 transition">Contact Us</Link>
                    </div>
                    <div>&copy; 2026 VaniScans. All rights reserved.</div>
                </div>
            </footer>
        </div>
    );
}
