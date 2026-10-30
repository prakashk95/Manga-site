'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DEFAULT_MONETIZATION, mergeMonetization } from '@/lib/monetization';
import {
    verifyAdminCredentials,
    fetchAndSyncMangas,
    fetchAndSyncChapters,
    saveLocalManga,
    deleteLocalManga,
    saveLocalChaptersBulk,
    deleteLocalChapter
} from '@/lib/clientStorage';
import {
    parseMangaKatanaHtmlSearch,
    parseMangaKatanaChaptersHtml,
    parseMangaKatanaPagesHtml,
    formatMangaDexSearchData,
    fetchMangaFireSearch,
    fetchMangaFireChapters,
    fetchMangaFirePages
} from '@/lib/crawler';

export default function AdminPanelPage() {
    const [isAuthed, setIsAuthed] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [activeTab, setActiveTab] = useState('newSeries');
    const [toast, setToast] = useState(null);

    // Tab 1: Series Form & Chapter Management State
    const [mangas, setMangas] = useState([]);
    const [editingId, setEditingId] = useState('');
    const [title, setTitle] = useState('');
    const [author, setAuthor] = useState('');
    const [coverUrl, setCoverUrl] = useState('');
    const [coverFileName, setCoverFileName] = useState('');
    const [genres, setGenres] = useState('Action, Fantasy');
    const [status, setStatus] = useState('Ongoing');
    const [rating, setRating] = useState('9.8');
    const [synopsis, setSynopsis] = useState('');
    const [metaTitle, setMetaTitle] = useState('');
    const [metaDescription, setMetaDescription] = useState('');
    const [editChapters, setEditChapters] = useState([]);
    const [chapterFilterQuery, setChapterFilterQuery] = useState('');

    // Tab 2: Single Chapter Upload State
    const [singleSeriesId, setSingleSeriesId] = useState('');
    const [singleChTitle, setSingleChTitle] = useState('');
    const [singleChUrls, setSingleChUrls] = useState('');
    const [singleChFiles, setSingleChFiles] = useState([]);

    // Tab 3: Crawler & Chapter Selector State + Bulk ZIP
    const [crawlerSource, setCrawlerSource] = useState('mangadex');
    const [crawlerLang, setCrawlerLang] = useState('en');
    const [searchQuery, setSearchQuery] = useState('');
    const [crawlerWorkspace, setCrawlerWorkspace] = useState(false);
    const [scannedResults, setScannedResults] = useState([]);
    const [scannerStatus, setScannerStatus] = useState('Ready');
    const [isScanning, setIsScanning] = useState(false);
    const [selectedMangaToCrawl, setSelectedMangaToCrawl] = useState(null);
    const [crawledChaptersList, setCrawledChaptersList] = useState([]);
    const [selectedChapterKeys, setSelectedChapterKeys] = useState({});
    const [crawlChapterFilter, setCrawlChapterFilter] = useState('');
    const [crawlLoading, setCrawlLoading] = useState(false);
    const [crawlProgress, setCrawlProgress] = useState('');

    // Bulk ZIP state
    const [zipSeriesId, setZipSeriesId] = useState('');
    const [pendingZipFile, setPendingZipFile] = useState(null);
    const [zipProcessing, setZipProcessing] = useState(false);
    const [zipStatus, setZipStatus] = useState('');

    // Tab 4: Monetization & Analytics State
    const [monetization, setMonetization] = useState(() => mergeMonetization(null));

    const showToast = (message, type = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    useEffect(() => {
        const auth = sessionStorage.getItem('vaniscans_admin_auth');
        if (auth === 'true') {
            setIsAuthed(true);
            loadMangas();
            loadMonetization();
        }
    }, []);

    const loadMangas = async () => {
        try {
            const data = await fetchAndSyncMangas();
            if (Array.isArray(data)) {
                setMangas(data);
                if (data.length > 0) {
                    setSingleSeriesId(prev => prev || data[0].id);
                    setZipSeriesId(prev => prev || data[0].id);
                }
            }
        } catch (_) {}
    };

    const loadMonetization = async () => {
        try {
            const res = await fetch('/api/monetization', { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                if (data && Object.keys(data).length > 0) {
                    setMonetization(mergeMonetization(data));
                    localStorage.setItem('vaniscans_monetization', JSON.stringify(mergeMonetization(data)));
                    return;
                }
            }
        } catch (_) {}
        try {
            const localRaw = JSON.parse(localStorage.getItem('vaniscans_monetization') || '{}');
            setMonetization(mergeMonetization(localRaw));
        } catch (_) {}
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const isValid = await verifyAdminCredentials(username, password);
            if (isValid) {
                sessionStorage.setItem('vaniscans_admin_auth', 'true');
                setIsAuthed(true);
                setUsername('');
                setPassword('');
                loadMangas();
                loadMonetization();
                showToast('Authentication verified via SHA-256!', 'success');
            } else {
                showToast('Invalid credentials provided', 'error');
            }
        } catch (err) {
            showToast(err.message || 'Authentication error', 'error');
        }
    };

    const handleCoverFilePicked = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCoverFileName(file.name);
        const reader = new FileReader();
        reader.onload = (ev) => {
            setCoverUrl(ev.target.result);
        };
        reader.readAsDataURL(file);
    };

    const handleSaveSeries = async (e) => {
        e.preventDefault();
        const finalMetaTitle = metaTitle.trim() || `Read ${title} - VaniScans`;
        const finalMetaDescription = metaDescription.trim() || `Read ${title} / ${synopsis || 'Read manga, manhwa and webtoons online on VaniScans.'}`;

        const mangaData = {
            id: editingId || `manga-${Date.now()}`,
            title,
            author: author || 'Studio Original',
            cover: coverUrl || 'https://placehold.co/400x600/1a1d30/a855f7?text=Cover',
            banner: coverUrl || 'https://placehold.co/400x600/1a1d30/a855f7?text=Cover',
            genres: genres.split(',').map(g => g.trim()).filter(Boolean),
            status,
            rating: parseFloat(rating) || 9.8,
            synopsis: synopsis || 'No synopsis provided.',
            metaTitle: finalMetaTitle,
            metaDescription: finalMetaDescription,
            updatedAt: Date.now()
        };

        try {
            await saveLocalManga(mangaData);
            await fetch('/api/mangas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mangaData)
            });
            showToast(editingId ? `Updated series & SEO metadata for "${title}"!` : `Created series "${title}"!`, 'success');
            resetSeriesForm();
            loadMangas();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const loadSeriesForEdit = async (manga) => {
        setEditingId(manga.id);
        setTitle(manga.title);
        setAuthor(manga.author || '');
        setCoverUrl(manga.cover || '');
        setCoverFileName('');
        setGenres((manga.genres || ['Action']).join(', '));
        setStatus(manga.status || 'Ongoing');
        setRating(String(manga.rating || '9.8'));
        setSynopsis(manga.synopsis || '');
        setMetaTitle(manga.metaTitle || `Read ${manga.title} - VaniScans`);
        setMetaDescription(manga.metaDescription || `Read ${manga.title} / ${manga.synopsis || 'Read manga, manhwa and webtoons online on VaniScans.'}`);

        try {
            const chs = await fetchAndSyncChapters(manga.id);
            if (Array.isArray(chs)) {
                chs.sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
                setEditChapters(chs);
            } else {
                setEditChapters([]);
            }
        } catch (_) {
            setEditChapters([]);
        }

        setActiveTab('newSeries');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showToast(`Loaded "${manga.title}" (${manga.id}) for editing`, 'info');
    };

    const resetSeriesForm = () => {
        setEditingId('');
        setTitle('');
        setAuthor('');
        setCoverUrl('');
        setCoverFileName('');
        setGenres('Action, Fantasy');
        setStatus('Ongoing');
        setRating('9.8');
        setSynopsis('');
        setMetaTitle('');
        setMetaDescription('');
        setEditChapters([]);
        setChapterFilterQuery('');
    };

    const deleteChapter = async (chId, chTitle) => {
        try {
            await deleteLocalChapter(chId);
            await fetch(`/api/chapters/${encodeURIComponent(chId)}`, { method: 'DELETE' });
            setEditChapters(prev => prev.filter(c => c.id !== chId));
            showToast(`Removed "${chTitle || chId}"`, 'success');
        } catch (err) {
            showToast('Failed to delete chapter', 'error');
        }
    };

    const deleteSeries = async (mId, mTitle) => {
        try {
            await deleteLocalManga(mId);
            await fetch(`/api/mangas/${encodeURIComponent(mId)}`, { method: 'DELETE' });
            if (editingId === mId) resetSeriesForm();
            loadMangas();
            showToast(`Deleted series "${mTitle || mId}"`, 'info');
        } catch (_) {
            showToast('Failed to delete series', 'error');
        }
    };

    // Tab 2: Single Chapter Upload Handler
    const handleCreateSingleChapter = async (e) => {
        e.preventDefault();
        if (!singleSeriesId) {
            showToast('Please select a target series first', 'error');
            return;
        }
        const pages = [];
        if (singleChFiles && singleChFiles.length > 0) {
            const sortedFiles = Array.from(singleChFiles).sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
            );
            for (const f of sortedFiles) {
                const dataUrl = await new Promise(res => {
                    const r = new FileReader();
                    r.onload = ev => res(ev.target.result);
                    r.readAsDataURL(f);
                });
                pages.push(dataUrl);
            }
        }
        if (singleChUrls.trim()) {
            const urls = singleChUrls.split('\n').map(u => u.trim()).filter(Boolean);
            pages.push(...urls);
        }
        if (pages.length === 0) {
            showToast('Please provide image files or page URLs', 'error');
            return;
        }

        const newChapter = {
            id: `${singleSeriesId}-ch-${Date.now()}`,
            mangaId: singleSeriesId,
            title: singleChTitle.trim(),
            number: parseFloat(singleChTitle.replace(/[^\d.-]/g, '')) || 1,
            pages,
            pagesSaver: pages,
            createdAt: Date.now()
        };

        try {
            await saveLocalChaptersBulk([newChapter]);
            await fetch('/api/chapters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newChapter)
            });
            setSingleChTitle('');
            setSingleChUrls('');
            setSingleChFiles([]);
            showToast(`Published "${newChapter.title}" (${pages.length} pages)!`, 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    // Client-side proxy fallback helper if serverless IP is blocked by MangaKatana/MangaDex
    const fetchClientHtmlFallback = async (targetUrl) => {
        const tryProxy = async (url, unwrap = false) => {
            const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            if (unwrap) {
                const j = await r.json();
                if (j && typeof j.contents === 'string' && j.contents.length > 200) return j.contents;
                throw new Error('Empty');
            }
            const t = await r.text();
            if (t && t.length > 200) return t;
            throw new Error('Empty');
        };
        return await Promise.any([
            tryProxy(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`, false),
            tryProxy(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, false),
            tryProxy(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`, true),
            tryProxy(`https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`, false)
        ]);
    };

    // Tab 3: Crawler Search & Chapter Selector
    const handleScan = async (presetQuery = null, forceSource = null) => {
        const activeSrc = forceSource || crawlerSource;
        if (forceSource) setCrawlerSource(forceSource);
        const q = presetQuery !== null ? presetQuery : searchQuery.trim();
        if (presetQuery !== null) setSearchQuery(presetQuery);

        const sourceLabel =
            activeSrc === 'mangakatana'
                ? 'MangaKatana.com'
                : activeSrc === 'mangafire'
                ? 'MangaFire'
                : 'MangaDex.org';

        setCrawlerWorkspace(true);
        setIsScanning(true);
        setScannerStatus(`Searching ${sourceLabel}${q ? ` for "${q}"` : ''}...`);
        setScannedResults([]);
        setSelectedMangaToCrawl(null);
        setCrawledChaptersList([]);

        try {
            const res = await fetch(`/api/crawler/search?q=${encodeURIComponent(q)}&source=${activeSrc}`);
            const json = await res.json();
            let list = Array.isArray(json?.data) ? json.data : [];

            // Client-side fallback if serverless container returned 0 results
            if (list.length === 0) {
                if (activeSrc === 'mangafire') {
                    list = await fetchMangaFireSearch(q);
                } else if (activeSrc === 'mangakatana') {
                    let targetUrl = 'https://mangakatana.com/manga';
                    if (q.startsWith('http') && q.includes('mangakatana.com/manga/')) targetUrl = q;
                    else if (q) targetUrl = `https://mangakatana.com/?search=${encodeURIComponent(q)}&search_by=book_name`;
                    const html = await fetchClientHtmlFallback(targetUrl);
                    list = parseMangaKatanaHtmlSearch(html, targetUrl, q);
                } else {
                    const params = new URLSearchParams();
                    params.append('limit', '24');
                    params.append('includes[]', 'cover_art');
                    params.append('includes[]', 'author');
                    params.append('contentRating[]', 'safe');
                    params.append('contentRating[]', 'suggestive');
                    params.append('hasAvailableChapters', 'true');
                    if (q) {
                        params.append('title', q);
                        params.append('order[relevance]', 'desc');
                    } else {
                        params.append('order[followedCount]', 'desc');
                    }
                    const directRes = await fetch(`https://api.mangadex.org/manga?${params.toString()}`);
                    const directJson = await directRes.json();
                    list = await formatMangaDexSearchData(directJson?.data || []);
                }
            }

            setScannedResults(list);
            setScannerStatus(
                list.length > 0
                    ? `Found ${list.length} series on ${sourceLabel} — Click "View Chapters & Select" on any series below.`
                    : `No series matched "${q}". Try another keyword or switch source.`
            );
        } catch (err) {
            setScannerStatus(`Crawler error: ${err.message}`);
        } finally {
            setIsScanning(false);
        }
    };

    const fetchChaptersForScannedManga = async (item) => {
        setSelectedMangaToCrawl(item);
        setCrawledChaptersList([]);
        setCrawlChapterFilter('');
        const isKatana = item.sourceHost === 'mangakatana.com' || !!item.mangakatanaId;
        const isMangaFire = item.sourceHost === 'mangafire' || !!item.mangafireId;
        setScannerStatus(`Loading full chapter list for "${item.title}"...`);

        try {
            const endpoint = isMangaFire
                ? `/api/crawler/chapters?source=mangafire&mangaId=${encodeURIComponent(item.mangafireId)}&lang=${encodeURIComponent(crawlerLang)}`
                : isKatana
                ? `/api/crawler/chapters?source=mangakatana&url=${encodeURIComponent(item.mangakatanaUrl || item.mangakatanaId)}`
                : `/api/crawler/chapters?source=mangadex&mangaId=${encodeURIComponent(item.mangadexId)}&lang=${encodeURIComponent(crawlerLang)}`;

            const res = await fetch(endpoint);
            const json = await res.json();
            let list = Array.isArray(json?.data) ? json.data : [];

            // Client-side fallback if serverless fetch returned 0 chapters
            if (list.length === 0) {
                if (isMangaFire) {
                    list = await fetchMangaFireChapters(item.mangafireId, crawlerLang);
                } else if (isKatana) {
                    const cleanUrl = (item.mangakatanaUrl || '').startsWith('http')
                        ? item.mangakatanaUrl
                        : `https://mangakatana.com/manga/${(item.mangakatanaId || '').replace(/^\/+/, '')}`;
                    const html = await fetchClientHtmlFallback(cleanUrl);
                    list = parseMangaKatanaChaptersHtml(html);
                }
            }

            setCrawledChaptersList(list);

            // Select all chapters by default
            const initialSelected = {};
            list.forEach(c => {
                const key = c.id || c.url;
                initialSelected[key] = true;
            });
            setSelectedChapterKeys(initialSelected);
            setScannerStatus(
                list.length > 0
                    ? `Loaded ${list.length} chapters for "${item.title}". Choose which chapters to pull below.`
                    : `0 hosted image chapters found for "${item.title}".`
            );
        } catch (err) {
            setScannerStatus(`Error loading chapters: ${err.message}`);
        }
    };

    const toggleSelectAllChapters = (select) => {
        const next = {};
        crawledChaptersList.forEach(c => {
            const key = c.id || c.url;
            next[key] = select;
        });
        setSelectedChapterKeys(next);
    };

    const toggleChapterSelection = (key) => {
        setSelectedChapterKeys(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const importSelectedChaptersToDb = async () => {
        if (!selectedMangaToCrawl) return;
        const chosen = crawledChaptersList.filter(c => selectedChapterKeys[c.id || c.url]);
        if (chosen.length === 0) {
            showToast('Please select at least one chapter to pull', 'error');
            return;
        }

        setCrawlLoading(true);
        setCrawlProgress(`Saving series metadata & preparing ${chosen.length} selected chapters...`);

        try {
            const item = selectedMangaToCrawl;
            const isKatana = item.sourceHost === 'mangakatana.com' || !!item.mangakatanaId;
            const isMangaFire = item.sourceHost === 'mangafire' || !!item.mangafireId;
            const defaultId = isMangaFire
                ? `manga-mf-${(item.mangafireId || Date.now()).toString().replace(/[^a-z0-9]/gi, '').slice(0, 10)}`
                : isKatana
                ? `manga-mk-${(item.mangakatanaId || Date.now()).toString().replace(/[^a-z0-9]/gi, '').slice(0, 10)}`
                : `manga-md-${(item.mangadexId || Date.now()).toString().slice(0, 8)}`;

            const mangaPayload = {
                id: defaultId,
                mangadexId: item.mangadexId || null,
                mangakatanaId: item.mangakatanaId || null,
                mangakatanaUrl: item.mangakatanaUrl || null,
                mangafireId: item.mangafireId || null,
                title: item.title,
                author: item.author || 'Manga Creator',
                cover: item.cover,
                banner: item.cover,
                genres: item.genres || ['Action'],
                status: item.status || 'Ongoing',
                rating: parseFloat(item.rating) || 9.6,
                synopsis: item.synopsis || 'Imported series.',
                metaTitle: `Read ${item.title} - VaniScans`,
                metaDescription: `Read ${item.title} / ${item.synopsis || 'Read manga, manhwa and webtoons online on VaniScans.'}`,
                updatedAt: Date.now()
            };

            const savedMangaRes = await fetch('/api/mangas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mangaPayload)
            });
            const savedManga = await savedMangaRes.json();
            const targetMangaId = savedManga?.id || defaultId;
            await saveLocalManga({ ...mangaPayload, id: targetMangaId });

            const finalChapters = [];
            for (let i = 0; i < chosen.length; i++) {
                const ch = chosen[i];
                setCrawlProgress(`Pulling (${i + 1}/${chosen.length}): ${ch.title}`);

                let pages = [];
                let pagesSaver = [];

                try {
                    const pageRes = isMangaFire
                        ? await fetch(`/api/crawler/pages?source=mangafire&chapterId=${encodeURIComponent(ch.mangafireChapterId || ch.id)}`)
                        : isKatana
                        ? await fetch(`/api/crawler/pages?source=mangakatana&url=${encodeURIComponent(ch.url)}`)
                        : await fetch(`/api/crawler/pages?source=mangadex&chapterId=${encodeURIComponent(ch.mangadexChapterId || ch.id)}`);
                    const pageJson = await pageRes.json();
                    pages = pageJson.pages || [];
                    pagesSaver = pageJson.pagesSaver || pages;
                } catch (_) {}

                // Client-side fallback if serverless page fetch returned empty
                if (pages.length === 0) {
                    if (isMangaFire && (ch.mangafireChapterId || ch.id)) {
                        try {
                            pages = await fetchMangaFirePages(ch.mangafireChapterId || ch.id);
                            pagesSaver = pages;
                        } catch (_) {}
                    } else if (isKatana && ch.url) {
                        try {
                            const html = await fetchClientHtmlFallback(ch.url);
                            pages = parseMangaKatanaPagesHtml(html);
                            pagesSaver = pages;
                        } catch (_) {}
                    }
                }

                if (pages.length > 0) {
                    const prefix = isMangaFire ? 'mf' : isKatana ? 'mk' : 'md';
                    finalChapters.push({
                        id: `${targetMangaId}-${prefix}-${ch.id || i}`,
                        mangaId: targetMangaId,
                        mangadexChapterId: ch.mangadexChapterId || (!isKatana && !isMangaFire ? ch.id : null),
                        mangakatanaChapterUrl: ch.url || null,
                        mangafireChapterId: ch.mangafireChapterId || (isMangaFire ? ch.id : null),
                        title: ch.title,
                        number: typeof ch.number === 'number' && !isNaN(ch.number) ? ch.number : (i + 1),
                        pages,
                        pagesSaver,
                        atHomeUpdatedAt: Date.now(),
                        createdAt: Date.now() - (chosen.length - i) * 60000
                    });
                }
            }

            if (finalChapters.length === 0) {
                throw new Error('Could not extract page images for the selected chapters. Try again.');
            }

            await saveLocalChaptersBulk(finalChapters);
            await fetch('/api/chapters/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chapters: finalChapters })
            });

            await loadMangas();
            showToast(`Imported "${item.title}" with ${finalChapters.length} chapters!`, 'success');
            setSelectedMangaToCrawl(null);
            setCrawledChaptersList([]);
        } catch (err) {
            showToast(err.message || 'Crawl failed', 'error');
        } finally {
            setCrawlLoading(false);
            setCrawlProgress('');
        }
    };

    // Bulk ZIP Unpacker
    const processBulkZip = async () => {
        if (!pendingZipFile || !zipSeriesId) {
            showToast('Select a target series and a .ZIP file first', 'error');
            return;
        }
        if (typeof window.JSZip === 'undefined') {
            showToast('JSZip library is still loading, try again in a second', 'error');
            return;
        }
        setZipProcessing(true);
        setZipStatus('Reading ZIP archive...');
        try {
            const zip = new window.JSZip();
            const zipContent = await zip.loadAsync(pendingZipFile);
            const imgExts = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'];
            const chaptersMap = new Map();
            const rootImages = [];

            zipContent.forEach((relPath, entry) => {
                if (entry.dir) return;
                if (relPath.includes('__MACOSX') || relPath.split(/[/\\]/).some(p => p.startsWith('.'))) return;
                if (!imgExts.some(ext => relPath.toLowerCase().endsWith(ext))) return;
                const parts = relPath.split(/[/\\]/).filter(Boolean);
                if (parts.length > 1) {
                    const folder = parts[parts.length - 2];
                    if (!chaptersMap.has(folder)) chaptersMap.set(folder, []);
                    chaptersMap.get(folder).push({ filename: parts[parts.length - 1], entry });
                } else if (parts.length === 1) {
                    rootImages.push({ filename: parts[0], entry });
                }
            });

            if (chaptersMap.size === 0 && rootImages.length > 0) {
                chaptersMap.set(pendingZipFile.name.replace(/\.[^/.]+$/, ''), rootImages);
            }
            if (chaptersMap.size === 0) throw new Error('No image files found inside ZIP.');

            const sortedFolders = Array.from(chaptersMap.entries()).sort((a, b) =>
                a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' })
            );

            const createdChapters = [];
            for (let idx = 0; idx < sortedFolders.length; idx++) {
                const [folderName, files] = sortedFolders[idx];
                setZipStatus(`Unpacking (${idx + 1}/${sortedFolders.length}): ${folderName}...`);
                files.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: 'base' }));
                const pages = [];
                for (const fObj of files) {
                    const blob = await fObj.entry.async('blob');
                    const dataUrl = await new Promise(res => {
                        const r = new FileReader();
                        r.onload = ev => res(ev.target.result);
                        r.readAsDataURL(blob);
                    });
                    pages.push(dataUrl);
                }
                const matchNum = folderName.match(/(\d+(\.\d+)?)/);
                const chNum = matchNum ? parseFloat(matchNum[1]) : idx + 1;
                createdChapters.push({
                    id: `${zipSeriesId}-zip-${Date.now()}-${idx}`,
                    mangaId: zipSeriesId,
                    title: folderName,
                    number: chNum,
                    pages,
                    pagesSaver: pages,
                    createdAt: Date.now()
                });
            }

            await saveLocalChaptersBulk(createdChapters);
            await fetch('/api/chapters/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chapters: createdChapters })
            });
            setPendingZipFile(null);
            setZipStatus('');
            showToast(`Extracted & published ${createdChapters.length} chapters!`, 'success');
        } catch (err) {
            showToast(err.message || 'ZIP extraction failed', 'error');
        } finally {
            setZipProcessing(false);
        }
    };

    // Tab 4: Monetization & Ad Placements Handlers
    const updateAdSlot = (slotKey, field, value) => {
        setMonetization(prev => ({
            ...prev,
            ads: {
                ...prev.ads,
                [slotKey]: {
                    ...prev.ads[slotKey],
                    [field]: value
                }
            }
        }));
    };

    const fillSampleAds = async () => {
        const next = JSON.parse(JSON.stringify(monetization));
        ['beforeFirst', 'afterFifth', 'afterTenth', 'afterLast'].forEach(key => {
            next.ads[key].enabled = true;
            next.ads[key].mode = 'banner';
            if (!next.ads[key].imageUrl) {
                next.ads[key].imageUrl = DEFAULT_MONETIZATION.ads[key].imageUrl;
            }
        });
        setMonetization(next);
        localStorage.setItem('vaniscans_monetization', JSON.stringify(next));
        await fetch('/api/monetization', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(next)
        });
        showToast('Demo ad banners enabled & saved for all 4 chapter positions!', 'success');
    };

    const saveMonetizationSettings = async () => {
        localStorage.setItem('vaniscans_monetization', JSON.stringify(monetization));
        try {
            await fetch('/api/monetization', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(monetization)
            });
            showToast('Analytics & Chapter Ad settings saved to SQLite!', 'success');
        } catch (err) {
            showToast('Saved locally', 'info');
        }
    };

    if (!isAuthed) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-[#0b0c13]">
                <div className="bg-[#121422] border border-[#23273e] rounded-3xl w-full max-w-md p-8 shadow-2xl space-y-6">
                    <div className="text-center space-y-2">
                        <div className="w-12 h-12 rounded-2xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center mx-auto text-xl">🛡️</div>
                        <h2 className="text-xl font-black text-white">SECURE ADMIN GATEWAY</h2>
                        <p className="text-xs text-slate-400">Protected by SHA-256 cryptographic hash verification.</p>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1">Username</label>
                            <input type="text" value={username} onChange={e => setUsername(e.target.value)} required className="w-full bg-[#181b2e] border border-[#2b3052] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full bg-[#181b2e] border border-[#2b3052] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500" />
                        </div>
                        <button type="submit" className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg transition">
                            Authenticate
                        </button>
                    </form>
                    <div className="text-center">
                        <Link href="/" className="text-xs text-purple-400 hover:underline">← Back to Homepage</Link>
                    </div>
                </div>
            </div>
        );
    }

    const selectedCount = Object.values(selectedChapterKeys).filter(Boolean).length;
    const filteredCrawledChapters = crawledChaptersList.filter(c =>
        (c.title || '').toLowerCase().includes(crawlChapterFilter.toLowerCase())
    );
    const filteredEditChapters = editChapters.filter(c =>
        (c.title || '').toLowerCase().includes(chapterFilterQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-[#0b0c13] text-slate-100 p-4 sm:p-8 space-y-8">
            {toast && (
                <div className="fixed bottom-5 right-5 z-[9999] p-4 rounded-xl border bg-[#121422] border-purple-500 text-purple-300 shadow-2xl text-xs font-bold">
                    {toast.message}
                </div>
            )}

            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121422] border border-[#23273e] p-6 rounded-3xl">
                    <div>
                        <h1 className="text-xl font-black text-white">Creator Studio & Admin Dashboard</h1>
                        <p className="text-xs text-slate-400">Manage series, remove individual chapters, selectively crawl MangaDex, MangaKatana & MangaFire chapters, and configure ads & GA.</p>
                    </div>
                    <div className="flex gap-3">
                        <Link href="/" className="px-4 py-2 bg-[#1a1d30] hover:bg-[#232742] text-slate-200 rounded-xl text-xs font-bold transition">Visit Site</Link>
                        <button onClick={() => { sessionStorage.removeItem('vaniscans_admin_auth'); setIsAuthed(false); }} className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold transition">Lock Panel</button>
                    </div>
                </div>

                {/* 4 Studio Tabs */}
                <div className="flex border-b border-[#21243b] text-xs font-bold overflow-x-auto">
                    <button onClick={() => setActiveTab('newSeries')} className={`py-3 px-5 border-b-2 whitespace-nowrap ${activeTab === 'newSeries' ? 'border-purple-500 text-purple-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                        1. Create / Edit Series & Chapters
                    </button>
                    <button onClick={() => setActiveTab('singleChapter')} className={`py-3 px-5 border-b-2 whitespace-nowrap ${activeTab === 'singleChapter' ? 'border-purple-500 text-purple-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                        2. Add Single Chapter
                    </button>
                    <button onClick={() => setActiveTab('crawler')} className={`py-3 px-5 border-b-2 whitespace-nowrap ${activeTab === 'crawler' ? 'border-purple-500 text-purple-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                        3. MangaDex, MangaKatana & MangaFire Crawler
                    </button>
                    <button onClick={() => setActiveTab('analyticsAds')} className={`py-3 px-5 border-b-2 whitespace-nowrap ${activeTab === 'analyticsAds' ? 'border-purple-500 text-purple-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                        4. Analytics & Ad Placements
                    </button>
                </div>

                {/* TAB 1: CREATE / EDIT SERIES & REMOVE PARTICULAR CHAPTERS */}
                {activeTab === 'newSeries' && (
                    <div className="space-y-6">
                        <div className="bg-[#121422] border border-[#23273e] rounded-3xl p-6 sm:p-8 space-y-6">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1f2337] pb-4">
                                <div>
                                    <h3 className="text-base font-black text-white">
                                        {editingId ? `Editing Series: ${title}` : 'Create New Manga Series'}
                                    </h3>
                                    <p className="text-xs text-slate-400">Add a new series or select an existing series below to edit its metadata or delete particular chapters.</p>
                                </div>
                                {editingId && (
                                    <button onClick={resetSeriesForm} className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 rounded-xl w-fit">
                                        Cancel Edit (New Mode)
                                    </button>
                                )}
                            </div>

                            <form onSubmit={handleSaveSeries} className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-300 mb-1">Series Title *</label>
                                        <input type="text" value={title} onChange={e => setTitle(e.target.value)} required placeholder="e.g., Solo Leveling: Ragnarok" className="w-full bg-[#181b2e] border border-[#292d4b] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-300 mb-1">Author / Studio</label>
                                        <input type="text" value={author} onChange={e => setAuthor(e.target.value)} placeholder="e.g., Chugong, Redice Studio" className="w-full bg-[#181b2e] border border-[#292d4b] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-300 mb-1">Cover Image (URL or File Upload)</label>
                                        <div className="space-y-2">
                                            <input type="text" value={coverUrl.startsWith('data:') ? '' : coverUrl} onChange={e => setCoverUrl(e.target.value)} placeholder="https://example.com/cover.jpg" className="w-full bg-[#181b2e] border border-[#292d4b] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-purple-500" />
                                            <label className="flex items-center gap-2 cursor-pointer bg-[#20243b] hover:bg-[#282d49] text-slate-300 text-xs px-3 py-2 rounded-xl border border-dashed border-[#383d63] transition justify-center">
                                                🖼️ Or upload cover image file
                                                <input type="file" accept="image/*" className="hidden" onChange={handleCoverFilePicked} />
                                            </label>
                                            {coverFileName && <span className="text-[11px] text-purple-300 block truncate">Picked: {coverFileName}</span>}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-300 mb-1">Genres (comma separated)</label>
                                        <input type="text" value={genres} onChange={e => setGenres(e.target.value)} className="w-full bg-[#181b2e] border border-[#292d4b] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500" />
                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                            <div>
                                                <label className="block text-[11px] text-slate-400 mb-1">Status</label>
                                                <select value={status} onChange={e => setStatus(e.target.value)} className="w-full bg-[#181b2e] border border-[#292d4b] rounded-xl px-2.5 py-2 text-xs text-white">
                                                    <option value="Ongoing">Ongoing</option>
                                                    <option value="Completed">Completed</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[11px] text-slate-400 mb-1">Rating (1-10)</label>
                                                <input type="number" step="0.1" min="1" max="10" value={rating} onChange={e => setRating(e.target.value)} className="w-full bg-[#181b2e] border border-[#292d4b] rounded-xl px-2.5 py-2 text-xs text-white" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1">Synopsis</label>
                                    <textarea rows="3" value={synopsis} onChange={e => setSynopsis(e.target.value)} placeholder="Brief story description..." className="w-full bg-[#181b2e] border border-[#292d4b] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"></textarea>
                                </div>

                                {/* SEO & Search Metadata Editor (Tab Title & Google Search Snippet) */}
                                <div className="bg-[#16192b] border border-purple-500/30 rounded-2xl p-5 space-y-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#252a47] pb-3">
                                        <div>
                                            <h4 className="text-xs font-black uppercase tracking-wider text-purple-300">
                                                🔍 SEO & Search Engine Metadata (Browser Tab & Google Search Result)
                                            </h4>
                                            <p className="text-[11px] text-slate-400">
                                                Customize how this manga appears in the browser tab and Google search results. Leave blank to auto-use "Read {title || 'Manga'} - VaniScans".
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const t = title.trim() || 'Infinite Mage';
                                                    setMetaTitle(`Read ${t} - VaniScans`);
                                                    setMetaDescription(`Read ${t} / ${synopsis.trim() || `${t} manga series online in high quality on VaniScans.`}`);
                                                }}
                                                className="px-2.5 py-1 rounded-lg bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white text-[11px] font-bold transition"
                                            >
                                                ⚡ Auto-Fill "Read - VaniScans"
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const t = title.trim() || 'Chainsaw Man';
                                                    setMetaTitle(`${t} Manga Online`);
                                                    setMetaDescription(`Read ${t} / ${synopsis.trim() || `is a manga series. Read all chapters online free on VaniScans.`}`);
                                                }}
                                                className="px-2.5 py-1 rounded-lg bg-[#202540] hover:bg-purple-600/30 text-slate-300 text-[11px] font-bold transition"
                                            >
                                                ⚡ Auto-Fill "Manga Online" Style
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 mb-1">
                                                Meta Title (Browser Tab Name & Search Result Headline)
                                            </label>
                                            <input
                                                type="text"
                                                value={metaTitle}
                                                onChange={e => setMetaTitle(e.target.value)}
                                                placeholder={`Read ${title || 'Infinite Mage'} - VaniScans`}
                                                className="w-full bg-[#121422] border border-[#292d4b] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 mb-1">
                                                Meta Description (Search Engine Result Snippet)
                                            </label>
                                            <textarea
                                                rows="2"
                                                value={metaDescription}
                                                onChange={e => setMetaDescription(e.target.value)}
                                                placeholder={`Read ${title || 'Infinite Mage'} / ${synopsis || 'Read all chapters online in high quality on VaniScans.'}`}
                                                className="w-full bg-[#121422] border border-[#292d4b] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                                            ></textarea>
                                        </div>
                                    </div>

                                    {/* Live Google Search Snippet Preview */}
                                    <div className="bg-white rounded-xl p-4 text-slate-800 shadow-inner border border-slate-200 space-y-1">
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                            Google Search Result Preview
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-slate-700">
                                            <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center font-black text-xs">⚡</div>
                                            <div className="leading-tight">
                                                <div className="font-semibold text-[13px] text-slate-900">vaniscans.online</div>
                                                <div className="text-[11px] text-slate-500">
                                                    https://vaniscans.online/comics/{(title || 'infinite-mage').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-lg font-medium text-[#681da8] hover:underline cursor-pointer pt-0.5 leading-snug">
                                            {metaTitle.trim() || `Read ${title || 'Infinite Mage'} - VaniScans`}
                                        </div>
                                        <div className="text-xs text-[#4d5156] line-clamp-2 leading-relaxed">
                                            <span className="font-bold">Read {title || 'Infinite Mage'}</span>
                                            {' / '}
                                            {(metaDescription.trim() || synopsis.trim() || 'is a manga series available to read online in high quality on VaniScans.')
                                                .replace(new RegExp(`^Read\s+${(title || 'Infinite Mage').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*\/?\s*`, 'i'), '')}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end">
                                    <button type="submit" className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-purple-600/30 transition">
                                        {editingId ? 'Update Series Details' : 'Save & Publish Series'}
                                    </button>
                                </div>
                            </form>

                            {/* Manage & Delete Particular Chapters when Editing a Series */}
                            {editingId && (
                                <div className="pt-6 border-t border-[#1f2337] space-y-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div>
                                            <h4 className="text-sm font-black text-white uppercase tracking-wider">
                                                Chapters in "{title}" ({editChapters.length} Total)
                                            </h4>
                                            <p className="text-xs text-slate-400">Select any particular chapter below and click Remove Chapter to delete it from this series.</p>
                                        </div>
                                        <input
                                            type="text"
                                            value={chapterFilterQuery}
                                            onChange={e => setChapterFilterQuery(e.target.value)}
                                            placeholder="Filter chapters..."
                                            className="bg-[#181b2e] border border-[#292d4b] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                                        />
                                    </div>

                                    {editChapters.length === 0 ? (
                                        <div className="p-6 text-center bg-[#181b2e] rounded-2xl border border-dashed border-[#292d4b] text-xs text-slate-400">
                                            No chapters uploaded for this series yet.
                                        </div>
                                    ) : (
                                        <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                                            {filteredEditChapters.map(ch => (
                                                <div key={ch.id} className="flex items-center justify-between p-3 bg-[#181b2e] border border-[#292d4b] hover:border-purple-500/40 rounded-xl text-xs transition">
                                                    <div>
                                                        <span className="font-bold text-white">{ch.title}</span>
                                                        <span className="text-slate-400 ml-2">({ch.pages?.length || 0} pages)</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => deleteChapter(ch.id, ch.title)}
                                                        className="px-3 py-1.5 bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white rounded-lg font-bold transition flex items-center gap-1"
                                                    >
                                                        🗑️ Remove Chapter
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="bg-[#121422] border border-[#23273e] rounded-3xl p-6 sm:p-8 space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-wider text-slate-300">
                                Existing Catalog Series ({mangas.length}) — Click ✏️ Edit to Modify Details or Remove Chapters
                            </h3>
                            {mangas.length === 0 ? (
                                <div className="text-xs text-slate-500 py-4 text-center">No series in catalog yet. Use Tab 1 or Tab 3 (Crawler) to add series.</div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {mangas.map(m => (
                                        <div key={m.id} className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[#181b2e] border border-[#272b46]">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <img src={m.cover} alt="" referrerPolicy="no-referrer" className="w-10 h-14 object-cover rounded-lg shrink-0" />
                                                <div className="min-w-0">
                                                    <div className="text-xs font-bold text-white truncate">{m.title}</div>
                                                    <div className="text-[10px] text-slate-400">{m.status} • ★ {m.rating || '9.8'}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <button onClick={() => loadSeriesForEdit(m)} className="px-2.5 py-1.5 rounded-lg bg-purple-600/20 text-purple-300 hover:bg-purple-600 hover:text-white text-xs font-bold transition" title="Edit Series & Manage Chapters">
                                                    ✏️ Edit
                                                </button>
                                                <button onClick={() => deleteSeries(m.id, m.title)} className="p-2 rounded-lg bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white text-xs transition" title="Delete Series">
                                                    🗑️
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* TAB 2: ADD SINGLE CHAPTER */}
                {activeTab === 'singleChapter' && (
                    <div className="bg-[#121422] border border-[#23273e] rounded-3xl p-6 sm:p-8 space-y-6">
                        <h3 className="text-base font-black text-white border-b border-[#1f2337] pb-4">Upload Single Chapter</h3>
                        <form onSubmit={handleCreateSingleChapter} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1">Select Series *</label>
                                <select value={singleSeriesId} onChange={e => setSingleSeriesId(e.target.value)} required className="w-full bg-[#181b2e] border border-[#292d4b] rounded-xl px-3.5 py-2.5 text-sm text-white">
                                    <option value="">-- Choose Series --</option>
                                    {mangas.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1">Chapter Name / Number *</label>
                                    <input type="text" value={singleChTitle} onChange={e => setSingleChTitle(e.target.value)} required placeholder="e.g. Chapter 42 - The Monarch Awakes" className="w-full bg-[#181b2e] border border-[#292d4b] rounded-xl px-3.5 py-2.5 text-sm text-white" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1">Upload Page Image Files</label>
                                    <input type="file" multiple accept="image/*" onChange={e => setSingleChFiles(e.target.files)} className="w-full bg-[#181b2e] border border-[#292d4b] rounded-xl px-2 py-2 text-xs text-slate-300 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1">Or Enter Image Page URLs (One per line)</label>
                                <textarea rows="4" value={singleChUrls} onChange={e => setSingleChUrls(e.target.value)} placeholder="https://domain.com/p1.jpg&#10;https://domain.com/p2.jpg" className="w-full bg-[#181b2e] border border-[#292d4b] rounded-xl px-3.5 py-2.5 text-xs text-white font-mono"></textarea>
                            </div>
                            <div className="flex justify-end">
                                <button type="submit" className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg">
                                    Publish Chapter
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* TAB 3: MANGADEX & MANGAKATANA CHAPTER SELECTOR CRAWLER + BULK ZIP */}
                {activeTab === 'crawler' && (
                    <div className="space-y-6">
                        <div className="bg-[#121422] border border-[#23273e] rounded-3xl p-6 sm:p-8 space-y-6">
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#1f2337] pb-4">
                                <div>
                                    <h3 className="text-base font-black text-white">MangaDex.org, MangaKatana.com & MangaFire Live Crawler</h3>
                                    <p className="text-xs text-slate-400">Search any series, load its full chapter list, and select all or particular chapters to import.</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">Source:</span>
                                    <button type="button" onClick={() => setCrawlerSource('mangadex')} className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition ${crawlerSource === 'mangadex' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30' : 'bg-[#1a1d30] text-slate-300 border border-[#2b3052]'}`}>
                                        🌐 MangaDex.org
                                    </button>
                                    <button type="button" onClick={() => setCrawlerSource('mangakatana')} className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition ${crawlerSource === 'mangakatana' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30' : 'bg-[#1a1d30] text-slate-300 border border-[#2b3052]'}`}>
                                        ⚔️ MangaKatana.com
                                    </button>
                                    <button type="button" onClick={() => setCrawlerSource('mangafire')} className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition ${crawlerSource === 'mangafire' ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/30' : 'bg-[#1a1d30] text-slate-300 border border-[#2b3052]'}`}>
                                        🔥 MangaFire
                                    </button>
                                </div>
                            </div>

                            {/* Quick Presets */}
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[11px] font-semibold text-slate-400 mr-1">Quick Presets:</span>
                                <button type="button" onClick={() => handleScan('', 'mangadex')} className="px-3 py-1.5 rounded-lg bg-[#1a1d30] hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-[11px] font-bold transition">
                                    Top on MangaDex
                                </button>
                                <button type="button" onClick={() => handleScan('Naruto', 'mangakatana')} className="px-3 py-1.5 rounded-lg bg-[#1a1d30] hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold transition">
                                    Naruto (MangaKatana)
                                </button>
                                <button type="button" onClick={() => handleScan('Solo Leveling', 'mangakatana')} className="px-3 py-1.5 rounded-lg bg-[#1a1d30] hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold transition">
                                    Solo Leveling (MangaKatana)
                                </button>
                                <button type="button" onClick={() => handleScan('Berserk', 'mangadex')} className="px-3 py-1.5 rounded-lg bg-[#1a1d30] hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-[11px] font-bold transition">
                                    Berserk (MangaDex)
                                </button>
                                <button type="button" onClick={() => handleScan('One Piece', 'mangafire')} className="px-3 py-1.5 rounded-lg bg-[#1a1d30] hover:bg-orange-600/30 text-orange-300 border border-orange-500/30 text-[11px] font-bold transition">
                                    One Piece (MangaFire)
                                </button>
                            </div>

                            {/* Search Bar (No Custom Chapter Count Input!) */}
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                <div className="md:col-span-8">
                                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                                        {crawlerSource === 'mangakatana'
                                            ? 'Search MangaKatana Title or Series URL'
                                            : crawlerSource === 'mangafire'
                                            ? 'Search MangaFire Title or Series ID'
                                            : 'Search MangaDex Title, URL, or UUID'}
                                    </label>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleScan()}
                                        placeholder={
                                            crawlerSource === 'mangakatana'
                                                ? 'e.g. Naruto, Solo Leveling, or mangakatana.com/manga/...'
                                                : crawlerSource === 'mangafire'
                                                ? 'e.g. One Piece, Dandadan, or MangaFire series ID...'
                                                : 'e.g. Berserk, Chainsaw Man, or mangadex.org/title/...'
                                        }
                                        className="w-full bg-[#181b2e] border border-[#292d4b] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-purple-500"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-slate-300 mb-1">Chapter Language</label>
                                    <select
                                        value={crawlerLang}
                                        onChange={e => setCrawlerLang(e.target.value)}
                                        disabled={crawlerSource === 'mangakatana'}
                                        className="w-full bg-[#181b2e] border border-[#292d4b] rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white disabled:opacity-50"
                                    >
                                        <option value="en">English (EN)</option>
                                        <option value="all">All Languages</option>
                                    </select>
                                </div>
                                <div className="md:col-span-2 flex items-end">
                                    <button
                                        type="button"
                                        disabled={isScanning}
                                        onClick={() => handleScan()}
                                        className="w-full py-2.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg transition"
                                    >
                                        {isScanning
                                            ? 'Searching...'
                                            : `Search ${
                                                  crawlerSource === 'mangakatana'
                                                      ? 'Katana'
                                                      : crawlerSource === 'mangafire'
                                                      ? 'MangaFire'
                                                      : 'MangaDex'
                                              }`}
                                    </button>
                                </div>
                            </div>

                            {crawlerWorkspace && (
                                <div className="space-y-4 pt-4 border-t border-[#1f2337]">
                                    <div className="flex items-center justify-between bg-[#16192b] border border-[#262b47] px-4 py-2.5 rounded-xl text-xs">
                                        <span className="font-semibold text-slate-200">{scannerStatus}</span>
                                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-600/20 text-purple-300 border border-purple-500/30">
                                            {selectedMangaToCrawl ? `${crawledChaptersList.length} Chapters` : `${scannedResults.length} Series`}
                                        </span>
                                    </div>

                                    {!selectedMangaToCrawl ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto pr-1">
                                            {scannedResults.map((item, idx) => {
                                                const isKatanaItem = item.sourceHost === 'mangakatana.com' || !!item.mangakatanaId;
                                                const isMangaFireItem = item.sourceHost === 'mangafire' || !!item.mangafireId;
                                                return (
                                                    <div key={idx} className="bg-[#181b2e] border border-[#292d4b] hover:border-purple-500/50 rounded-2xl p-4 flex flex-col justify-between gap-3 transition">
                                                        <div className="flex gap-3.5">
                                                            <img src={item.cover} alt="" referrerPolicy="no-referrer" className="w-20 h-28 object-cover rounded-xl shrink-0 border border-white/10" />
                                                            <div className="min-w-0 flex-1 space-y-1">
                                                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border inline-block ${
                                                                    isMangaFireItem
                                                                        ? 'bg-orange-500/20 text-orange-300 border-orange-500/30'
                                                                        : isKatanaItem
                                                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                                                        : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                                                }`}>
                                                                    {isMangaFireItem ? 'MangaFire' : isKatanaItem ? 'MangaKatana' : 'MangaDex.org'}
                                                                </span>
                                                                <h4 className="text-xs font-black text-white line-clamp-2">{item.title}</h4>
                                                                <p className="text-[11px] text-purple-300 truncate">{item.author}</p>
                                                                <p className="text-[10px] text-slate-400 line-clamp-2">{item.synopsis}</p>
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => fetchChaptersForScannedManga(item)}
                                                            className="w-full py-2.5 px-3 rounded-xl text-[11px] font-black uppercase tracking-wider bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white shadow transition"
                                                        >
                                                            📋 View Chapters & Select to Pull
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="space-y-4 bg-[#16182a] p-6 rounded-2xl border border-[#242945]">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#21253d] pb-4">
                                                <div className="flex items-center gap-3">
                                                    <img src={selectedMangaToCrawl.cover} alt="" referrerPolicy="no-referrer" className="w-12 h-16 object-cover rounded-lg shrink-0" />
                                                    <div>
                                                        <h4 className="text-sm font-black text-white">{selectedMangaToCrawl.title}</h4>
                                                        <p className="text-xs text-slate-400">{crawledChaptersList.length} total chapters found — Check the chapters you want to pull</p>
                                                    </div>
                                                </div>
                                                <button onClick={() => setSelectedMangaToCrawl(null)} className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-xl text-slate-200 w-fit">
                                                    ← Back to Search Results
                                                </button>
                                            </div>

                                            {crawledChaptersList.length > 0 && (
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div className="flex items-center gap-2 text-xs font-bold">
                                                        <button type="button" onClick={() => toggleSelectAllChapters(true)} className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition">
                                                            ✓ Select All ({crawledChaptersList.length})
                                                        </button>
                                                        <button type="button" onClick={() => toggleSelectAllChapters(false)} className="px-3.5 py-1.5 bg-[#1f233a] hover:bg-slate-700 text-slate-200 rounded-xl transition">
                                                            ✕ Deselect All
                                                        </button>
                                                        <span className="text-purple-300 ml-2">
                                                            {selectedCount} of {crawledChaptersList.length} selected
                                                        </span>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={crawlChapterFilter}
                                                        onChange={e => setCrawlChapterFilter(e.target.value)}
                                                        placeholder="Search chapter number/title..."
                                                        className="bg-[#121422] border border-[#292d4b] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                                                    />
                                                </div>
                                            )}

                                            <div className="max-h-80 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-3 bg-[#121422] rounded-xl border border-[#23273e]">
                                                {filteredCrawledChapters.map((ch, idx) => {
                                                    const cid = ch.id || ch.url || String(idx);
                                                    const isChecked = !!selectedChapterKeys[cid];
                                                    return (
                                                        <label
                                                            key={cid}
                                                            className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer text-xs transition ${isChecked ? 'bg-purple-600/15 border-purple-500/50 text-white' : 'bg-[#16192a] border-[#22263e] text-slate-400 hover:text-slate-200'}`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={() => toggleChapterSelection(cid)}
                                                                className="w-4 h-4 rounded accent-purple-600 shrink-0"
                                                            />
                                                            <span className="truncate font-semibold" title={ch.title}>{ch.title}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>

                                            {crawlLoading ? (
                                                <div className="py-4 text-center space-y-2 bg-[#121422] rounded-xl border border-purple-500/30 p-4">
                                                    <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                                                    <p className="text-xs text-purple-300 font-mono font-bold">{crawlProgress}</p>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={selectedCount === 0}
                                                    onClick={importSelectedChaptersToDb}
                                                    className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 disabled:opacity-40 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-purple-600/30 transition"
                                                >
                                                    📥 Pull & Add {selectedCount} Selected Chapter{selectedCount === 1 ? '' : 's'} to Website
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Bulk ZIP Unpacker */}
                        <div className="bg-[#121422] border border-[#23273e] rounded-3xl p-6 sm:p-8 space-y-6">
                            <div className="border-b border-[#1f2337] pb-4">
                                <h3 className="text-base font-black text-white">Or Unpack HakuNeko / Houdoku .ZIP Archive</h3>
                                <p className="text-xs text-slate-400">Select a `.zip` archive to extract all chapter folders at once.</p>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1">Target Series *</label>
                                    <select value={zipSeriesId} onChange={e => setZipSeriesId(e.target.value)} className="w-full bg-[#181b2e] border border-[#292d4b] rounded-xl px-3.5 py-2.5 text-sm text-white">
                                        <option value="">-- Choose Series --</option>
                                        {mangas.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                                    </select>
                                </div>
                                <label className="block border-2 border-dashed border-[#343a5e] hover:border-purple-500 rounded-2xl p-8 text-center transition cursor-pointer bg-[#141728]/50">
                                    <input type="file" accept=".zip,application/zip" className="hidden" onChange={e => setPendingZipFile(e.target.files?.[0] || null)} />
                                    <div className="text-sm font-bold text-white mb-1">📦 Click to browse and select your .ZIP file</div>
                                    <p className="text-xs text-slate-400">Supports .zip with nested chapter folders</p>
                                    {pendingZipFile && (
                                        <span className="inline-block mt-3 px-3 py-1 bg-purple-500/20 text-purple-300 rounded-lg text-xs font-mono font-bold">
                                            Selected: {pendingZipFile.name} ({(pendingZipFile.size / (1024 * 1024)).toFixed(2)} MB)
                                        </span>
                                    )}
                                </label>
                                {zipStatus && <div className="text-xs text-purple-300 font-mono">{zipStatus}</div>}
                                <div className="flex justify-end">
                                    <button type="button" disabled={!pendingZipFile || zipProcessing} onClick={processBulkZip} className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 disabled:opacity-40 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg">
                                        {zipProcessing ? 'Unpacking...' : 'Unpack & Add Chapters'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 4: ANALYTICS & AD PLACEMENTS (RESTORED!) */}
                {activeTab === 'analyticsAds' && (
                    <div className="space-y-8">
                        {/* Google Analytics Card */}
                        <div className="bg-[#121422] border border-[#23273e] rounded-3xl p-6 sm:p-8 space-y-6">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1f2337] pb-4">
                                <div>
                                    <h3 className="text-base font-black text-white">📊 Google Analytics Integration</h3>
                                    <p className="text-xs text-slate-400">Track real-time visitor traffic, pageviews, and chapter reads across your site.</p>
                                </div>
                                <label className="inline-flex items-center cursor-pointer gap-2.5">
                                    <input
                                        type="checkbox"
                                        checked={!!monetization.gaEnabled}
                                        onChange={e => setMonetization({ ...monetization, gaEnabled: e.target.checked })}
                                        className="w-4 h-4 accent-emerald-500 rounded"
                                    />
                                    <span className="text-xs font-bold text-slate-200">Enable GA Tracking</span>
                                </label>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Google Analytics Measurement ID (G-XXXXXXXXXX)</label>
                                    <input
                                        type="text"
                                        value={monetization.gaMeasurementId || ''}
                                        onChange={e => setMonetization({ ...monetization, gaMeasurementId: e.target.value })}
                                        placeholder="e.g. G-8K92JLMN01"
                                        className="w-full bg-[#181b2e] border border-[#292d4b] rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-purple-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Or Custom Tracking Script / HTML (Optional)</label>
                                    <textarea
                                        rows="3"
                                        value={monetization.gaCustomScript || ''}
                                        onChange={e => setMonetization({ ...monetization, gaCustomScript: e.target.value })}
                                        placeholder="<!-- Paste custom analytics script here -->"
                                        className="w-full bg-[#181b2e] border border-[#292d4b] rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                                    ></textarea>
                                </div>
                            </div>
                        </div>

                        {/* In-Chapter Ad Placements Card (4 Positions) */}
                        <div className="bg-[#121422] border border-[#23273e] rounded-3xl p-6 sm:p-8 space-y-6">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1f2337] pb-4">
                                <div>
                                    <h3 className="text-base font-black text-white">📢 In-Chapter Ad Placements (4 Positions)</h3>
                                    <p className="text-xs text-slate-400">Configure ads before the 1st image, after the 5th image, after the 10th image, and after the last image.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={fillSampleAds}
                                    className="px-3.5 py-2 rounded-xl bg-[#1a1d30] hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-bold transition"
                                >
                                    ✨ Load Demo Ad Banners
                                </button>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {['beforeFirst', 'afterFifth', 'afterTenth', 'afterLast'].map(key => {
                                    const slot = monetization.ads?.[key] || DEFAULT_MONETIZATION.ads[key];
                                    return (
                                        <div key={key} className="bg-[#181b2e] border border-[#292d4b] rounded-2xl p-5 space-y-4">
                                            <div className="flex items-start justify-between gap-3 border-b border-[#242842] pb-3">
                                                <div>
                                                    <div className="text-sm font-black text-white flex items-center gap-2">
                                                        <span className={`w-2.5 h-2.5 rounded-full ${slot.enabled ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                                                        {slot.label}
                                                    </div>
                                                    <p className="text-[11px] text-slate-400 mt-0.5">{slot.desc}</p>
                                                </div>
                                                <label className="inline-flex items-center gap-1.5 cursor-pointer shrink-0 text-xs font-bold text-slate-300">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!slot.enabled}
                                                        onChange={e => updateAdSlot(key, 'enabled', e.target.checked)}
                                                        className="w-4 h-4 accent-purple-600 rounded"
                                                    />
                                                    Active
                                                </label>
                                            </div>

                                            <div className="flex items-center gap-2 text-xs">
                                                <span className="text-slate-400 font-semibold">Ad Format:</span>
                                                <select
                                                    value={slot.mode || 'banner'}
                                                    onChange={e => updateAdSlot(key, 'mode', e.target.value)}
                                                    className="bg-[#121422] border border-[#292d4b] rounded-lg px-2.5 py-1.5 text-xs text-white font-semibold"
                                                >
                                                    <option value="banner">Banner Image + Link URL</option>
                                                    <option value="html">Custom HTML / AdScript</option>
                                                </select>
                                            </div>

                                            {slot.mode === 'html' ? (
                                                <div className="space-y-2">
                                                    <label className="block text-[11px] font-semibold text-slate-300">Custom Ad HTML / Script</label>
                                                    <textarea
                                                        rows="4"
                                                        value={slot.htmlCode || ''}
                                                        onChange={e => updateAdSlot(key, 'htmlCode', e.target.value)}
                                                        placeholder="Custom ad code snippet..."
                                                        className="w-full bg-[#121422] border border-[#292d4b] rounded-xl px-3 py-2 text-xs text-white font-mono"
                                                    ></textarea>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">Banner Image URL</label>
                                                        <input
                                                            type="text"
                                                            value={slot.imageUrl || ''}
                                                            onChange={e => updateAdSlot(key, 'imageUrl', e.target.value)}
                                                            placeholder="https://example.com/ad.jpg"
                                                            className="w-full bg-[#121422] border border-[#292d4b] rounded-xl px-3 py-2 text-xs text-white"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">Click Destination URL</label>
                                                        <input
                                                            type="text"
                                                            value={slot.linkUrl || ''}
                                                            onChange={e => updateAdSlot(key, 'linkUrl', e.target.value)}
                                                            placeholder="https://sponsor.com"
                                                            className="w-full bg-[#121422] border border-[#292d4b] rounded-xl px-3 py-2 text-xs text-white"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="pt-4 border-t border-[#1f2337] flex flex-col sm:flex-row items-center justify-between gap-4">
                                <span className="text-xs text-slate-400">✓ Changes apply immediately to all chapters in Webtoon Scroll & Single Page modes.</span>
                                <button
                                    type="button"
                                    onClick={saveMonetizationSettings}
                                    className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-purple-600/30 transition"
                                >
                                    💾 Save All Analytics & Ad Settings
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
