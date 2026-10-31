import React, { useState, useEffect } from 'react';

import { mergeMonetization } from '@/lib/monetization';
import {
    fetchAndSyncMangas,
    fetchAndSyncChapters,
    fetchAndSyncComments,
    postAndSyncComment,
    deleteAndSyncComment,
    saveLocalChaptersBulk
} from '@/lib/clientStorage';
import { parseMangaKatanaPagesHtml, fetchMangaFirePages } from '@/lib/crawler';

function AdSlotBanner({ slot }) {
    if (!slot || !slot.enabled) return null;

    if (slot.mode === 'html' && slot.htmlCode && slot.htmlCode.trim() !== '') {
        return (
            <div className="w-full max-w-[900px] mx-auto my-4 px-2 sm:px-0 flex flex-col items-center">
                <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">Advertisement</div>
                <div
                    className="w-full rounded-xl overflow-hidden border border-[#23273e] bg-[#121422] flex items-center justify-center p-2"
                    dangerouslySetInnerHTML={{ __html: slot.htmlCode }}
                />
            </div>
        );
    }

    if (slot.imageUrl && slot.imageUrl.trim() !== '') {
        return (
            <div className="w-full max-w-[900px] mx-auto my-4 px-2 sm:px-0 flex flex-col items-center">
                <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">Advertisement</div>
                <div className="w-full rounded-xl overflow-hidden border border-[#23273e] bg-[#121422] flex items-center justify-center">
                    <a
                        href={slot.linkUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        className="block w-full"
                    >
                        <img
                            src={slot.imageUrl}
                            alt="Sponsored Advertisement"
                            className="w-full h-auto max-h-60 object-cover mx-auto block hover:opacity-95 transition"
                        />
                    </a>
                </div>
            </div>
        );
    }

    return null;
}

function MangaPageImage({ rawUrl, pageNum, chapterUrl = '' }) {
    const [sourceIndex, setSourceIndex] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setSourceIndex(0);
        setLoaded(false);
        setFailed(false);
    }, [rawUrl]);

    if (!rawUrl) return null;

    const chParam = chapterUrl ? `&chapterUrl=${encodeURIComponent(chapterUrl)}` : '';
    const sources = [
        `/api/proxy/img?page=${pageNum}&url=${encodeURIComponent(rawUrl)}${chParam}`,
        `https://wsrv.nl/?url=${encodeURIComponent(rawUrl)}&output=webp`,
        rawUrl
    ];

    const currentSrc = sources[sourceIndex] || rawUrl;

    return (
        <div className="w-full max-w-[900px] mx-auto bg-[#0d0f1a] relative flex flex-col items-center justify-center min-h-[300px]">
            {!loaded && !failed && (
                <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs w-full">
                    <div className="w-7 h-7 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                    <span>Loading Page {pageNum}...</span>
                </div>
            )}
            {failed ? (
                <div className="py-12 text-center text-rose-400 text-xs">
                    Failed to load Page {pageNum}. <button onClick={() => { setSourceIndex(0); setFailed(false); }} className="underline font-bold ml-1">Retry</button>
                </div>
            ) : (
                <img
                    src={currentSrc}
                    alt={`Page ${pageNum}`}
                    loading={pageNum <= 3 ? "eager" : "lazy"}
                    decoding="async"
                    referrerPolicy={sourceIndex === 0 ? "strict-origin-when-cross-origin" : "no-referrer"}
                    onLoad={() => setLoaded(true)}
                    onError={() => {
                        if (sourceIndex < sources.length - 1) {
                            setSourceIndex(prev => prev + 1);
                        } else {
                            setFailed(true);
                        }
                    }}
                    className={`webtoon-img shadow-2xl block border-b border-black/40 transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0 max-h-0 overflow-hidden'}`}
                />
            )}
        </div>
    );
}

export default function ChapterReader({ slug = '', chapterNumParam = '', initialManga = null, initialChapters = [], initialChapter = null }) {
    const router = { push: (url) => { window.location.href = url; } };

    const [manga, setManga] = useState(initialManga);
    const [chapters, setChapters] = useState(initialChapters);
    const [currentChapter, setCurrentChapter] = useState(initialChapter);
    const [loading, setLoading] = useState(!initialChapter);
    const [readingMode, setReadingMode] = useState('webtoon');
    const [singlePageIndex, setSinglePageIndex] = useState(0);
    const [monetization, setMonetization] = useState(() => mergeMonetization(null));

    // Comments state
    const [comments, setComments] = useState([]);
    const [nickname, setNickname] = useState('');
    const [commentText, setCommentText] = useState('');

    useEffect(() => {
        if (manga && currentChapter) {
            document.title = `Read ${manga.title} ${currentChapter.title || `Chapter ${chapterNumParam}`} - VaniScans`;
        } else if (manga) {
            document.title = (manga.metaTitle && manga.metaTitle.trim())
                ? manga.metaTitle.trim()
                : `Read ${manga.title} - VaniScans`;
        }
    }, [manga, currentChapter, chapterNumParam]);

    useEffect(() => {
        try {
            const savedNick = localStorage.getItem('vaniscans_reader_nickname');
            if (savedNick) setNickname(savedNick);
        } catch (_) {}

        fetch('/api/monetization', { cache: 'no-store' })
            .then(r => r.json())
            .then(data => {
                if (data && Object.keys(data).length > 0) {
                    setMonetization(mergeMonetization(data));
                } else {
                    const localRaw = JSON.parse(localStorage.getItem('vaniscans_monetization') || '{}');
                    setMonetization(mergeMonetization(localRaw));
                }
            })
            .catch(() => {});

        fetchAndSyncMangas()
            .then(async (list) => {
                if (!Array.isArray(list)) {
                    setLoading(false);
                    return;
                }
                const found = list.find(m => {
                    const mSlug = (m.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                    const shortHash = (m.mangadexId || m.mangakatanaId || m.mangafireId || m.id || '').replace(/^manga-(md|mk|mf)-/, '').slice(0, 8).toLowerCase();
                    const fullSlug = shortHash ? `${mSlug}-${shortHash}` : mSlug;
                    return fullSlug === slug.toLowerCase() || m.id.toLowerCase() === slug.toLowerCase();
                });

                if (found) {
                    setManga(found);
                    const chs = await fetchAndSyncChapters(found.id);
                    if (Array.isArray(chs)) {
                        const sortedAsc = [...chs].sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
                        setChapters(sortedAsc);

                        const target = sortedAsc.find((ch, idx) => {
                            const chSlug = typeof ch.number === 'number' ? String(ch.number) : String(idx + 1);
                            return chSlug.toLowerCase() === chapterNumParam.toLowerCase() || ch.id.toLowerCase() === chapterNumParam.toLowerCase();
                        }) || sortedAsc[0];

                        if (target) {
                            await loadChapterData(target, false);
                        }
                    }
                }
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [slug, chapterNumParam]);

    const loadChapterData = async (ch, forceRefresh = false) => {
        let chapterObj = { ...ch };
        const needsRefresh = forceRefresh || !chapterObj.pages || chapterObj.pages.length === 0;

        if (needsRefresh && chapterObj.mangadexChapterId) {
            try {
                const res = await fetch(`/api/crawler/pages?source=mangadex&chapterId=${encodeURIComponent(chapterObj.mangadexChapterId)}`, { cache: 'no-store' });
                const json = await res.json();
                if (json.pages && json.pages.length > 0) {
                    chapterObj.pages = json.pages;
                    chapterObj.pagesSaver = json.pagesSaver || json.pages;
                    await saveLocalChaptersBulk([chapterObj]);
                    await fetch('/api/chapters', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(chapterObj)
                    });
                }
            } catch (_) {}
        } else if (needsRefresh && chapterObj.mangafireChapterId) {
            try {
                const res = await fetch(`/api/crawler/pages?source=mangafire&chapterId=${encodeURIComponent(chapterObj.mangafireChapterId)}`, { cache: 'no-store' });
                const json = await res.json();
                let freshPages = json.pages || [];
                if (freshPages.length === 0) {
                    freshPages = await fetchMangaFirePages(chapterObj.mangafireChapterId);
                }
                if (freshPages.length > 0) {
                    chapterObj.pages = freshPages;
                    chapterObj.pagesSaver = freshPages;
                    await saveLocalChaptersBulk([chapterObj]);
                    await fetch('/api/chapters', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(chapterObj)
                    });
                }
            } catch (_) {}
        } else if (needsRefresh && (chapterObj.mangakatanaChapterUrl || chapterObj.url)) {
            const rawMkUrl = chapterObj.mangakatanaChapterUrl || chapterObj.url;
            const mkUrl = rawMkUrl.startsWith('http') ? rawMkUrl : `https://mangakatana.com${rawMkUrl.startsWith('/') ? '' : '/'}${rawMkUrl}`;
            try {
                let freshPages = [];
                const proxyRes = await fetch(`/api/proxy/img?mode=html&url=${encodeURIComponent(mkUrl)}`, { cache: 'no-store' });
                if (proxyRes.ok) {
                    const html = await proxyRes.text();
                    freshPages = parseMangaKatanaPagesHtml(html);
                }
                if (freshPages.length === 0) {
                    const res = await fetch(`/api/crawler/pages?source=mangakatana&url=${encodeURIComponent(mkUrl)}`, { cache: 'no-store' });
                    const json = await res.json();
                    freshPages = json.pages || [];
                }
                if (freshPages.length > 0) {
                    chapterObj.pages = freshPages;
                    chapterObj.pagesSaver = freshPages;
                    await saveLocalChaptersBulk([chapterObj]);
                    await fetch('/api/chapters', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(chapterObj)
                    });
                }
            } catch (_) {}
        }

        setCurrentChapter(chapterObj);
        setSinglePageIndex(0);
        window.scrollTo({ top: 0, behavior: 'instant' });

        fetchAndSyncComments(chapterObj.id)
            .then(cmts => setComments(Array.isArray(cmts) ? cmts : []))
            .catch(() => setComments([]));
    };

    const handlePostComment = async (e) => {
        e.preventDefault();
        if (!currentChapter || !commentText.trim()) return;
        const author = (nickname || 'Reader').trim() || 'Anonymous Reader';
        localStorage.setItem('vaniscans_reader_nickname', author);

        const palette = ['#8b5cf6', '#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6'];
        const avatarColor = palette[Math.abs(author.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % palette.length];

        try {
            const created = await postAndSyncComment(currentChapter.id, author, commentText, avatarColor);
            const refreshed = await fetchAndSyncComments(currentChapter.id);
            setComments(refreshed.length > 0 ? refreshed : [created, ...comments]);
            setCommentText('');
        } catch (_) {}
    };

    const handleDeleteComment = async (cmtId) => {
        if (!currentChapter) return;
        try {
            await deleteAndSyncComment(currentChapter.id, cmtId);
            setComments(comments.filter(c => c.id !== cmtId));
        } catch (_) {}
    };

    const toggleFullScreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#07080d] text-purple-400">
                <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full"></div>
            </div>
        );
    }

    if (!currentChapter || !manga) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#07080d] text-slate-300 space-y-4">
                <h1 className="text-xl font-bold">Chapter not found</h1>
                <a href={`/comics/${slug}`} className="px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold">Back to Series</a>
            </div>
        );
    }

    const currentIndex = chapters.findIndex(c => c.id === currentChapter.id);
    const prevCh = currentIndex > 0 ? chapters[currentIndex - 1] : null;
    const nextCh = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

    const getChSlugNum = (ch, idx) => {
        if (typeof ch.number === 'number' && !isNaN(ch.number)) return String(ch.number);
        return String(idx + 1);
    };

    const pages = currentChapter.pages || [];
    const ads = monetization?.ads || {};
    const rawChUrl = currentChapter.mangakatanaChapterUrl || currentChapter.url || '';
    const activeChapterUrl = rawChUrl.startsWith('http') 
        ? rawChUrl 
        : (rawChUrl ? `https://mangakatana.com${rawChUrl.startsWith('/') ? '' : '/'}${rawChUrl}` : '');

    return (
        <div className="min-h-screen bg-[#07080d] text-slate-100 flex flex-col select-none">
            {/* Top Navigation */}
            <header className="sticky top-0 z-50 bg-[#0e101c]/95 border-b border-[#21253d] px-4 py-2.5 backdrop-blur-md flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <a href={`/comics/${slug}`} className="p-2 hover:bg-white/10 rounded-xl text-slate-300">←</a>
                    <div className="min-w-0">
                        <div className="text-xs font-semibold text-purple-400 truncate max-w-[140px] sm:max-w-xs">{manga.title}</div>
                        <div className="text-sm font-black text-white truncate max-w-[160px] sm:max-w-sm">{currentChapter.title}</div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button disabled={!prevCh} onClick={() => prevCh && router.push(`/comics/${slug}/chapter/${getChSlugNum(prevCh, currentIndex - 1)}`)} className="p-2 bg-[#171a2d] disabled:opacity-40 rounded-xl text-white">◀</button>
                    <select value={currentChapter.id} onChange={e => {
                        const target = chapters.find(c => c.id === e.target.value);
                        if (target) {
                            const idx = chapters.indexOf(target);
                            router.push(`/comics/${slug}/chapter/${getChSlugNum(target, idx)}`);
                        }
                    }} className="bg-[#171a2d] border border-[#292e4c] text-xs font-semibold text-white rounded-xl px-2 py-2 outline-none max-w-[130px] sm:max-w-xs truncate">
                        {chapters.map((ch) => (
                            <option key={ch.id} value={ch.id}>{ch.title}</option>
                        ))}
                    </select>
                    <button disabled={!nextCh} onClick={() => nextCh && router.push(`/comics/${slug}/chapter/${getChSlugNum(nextCh, currentIndex + 1)}`)} className="p-2 bg-[#171a2d] disabled:opacity-40 rounded-xl text-white">▶</button>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={() => setReadingMode(readingMode === 'webtoon' ? 'single' : 'webtoon')} className="hidden sm:block px-3 py-2 bg-[#171a2d] rounded-xl text-xs font-medium text-slate-300 border border-[#292e4c]">
                        {readingMode === 'webtoon' ? '📱 Webtoon (Scroll)' : '📄 Single Page'}
                    </button>
                    <button onClick={() => loadChapterData(currentChapter, true)} className="px-2.5 py-2 bg-[#171a2d] hover:bg-purple-600/30 rounded-xl border border-[#292e4c] text-xs font-semibold text-purple-300" title="Reload Images from Source">
                        ↻ Reload Images
                    </button>
                    <button onClick={toggleFullScreen} className="p-2 bg-[#171a2d] rounded-xl border border-[#292e4c] text-slate-300" title="Fullscreen">
                        ⛶
                    </button>
                </div>
            </header>

            {/* Reader Container with 4 In-Chapter Ad Placements */}
            <div className="flex-grow flex flex-col items-center justify-start py-4 w-full">
                {readingMode === 'webtoon' ? (
                    <div className="w-full">
                        <AdSlotBanner slot={ads.beforeFirst} />
                        {pages.map((pageUrl, idx) => {
                            const pageNum = idx + 1;
                            return (
                                <React.Fragment key={`${currentChapter.id}-p-${pageNum}`}>
                                    <MangaPageImage rawUrl={pageUrl} pageNum={pageNum} chapterUrl={activeChapterUrl} />
                                    {pageNum === 5 && <AdSlotBanner slot={ads.afterFifth} />}
                                    {pageNum === 10 && <AdSlotBanner slot={ads.afterTenth} />}
                                </React.Fragment>
                            );
                        })}
                        <AdSlotBanner slot={ads.afterLast} />
                    </div>
                ) : (
                    <div className="w-full flex flex-col items-center space-y-4">
                        {singlePageIndex === 0 && <AdSlotBanner slot={ads.beforeFirst} />}
                        <MangaPageImage rawUrl={pages[singlePageIndex]} pageNum={singlePageIndex + 1} chapterUrl={activeChapterUrl} />
                        {singlePageIndex + 1 === 5 && <AdSlotBanner slot={ads.afterFifth} />}
                        {singlePageIndex + 1 === 10 && <AdSlotBanner slot={ads.afterTenth} />}
                        {singlePageIndex + 1 === pages.length && <AdSlotBanner slot={ads.afterLast} />}

                        <div className="sticky bottom-6 z-40 flex items-center gap-4 bg-black/85 backdrop-blur-md px-4 py-2.5 rounded-full border border-purple-500/30 text-xs font-bold text-purple-300 shadow-2xl">
                            <button disabled={singlePageIndex <= 0} onClick={() => setSinglePageIndex(singlePageIndex - 1)} className="px-3 py-1 bg-purple-600/40 hover:bg-purple-600 text-white rounded-lg disabled:opacity-40">Prev Page</button>
                            <span>{singlePageIndex + 1} / {pages.length || 1}</span>
                            <button disabled={singlePageIndex >= (pages.length || 1) - 1} onClick={() => setSinglePageIndex(singlePageIndex + 1)} className="px-3 py-1 bg-purple-600/40 hover:bg-purple-600 text-white rounded-lg disabled:opacity-40">Next Page</button>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Chapter Navigation */}
            <div className="max-w-2xl mx-auto w-full pt-12 pb-6 px-4 flex flex-col items-center gap-4 text-center">
                <div className="text-xs font-medium text-slate-400">Finished reading this chapter?</div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                    {chapters.length > 0 && (
                        <button onClick={() => router.push(`/comics/${slug}/chapter/${getChSlugNum(chapters[0], 0)}`)} className="px-4 py-2 bg-[#16182a] hover:bg-purple-600/30 rounded-xl text-xs font-bold text-purple-300 border border-purple-500/30 transition">
                            ⏮ First Chapter
                        </button>
                    )}
                    <button disabled={!prevCh} onClick={() => prevCh && router.push(`/comics/${slug}/chapter/${getChSlugNum(prevCh, currentIndex - 1)}`)} className="px-4 py-2 bg-[#16182a] hover:bg-purple-600 disabled:opacity-40 rounded-xl text-xs font-bold text-white border border-[#242842] transition">
                        Previous Chapter
                    </button>
                    <button disabled={!nextCh} onClick={() => nextCh && router.push(`/comics/${slug}/chapter/${getChSlugNum(nextCh, currentIndex + 1)}`)} className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 disabled:opacity-40 text-xs font-black uppercase tracking-wider text-white rounded-xl shadow-lg shadow-purple-600/30 transition">
                        Next Chapter
                    </button>
                </div>
            </div>

            {/* Comments & Discussion */}
            <section className="max-w-3xl mx-auto w-full px-4 pb-20 pt-4 select-text">
                <div className="bg-[#121422] border border-[#20243b] rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
                    <h3 className="text-base font-black text-white">💬 CHAPTER DISCUSSION & CHAT ({comments.length})</h3>

                    <form onSubmit={handlePostComment} className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <input type="text" value={nickname} onChange={e => setNickname(e.target.value)} maxLength={32} placeholder="Your Display Name" className="bg-[#181b2e] border border-[#292d4b] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-purple-500" />
                            <div className="sm:col-span-2 flex gap-2">
                                <input type="text" value={commentText} onChange={e => setCommentText(e.target.value)} required maxLength={600} placeholder="Write a comment about this chapter..." className="flex-1 bg-[#181b2e] border border-[#292d4b] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-purple-500" />
                                <button type="submit" className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shrink-0">Post</button>
                            </div>
                        </div>
                    </form>

                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                        {comments.length === 0 ? (
                            <div className="py-8 text-center bg-[#16192a] rounded-2xl border border-dashed border-[#242842] text-xs text-slate-400">
                                No comments on this chapter yet. Be the first reader to start the discussion!
                            </div>
                        ) : (
                            comments.map(c => (
                                <div key={c.id} className="p-4 rounded-2xl bg-[#16192a] border border-[#22263e] flex items-start gap-3.5">
                                    <div className="w-8 h-8 rounded-xl font-black text-xs text-white flex items-center justify-center shrink-0" style={{ background: c.avatarColor || '#8b5cf6' }}>
                                        {(c.author || 'R').charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-white">{c.author}</span>
                                            <button type="button" onClick={() => handleDeleteComment(c.id)} className="text-[11px] text-rose-400 hover:text-rose-300">Delete</button>
                                        </div>
                                        <p className="text-xs text-slate-300 mt-1 break-words">{c.text}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
}
