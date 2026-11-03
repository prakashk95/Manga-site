import React, { useState, useEffect } from 'react';
import {
    fetchAndSyncMangas,
    fetchAndSyncComments,
    postAndSyncComment,
    deleteAndSyncComment
} from '@/lib/clientStorage';
import { coverSrc } from '@/lib/coverUrl';

function buildMangaSlug(m) {
    if (!m) return 'series';
    if (m.customSlug && typeof m.customSlug === 'string' && m.customSlug.trim()) {
        const cleanCustom = m.customSlug
            .trim()
            .replace(/^https?:\/\/[^/]+\/(?:comics\/)?/i, '')
            .replace(/^\/?comics\//i, '')
            .split('/')[0]
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '');
        if (cleanCustom) return cleanCustom;
    }
    const base = (m.title || 'series').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const hash = (m.mangadexId || m.mangakatanaId || m.mangafireId || m.comixId || m.mgekoId || m.fanfoxId || m.id || '')
        .toString()
        .replace(/^manga-(md|mk|mf|co|mg|ff)-/i, '')
        .slice(0, 8)
        .toLowerCase();
    return hash ? `${base}-${hash}` : base;
}

export default function MangaSeriesExtras({ manga, initialRelated = [] }) {
    const [related, setRelated] = useState(initialRelated);
    const [comments, setComments] = useState([]);
    const [nickname, setNickname] = useState('');
    const [commentText, setCommentText] = useState('');

    const seriesCommentKey = manga?.id ? `series-${manga.id}` : '';

    useEffect(() => {
        try {
            const savedNick = localStorage.getItem('vaniscans_reader_nickname');
            if (savedNick) setNickname(savedNick);
        } catch (_) {}

        if (seriesCommentKey) {
            fetchAndSyncComments(seriesCommentKey)
                .then(list => setComments(Array.isArray(list) ? list : []))
                .catch(() => setComments([]));
        }

        // Hydrate related series from client/server catalog if fewer than 4 were passed from SSR
        fetchAndSyncMangas()
            .then(catalog => {
                if (!Array.isArray(catalog) || !manga) return;
                const targetGenres = new Set(
                    (Array.isArray(manga.genres) ? manga.genres : [])
                        .map(g => (g || '').toString().toLowerCase().trim())
                        .filter(Boolean)
                );
                const computed = catalog
                    .filter(m => m && m.id !== manga.id)
                    .map(m => {
                        const mGenres = (Array.isArray(m.genres) ? m.genres : [])
                            .map(g => (g || '').toString().toLowerCase().trim())
                            .filter(Boolean);
                        let shared = 0;
                        for (const g of mGenres) {
                            if (targetGenres.has(g)) shared += 1;
                        }
                        return { m, shared };
                    })
                    .sort((a, b) => {
                        if (b.shared !== a.shared) return b.shared - a.shared;
                        if ((Number(b.m.rating) || 0) !== (Number(a.m.rating) || 0)) {
                            return (Number(b.m.rating) || 0) - (Number(a.m.rating) || 0);
                        }
                        return (Number(b.m.updatedAt) || 0) - (Number(a.m.updatedAt) || 0);
                    })
                    .slice(0, 4)
                    .map(x => x.m);

                if (computed.length > 0) {
                    setRelated(computed);
                }
            })
            .catch(() => {});
    }, [manga?.id, seriesCommentKey]);

    const handlePostComment = async (e) => {
        e.preventDefault();
        if (!seriesCommentKey || !commentText.trim()) return;
        const author = (nickname || 'Reader').trim() || 'Anonymous Reader';
        try {
            localStorage.setItem('vaniscans_reader_nickname', author);
        } catch (_) {}

        const palette = ['#8b5cf6', '#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6'];
        const avatarColor = palette[Math.abs(author.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % palette.length];

        try {
            const created = await postAndSyncComment(seriesCommentKey, author, commentText, avatarColor);
            const refreshed = await fetchAndSyncComments(seriesCommentKey);
            setComments(refreshed.length > 0 ? refreshed : [created, ...comments]);
            setCommentText('');
        } catch (_) {}
    };

    const handleDeleteComment = async (cmtId) => {
        if (!seriesCommentKey) return;
        try {
            await deleteAndSyncComment(seriesCommentKey, cmtId);
            setComments(prev => prev.filter(c => c.id !== cmtId));
        } catch (_) {}
    };

    const renderStars = (ratingVal) => {
        const num = Number(ratingVal) || 9.6;
        const fiveScale = Math.min(5, Math.max(1, num / 2));
        const fullStars = Math.floor(fiveScale);
        const halfStar = fiveScale - fullStars >= 0.4;
        return (
            <div className="flex items-center gap-1 text-[11px] mt-1">
                <span className="text-amber-400 tracking-tight">
                    {'★'.repeat(fullStars)}
                    {halfStar ? '★' : ''}
                    <span className="text-slate-600">{'★'.repeat(Math.max(0, 5 - fullStars - (halfStar ? 1 : 0)))}</span>
                </span>
                <span className="text-slate-400 font-semibold italic">{num.toFixed(1)}</span>
            </div>
        );
    };

    return (
        <div className="space-y-6 mt-6">
            {/* Related Series Section (4 Similar Series based on Genres & Tags) */}
            <section className="bg-[#121422] border border-[#20243b] rounded-2xl overflow-hidden shadow-2xl">
                <div className="bg-gradient-to-r from-[#2e1065] via-[#581c87] to-[#7e22ce] px-5 py-3 flex items-center justify-between">
                    <h2 className="text-sm sm:text-base font-black text-white tracking-wide">Related Series</h2>
                    <span className="text-[11px] font-semibold text-purple-200/90">Similar Categories & Tags</span>
                </div>

                <div className="p-5 sm:p-6">
                    {related.length === 0 ? (
                        <div className="text-xs text-slate-400 py-8 text-center bg-[#16192a] rounded-xl border border-dashed border-[#242842]">
                            More related series will appear here as you add series to your catalog.
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-5">
                            {related.slice(0, 4).map((item) => {
                                const rSlug = buildMangaSlug(item);
                                const latestCh = Array.isArray(item.latestChapters) && item.latestChapters.length > 0
                                    ? item.latestChapters[0]
                                    : null;
                                const latestLabel = latestCh?.title
                                    ? latestCh.title
                                    : (item.lastChapter ? `Chapter ${item.lastChapter}` : item.status || 'Ongoing');

                                return (
                                    <a
                                        key={item.id}
                                        href={`/comics/${rSlug}`}
                                        className="group flex flex-col text-left transition-transform duration-300 hover:-translate-y-1"
                                    >
                                        <div className="relative aspect-[3/4] w-full rounded-xl overflow-hidden bg-[#181b2e] border border-white/10 shadow-lg mb-2.5">
                                            <img
                                                src={coverSrc(item.cover, item.fanfoxUrl)}
                                                alt={item.title}
                                                referrerPolicy="no-referrer"
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-80"></div>
                                            <div className="absolute bottom-2 left-2">
                                                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 shadow">
                                                    ⚡ {(item.genres && item.genres[0]) ? item.genres[0] : 'COLOR'}
                                                </span>
                                            </div>
                                        </div>
                                        <h3 className="text-xs sm:text-sm font-bold text-white group-hover:text-purple-400 transition line-clamp-2 leading-snug">
                                            {item.title}
                                        </h3>
                                        <span className="text-[11px] text-slate-400 mt-1 truncate">
                                            {latestLabel}
                                        </span>
                                        {renderStars(item.rating)}
                                    </a>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>

            {/* Series Comment Section */}
            <section className="bg-[#121422] border border-[#20243b] rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
                <div className="flex items-center justify-between border-b border-[#1f2337] pb-4">
                    <div>
                        <h2 className="text-base sm:text-lg font-black text-white">💬 SERIES COMMENTS & DISCUSSION ({comments.length})</h2>
                        <p className="text-xs text-slate-400 mt-0.5">Share your thoughts and reviews about {manga?.title || 'this series'}.</p>
                    </div>
                </div>

                <form onSubmit={handlePostComment} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input
                            type="text"
                            value={nickname}
                            onChange={e => setNickname(e.target.value)}
                            maxLength={32}
                            placeholder="Your Display Name"
                            className="bg-[#181b2e] border border-[#292d4b] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                        />
                        <div className="sm:col-span-2 flex gap-2">
                            <input
                                type="text"
                                value={commentText}
                                onChange={e => setCommentText(e.target.value)}
                                required
                                maxLength={600}
                                placeholder={`Write a comment about ${manga?.title || 'this series'}...`}
                                className="flex-1 bg-[#181b2e] border border-[#292d4b] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                            />
                            <button
                                type="submit"
                                className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shrink-0 shadow-lg shadow-purple-600/25 transition"
                            >
                                Post
                            </button>
                        </div>
                    </div>
                </form>

                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {comments.length === 0 ? (
                        <div className="py-8 text-center bg-[#16192a] rounded-2xl border border-dashed border-[#242842] text-xs text-slate-400">
                            No comments yet. Be the first reader to start the discussion!
                        </div>
                    ) : (
                        comments.map(c => (
                            <div key={c.id} className="p-4 rounded-2xl bg-[#16192a] border border-[#22263e] flex items-start gap-3.5">
                                <div
                                    className="w-8 h-8 rounded-xl font-black text-xs text-white flex items-center justify-center shrink-0"
                                    style={{ background: c.avatarColor || '#8b5cf6' }}
                                >
                                    {(c.author || 'R').charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-white">{c.author}</span>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteComment(c.id)}
                                            className="text-[11px] text-rose-400 hover:text-rose-300"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                    <p className="text-xs text-slate-300 mt-1 break-words">{c.text}</p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </section>
        </div>
    );
}
