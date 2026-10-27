class ReaderController {
    constructor(appInstance) {
        this.app = appInstance;
        this.readingMode = 'webtoon';
        this.currentSinglePageIndex = 0;
        this.currentChapterObj = null;
        this.refreshPromise = null;
        this.activeQueueToken = 0;
    }

    async openReader(chapterId, updateUrl = true) {
        let chapter = await this.app.api.getChapter(chapterId);
        if (!chapter && this.app.currentChapters) {
            chapter = this.app.currentChapters.find(c => c.id === chapterId);
        }
        if (!chapter) {
            this.app.showToast('Chapter data not found', 'error');
            return;
        }

        if (!this.app.currentManga || this.app.currentManga.id !== chapter.mangaId) {
            this.app.currentManga = this.app.mangas.find(m => m.id === chapter.mangaId);
            this.app.currentChapters = (await this.app.api.getChaptersForManga(chapter.mangaId)) || [];
            this.app.sortCurrentChapters();
        }

        this.readerChaptersAsc = [...this.app.currentChapters].sort((a, b) => (a.number || 0) - (b.number || 0));
        this.currentChapterIndex = this.readerChaptersAsc.findIndex(c => c.id === chapter.id);
        if (this.currentChapterIndex === -1) this.currentChapterIndex = 0;
        this.currentChapterObj = chapter;

        if (updateUrl && this.app.currentManga) {
            const mangaSlug = this.app.getMangaSlug(this.app.currentManga);
            const chSlug = this.app.getChapterSlug(chapter, this.currentChapterIndex + 1);
            const targetPath = `/comics/${mangaSlug}/chapter/${chSlug}#resume`;
            if (window.location.pathname !== `/comics/${mangaSlug}/chapter/${chSlug}`) {
                window.history.pushState(
                    { view: 'reader', mangaId: this.app.currentManga.id, chapterId: chapter.id },
                    `${this.app.currentManga.title} - ${chapter.title}`,
                    targetPath
                );
            }
            document.title = `${this.app.currentManga.title} - ${chapter.title} — VaniScans`;
        }

        this.app.hideAllViews();
        document.getElementById('readerView').classList.remove('hidden');

        // Refresh MangaDex At-Home node once when opening chapter if older than 8 minutes or missing
        const ageMs = Date.now() - (chapter.atHomeUpdatedAt || 0);
        if (chapter.mangadexChapterId && (!chapter.pages || chapter.pages.length === 0 || ageMs > 8 * 60 * 1000)) {
            await this.refreshMangaDexChapterUrls(chapter, false);
        }

        this.renderReaderChapter(chapter);

        const savedScrollKey = `vaniscans_scroll_${chapter.id}`;
        const savedScroll = sessionStorage.getItem(savedScrollKey);
        if (window.location.hash === '#resume' && savedScroll && parseInt(savedScroll, 10) > 100) {
            setTimeout(() => {
                window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'instant' });
            }, 150);
        } else {
            window.scrollTo({ top: 0, behavior: 'instant' });
        }

        if (window.lucide) lucide.createIcons();
    }

    /**
     * Deduplicated single-flight refresh of MangaDex At-Home node URLs
     */
    async refreshMangaDexChapterUrls(chapter, forceShowToast = true) {
        if (!chapter || !chapter.mangadexChapterId) return false;
        if (this.refreshPromise) return await this.refreshPromise;

        this.refreshPromise = (async () => {
            try {
                const atHomeData = await this.app.api.resolveMangaDexChapterPagesDetailed(chapter.mangadexChapterId);
                if (atHomeData && atHomeData.pages.length > 0) {
                    chapter.pages = atHomeData.pages;
                    chapter.pagesSaver = atHomeData.pagesSaver;
                    chapter.atHomeUpdatedAt = Date.now();
                    await this.app.api.saveChapter(chapter);
                    if (forceShowToast) {
                        this.app.showToast('Refreshed chapter image server nodes!', 'success');
                    }
                    return true;
                }
            } catch (err) {
                console.warn('Could not refresh MangaDex pages:', err);
            } finally {
                this.refreshPromise = null;
            }
            return false;
        })();

        return await this.refreshPromise;
    }

    async reloadCurrentChapterImages() {
        if (!this.currentChapterObj) return;
        this.app.showToast('Reloading all chapter images...', 'info');
        if (this.currentChapterObj.mangadexChapterId) {
            await this.refreshMangaDexChapterUrls(this.currentChapterObj, true);
        }
        this.renderReaderChapter(this.currentChapterObj);
    }

    exitReader() {
        if (this.app.currentManga) {
            this.app.showDetailView(this.app.currentManga.id, true);
        } else {
            this.app.showHomeView(true);
        }
    }

    /**
     * Extracts canonical `https://uploads.mangadex.org/data-saver/<hash>/<file>` from any MangaDex page URL
     */
    toUploadsMangaDexUrl(url) {
        if (!url) return '';
        const match = url.match(/\/(data|data-saver)\/([a-f0-9]+)\/([^?&#]+)/i);
        if (match) {
            return `https://uploads.mangadex.org/${match[1]}/${match[2]}/${match[3]}`;
        }
        return url;
    }

    /**
     * Fetches an image via binary Blob through multiple proxy relays if standard <img> tags are blocked
     */
    async fetchImageAsBlobUrl(rawUrl) {
        const canonical = this.toUploadsMangaDexUrl(rawUrl);
        const candidates = [
            `/api/mangadex/img?url=${encodeURIComponent(canonical)}`,
            `/api/mangadex/img?url=${encodeURIComponent(rawUrl)}`,
            `https://wsrv.nl/?url=${encodeURIComponent(canonical)}&output=webp`,
            `https://corsproxy.io/?url=${encodeURIComponent(canonical)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(canonical)}`
        ];

        for (const candidateUrl of candidates) {
            try {
                const res = await fetch(candidateUrl, { signal: AbortSignal.timeout(10000) });
                if (!res.ok) continue;
                const ct = (res.headers.get('content-type') || '').toLowerCase();
                if (ct.includes('text/html') || ct.includes('application/json')) continue;
                const blob = await res.blob();
                if (blob && blob.size > 800) {
                    return URL.createObjectURL(blob);
                }
            } catch (_) {}
        }
        return null;
    }

    /**
     * Builds a resilient page wrapper WITHOUT `display: none` (`hidden`), so browsers NEVER deadlock lazy-loading!
     * Returns `{ wrapper, startLoad }` so the reader can load all pages in a smooth concurrent pipeline.
     */
    createMangaPageWrapper(src, pageNum, startImmediately = true, chapter = null, pageIdx = 0) {
        const wrapper = document.createElement('div');
        wrapper.className = 'w-full max-w-[900px] mx-auto relative flex flex-col items-center justify-center bg-[#0d0f1a]';

        const loader = document.createElement('div');
        loader.className = 'py-16 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs w-full';
        loader.innerHTML = `
            <div class="w-7 h-7 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            <span class="loader-text">Loading Page ${pageNum}...</span>
        `;
        wrapper.appendChild(loader);

        const img = document.createElement('img');
        const canonicalUrl = this.toUploadsMangaDexUrl(src);
        const nodeUrl = chapter?.pagesSaver?.[pageIdx] || src;

        // CRITICAL FIX: Never use `loading="lazy"` + `display: none` (`hidden`), because Chromium
        // refuses to load lazy images that have `display: none`!
        img.loading = 'eager';
        img.decoding = 'async';
        img.alt = `Page ${pageNum}`;
        img.referrerPolicy = 'no-referrer';
        // Use opacity-0 + max-h-0 while loading instead of display:none so the browser always fetches the image
        img.className = 'webtoon-img shadow-2xl block border-b border-black/40 opacity-0 max-h-0 overflow-hidden transition-opacity duration-200';

        let loadResolve;
        const loadDonePromise = new Promise(resolve => {
            loadResolve = resolve;
        });

        img.onload = () => {
            loader.style.display = 'none';
            const errBox = wrapper.querySelector('.page-retry-box');
            if (errBox) errBox.remove();
            img.classList.remove('opacity-0', 'max-h-0', 'overflow-hidden');
            img.classList.add('opacity-100');
            loadResolve();
        };

        img.onerror = async () => {
            const stage = parseInt(img.dataset.retryStage || '0', 10);
            const loaderText = loader.querySelector('.loader-text');

            // Stage 1: Try canonical uploads.mangadex.org URL directly
            if (stage === 0) {
                img.dataset.retryStage = '1';
                if (loaderText) loaderText.textContent = `Loading Page ${pageNum} (Mirror 1)...`;
                if (canonicalUrl && canonicalUrl !== img.src) {
                    img.src = canonicalUrl;
                    return;
                }
            }

            // Stage 2: Try wsrv.nl CDN proxy with canonical uploads.mangadex.org URL
            if (stage <= 1 && canonicalUrl.startsWith('http')) {
                img.dataset.retryStage = '2';
                if (loaderText) loaderText.textContent = `Loading Page ${pageNum} (CDN Cache)...`;
                img.src = `https://wsrv.nl/?url=${encodeURIComponent(canonicalUrl)}&output=webp`;
                return;
            }

            // Stage 3: Try our own Netlify / Express binary image proxy (/api/mangadex/img)
            if (stage <= 2 && canonicalUrl.startsWith('http')) {
                img.dataset.retryStage = '3';
                if (loaderText) loaderText.textContent = `Loading Page ${pageNum} (Server Proxy)...`;
                img.src = `/api/mangadex/img?url=${encodeURIComponent(nodeUrl)}`;
                return;
            }

            // Stage 4: Fetch image bytes as a Blob via multi-relay and create local ObjectURL
            if (stage <= 3 && canonicalUrl.startsWith('http')) {
                img.dataset.retryStage = '4';
                if (loaderText) loaderText.textContent = `Fetching Page ${pageNum} stream...`;
                const blobUrl = await this.fetchImageAsBlobUrl(nodeUrl);
                if (blobUrl) {
                    img.src = blobUrl;
                    return;
                }
            }

            // Stage 5: Show manual reload button if all 5 automatic stages failed
            loader.style.display = 'none';
            let retryBox = wrapper.querySelector('.page-retry-box');
            if (!retryBox) {
                retryBox = document.createElement('div');
                retryBox.className = 'page-retry-box my-4 p-8 rounded-2xl bg-[#121422] border border-dashed border-purple-500/40 text-center space-y-3 w-full max-w-md mx-auto';
                retryBox.innerHTML = `
                    <div class="text-xs font-bold text-slate-300">Page ${pageNum} timed out on image server</div>
                    <button type="button" class="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-purple-600/30">
                        ↻ Click to Reload Page ${pageNum}
                    </button>
                `;
                retryBox.querySelector('button').onclick = async () => {
                    retryBox.remove();
                    loader.style.display = 'flex';
                    if (loaderText) loaderText.textContent = `Refreshing server node for Page ${pageNum}...`;
                    img.dataset.retryStage = '0';
                    if (chapter && chapter.mangadexChapterId) {
                        await this.refreshMangaDexChapterUrls(chapter, false);
                    }
                    const refreshedNodeUrl = chapter?.pagesSaver?.[pageIdx] || chapter?.pages?.[pageIdx] || src;
                    img.src = refreshedNodeUrl + (refreshedNodeUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
                };
                wrapper.appendChild(retryBox);
            }
            loadResolve();
        };

        wrapper.appendChild(img);

        const startLoad = () => {
            if (!img.getAttribute('src')) {
                img.src = nodeUrl;
            }
            return loadDonePromise;
        };

        if (startImmediately) {
            startLoad();
        }

        return { wrapper, startLoad };
    }

    renderReaderChapter(chapter) {
        const queueToken = ++this.activeQueueToken;
        document.getElementById('readerSeriesTitle').textContent = this.app.currentManga
            ? this.app.currentManga.title
            : 'Series';
        document.getElementById('readerChapterTitle').textContent = chapter.title;

        const chaptersList = this.readerChaptersAsc || this.app.currentChapters;
        const select = document.getElementById('readerChapterSelect');
        select.innerHTML = chaptersList
            .map(ch => `<option value="${ch.id}" ${ch.id === chapter.id ? 'selected' : ''}>${ch.title}</option>`)
            .join('');

        document.getElementById('readerPrevBtn').disabled = this.currentChapterIndex <= 0;
        document.getElementById('readerNextBtn').disabled =
            this.currentChapterIndex >= chaptersList.length - 1;

        const container = document.getElementById('readerContainer');
        container.innerHTML = '';
        this.currentSinglePageIndex = 0;

        if (!chapter.pages || chapter.pages.length === 0) {
            container.innerHTML = `
                <div class="py-24 text-center text-slate-500">
                    <i data-lucide="image-off" class="w-12 h-12 mx-auto mb-3"></i>
                    <p class="text-sm">No page images found in this chapter.</p>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        if (this.readingMode === 'webtoon') {
            document.getElementById('singlePageControls').classList.add('hidden');

            const beforeFirstAd = this.createAdElement('beforeFirst');
            if (beforeFirstAd) container.appendChild(beforeFirstAd);

            const pageLoaders = [];

            chapter.pages.forEach((src, idx) => {
                const pageNum = idx + 1;
                // Create wrapper without starting all 40 downloads in the same millisecond;
                // our 4-worker concurrent queue below starts them in order from Page 1 -> end!
                const { wrapper, startLoad } = this.createMangaPageWrapper(src, pageNum, false, chapter, idx);
                container.appendChild(wrapper);
                pageLoaders.push(startLoad);

                if (pageNum === 5) {
                    const afterFifthAd = this.createAdElement('afterFifth');
                    if (afterFifthAd) container.appendChild(afterFifthAd);
                }

                if (pageNum === 10) {
                    const afterTenthAd = this.createAdElement('afterTenth');
                    if (afterTenthAd) container.appendChild(afterTenthAd);
                }
            });

            const afterLastAd = this.createAdElement('afterLast');
            if (afterLastAd) container.appendChild(afterLastAd);

            // Run a 4-worker concurrent download queue so every single page (Page 1, 2, 3, 4, 5 ... N)
            // loads reliably without overwhelming the MangaDex At-Home node!
            this.runPageLoadQueue(pageLoaders, queueToken, 4);
        } else {
            document.getElementById('singlePageControls').classList.remove('hidden');
            this.renderSinglePage(chapter);
        }
    }

    async runPageLoadQueue(pageLoaders, queueToken, concurrency = 4) {
        let nextIndex = 0;
        const worker = async () => {
            while (nextIndex < pageLoaders.length) {
                if (this.activeQueueToken !== queueToken) return;
                const currentIdx = nextIndex++;
                const startLoadFn = pageLoaders[currentIdx];
                if (typeof startLoadFn === 'function') {
                    await Promise.race([
                        startLoadFn(),
                        new Promise(r => setTimeout(r, 4500)) // Never let one slow page block the queue for more than 4.5s
                    ]);
                }
            }
        };

        const workers = [];
        for (let w = 0; w < Math.min(concurrency, pageLoaders.length); w++) {
            workers.push(worker());
        }
        await Promise.all(workers);
    }

    renderSinglePage(chapter) {
        const container = document.getElementById('readerContainer');
        container.innerHTML = '';
        const total = chapter.pages.length;
        const pageNum = this.currentSinglePageIndex + 1;
        const src = chapter.pages[this.currentSinglePageIndex];

        if (pageNum === 1) {
            const beforeFirstAd = this.createAdElement('beforeFirst');
            if (beforeFirstAd) container.appendChild(beforeFirstAd);
        }

        const { wrapper } = this.createMangaPageWrapper(src, pageNum, true, chapter, this.currentSinglePageIndex);
        container.appendChild(wrapper);

        if (pageNum === 5) {
            const afterFifthAd = this.createAdElement('afterFifth');
            if (afterFifthAd) container.appendChild(afterFifthAd);
        }

        if (pageNum === 10) {
            const afterTenthAd = this.createAdElement('afterTenth');
            if (afterTenthAd) container.appendChild(afterTenthAd);
        }

        if (pageNum === total) {
            const afterLastAd = this.createAdElement('afterLast');
            if (afterLastAd) container.appendChild(afterLastAd);
        }

        document.getElementById('singlePageIndicator').textContent = `${pageNum} / ${total}`;
    }

    createAdElement(slotKey) {
        const slot = this.app.monetization?.ads?.[slotKey];
        if (!slot || !slot.enabled) return null;

        const wrapper = document.createElement('div');
        wrapper.className = 'w-full max-w-[900px] mx-auto my-4 px-2 sm:px-0 flex flex-col items-center';

        const badge = document.createElement('div');
        badge.className = 'text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1 flex items-center gap-1';
        badge.innerHTML = `<span>Advertisement</span>`;
        wrapper.appendChild(badge);

        const contentBox = document.createElement('div');
        contentBox.className = 'w-full rounded-xl overflow-hidden border border-[#23273e] bg-[#121422] flex items-center justify-center';

        if (slot.mode === 'html' && slot.htmlCode && slot.htmlCode.trim() !== '') {
            const range = document.createRange();
            const fragment = range.createContextualFragment(slot.htmlCode);
            contentBox.appendChild(fragment);
        } else if (slot.imageUrl && slot.imageUrl.trim() !== '') {
            const link = document.createElement('a');
            link.href = slot.linkUrl && slot.linkUrl.trim() !== '' ? slot.linkUrl : 'javascript:void(0)';
            if (slot.linkUrl && slot.linkUrl.trim() !== '') {
                link.target = '_blank';
                link.rel = 'noopener noreferrer sponsored';
            }
            link.className = 'block w-full';
            const img = document.createElement('img');
            img.src = slot.imageUrl;
            img.alt = 'Sponsored Advertisement';
            img.className = 'w-full h-auto max-h-60 object-cover mx-auto block hover:opacity-95 transition';
            link.appendChild(img);
            contentBox.appendChild(link);
        } else {
            return null;
        }

        wrapper.appendChild(contentBox);
        return wrapper;
    }

    changeSinglePage(delta) {
        const chaptersList = this.readerChaptersAsc || this.app.currentChapters;
        const ch = chaptersList[this.currentChapterIndex];
        if (!ch || !ch.pages) return;
        const newIdx = this.currentSinglePageIndex + delta;
        if (newIdx >= 0 && newIdx < ch.pages.length) {
            this.currentSinglePageIndex = newIdx;
            this.renderSinglePage(ch);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (delta > 0 && newIdx >= ch.pages.length) {
            this.navigateChapter(1);
        } else if (delta < 0 && newIdx < 0) {
            this.navigateChapter(-1);
        }
    }

    toggleReadingMode() {
        this.readingMode = this.readingMode === 'webtoon' ? 'single' : 'webtoon';
        document.getElementById('readingModeLabel').textContent =
            this.readingMode === 'webtoon' ? 'Webtoon (Scroll)' : 'Single Page';
        if (this.currentChapterObj) this.renderReaderChapter(this.currentChapterObj);
    }

    navigateChapter(step) {
        const chaptersList = this.readerChaptersAsc || this.app.currentChapters;
        const newIndex = this.currentChapterIndex + step;
        if (newIndex >= 0 && newIndex < chaptersList.length) {
            this.openReader(chaptersList[newIndex].id, true);
        }
    }

    jumpToChapter(chapterId) {
        this.openReader(chapterId, true);
    }

    toggleFullScreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

window.ReaderController = ReaderController;
