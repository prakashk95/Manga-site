const DEFAULT_MONETIZATION = {
    gaEnabled: false,
    gaMeasurementId: '',
    gaCustomScript: '',
    ads: {
        beforeFirst: {
            id: 'beforeFirst',
            label: '1. Before 1st Image',
            desc: 'Displayed at the very top of the chapter before Page 1.',
            enabled: false,
            mode: 'banner',
            imageUrl: 'https://placehold.co/900x160/1e1b4b/c4b5fd?text=SPONSORED:+Play+Shadow+Monarch+RPG+(Before+1st+Image)',
            linkUrl: 'https://example.com',
            htmlCode: ''
        },
        afterFifth: {
            id: 'afterFifth',
            label: '2. After 5th Image',
            desc: 'Injected automatically right after Page 5 (when chapter has ≥ 5 pages).',
            enabled: false,
            mode: 'banner',
            imageUrl: 'https://placehold.co/900x160/311042/f0abfc?text=AD+BREAK:+Unlock+Premium+Webtoons+(After+5th+Image)',
            linkUrl: 'https://example.com',
            htmlCode: ''
        },
        afterTenth: {
            id: 'afterTenth',
            label: '3. After 10th Image',
            desc: 'Injected automatically right after Page 10 (when chapter has ≥ 10 pages).',
            enabled: false,
            mode: 'banner',
            imageUrl: 'https://placehold.co/900x160/0f2942/7dd3fc?text=MID-CHAPTER+PROMO:+Merch+Store+50%25+OFF+(After+10th+Image)',
            linkUrl: 'https://example.com',
            htmlCode: ''
        },
        afterLast: {
            id: 'afterLast',
            label: '4. After Last Image',
            desc: 'Displayed at the end of the chapter immediately after the final page.',
            enabled: false,
            mode: 'banner',
            imageUrl: 'https://placehold.co/900x180/142e24/6ee7b7?text=CHAPTER+END+SPONSOR:+Join+Our+Discord+Community+(After+Last+Image)',
            linkUrl: 'https://example.com',
            htmlCode: ''
        }
    }
};

class App {
    constructor() {
        this.api = window.apiService;
        this.reader = new window.ReaderController(this);
        this.mangas = [];
        this.currentManga = null;
        this.currentChapters = [];
        this.currentChapterIndex = 0;
        this.activeGenre = 'All';
        this.chapterSortAsc = false;
        this.bookmarks = JSON.parse(localStorage.getItem('vaniscans_bookmarks') || '[]');
        this.monetization = this.loadMonetizationSettings();
        this.heroSlideIndex = 0;
        this.heroInterval = null;
        this.pendingZipFile = null;
        this.tempCoverDataUrl = null;
        this.lastScannedResults = [];
        this.crawlerSource = 'mangadex';
        this.renderGridToken = 0;
    }

    /**
     * Returns today's date in YYYY-MM-DD format according to the user's current local date
     */
    getDailyDateParam() {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    /**
     * Appends the daily changing date parameter (?date=YYYY-MM-DD) to any path
     * while preserving hashes (#adminpanel, #resume) so admin access is never affected.
     */
    buildUrlWithDailyDate(pathname = '/', hash = '') {
        const cleanPath = pathname || '/';
        const today = this.getDailyDateParam();
        const cleanHash = hash ? (hash.startsWith('#') ? hash : `#${hash}`) : '';
        return `${cleanPath}?date=${today}${cleanHash}`;
    }

    /**
     * Ensures the current browser URL always carries today's ?date=YYYY-MM-DD parameter
     * without breaking /adminpanel or #adminpanel routes.
     */
    syncDailyDateInCurrentUrl() {
        try {
            const url = new URL(window.location.href);
            const today = this.getDailyDateParam();
            if (url.searchParams.get('date') !== today) {
                url.searchParams.set('date', today);
                window.history.replaceState(window.history.state, document.title, url.pathname + url.search + url.hash);
            }
        } catch (_) {}
    }

    getMangaSlug(manga) {
        if (!manga) return 'series';
        const base = (manga.title || 'series')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        const shortHash = (manga.mangadexId || manga.mangakatanaId || manga.id || '').replace(/^manga-(md|mk)-/, '').slice(0, 8);
        return shortHash ? `${base}-${shortHash}` : base;
    }

    getChapterSlug(chapter, fallbackIndex = 1) {
        if (!chapter) return String(fallbackIndex);
        if (typeof chapter.number === 'number' && !isNaN(chapter.number)) {
            return String(chapter.number);
        }
        const match = (chapter.title || '').match(/(\d+(\.\d+)?)/);
        return match ? match[1] : String(fallbackIndex);
    }

    findMangaBySlug(slug) {
        const clean = (slug || '').toLowerCase().trim();
        return this.mangas.find(m => {
            const mSlug = this.getMangaSlug(m).toLowerCase();
            if (mSlug === clean || m.id.toLowerCase() === clean) return true;
            const shortHash = (m.mangadexId || m.mangakatanaId || m.id || '').replace(/^manga-(md|mk)-/, '').slice(0, 8).toLowerCase();
            return shortHash && clean.endsWith(`-${shortHash}`);
        });
    }

    async init() {
        window.addEventListener('hashchange', () => this.handleRoute());
        window.addEventListener('popstate', () => this.handleRoute());
        window.addEventListener('scroll', () => {
            if (this.reader?.currentChapterObj && !document.getElementById('readerView').classList.contains('hidden')) {
                sessionStorage.setItem(`vaniscans_scroll_${this.reader.currentChapterObj.id}`, String(window.scrollY));
            }
        }, { passive: true });

        this.initSearchAndListeners();

        const initialPath = (window.location.pathname || '').toLowerCase();
        const initialHash = (window.location.hash || '').toLowerCase();
        if (initialHash.includes('adminpanel') || initialPath.endsWith('/adminpanel')) {
            this.showAdminPanelRoute();
        }
        if (window.lucide) lucide.createIcons();

        try {
            await this.api.init();

            // Permanently purge the 4 old static demo mangas ('manga-1'..'manga-4') so they NEVER reappear!
            if (!localStorage.getItem('vaniscans_demo_purged_v4')) {
                for (const oldDemoId of ['manga-1', 'manga-2', 'manga-3', 'manga-4']) {
                    await this.api.deleteManga(oldDemoId);
                }
                localStorage.setItem('vaniscans_demo_purged_v4', 'true');
            }

            const storedMangas = await this.api.getAllMangas();
            this.mangas = this.api.deduplicateMangas(storedMangas);
        } catch (err) {
            console.warn('Storage error:', err);
            this.mangas = [];
        }

        this.injectGoogleAnalytics();
        this.renderHeroCarousel();
        this.renderPopularSidebar();
        // handleRoute() will call showHomeView() -> renderMangaGrid() ONCE (preventing concurrent duplicate renders!)
        await this.handleRoute();
        if (window.lucide) lucide.createIcons();
    }

    hideAllViews() {
        ['homeView', 'detailView', 'readerView', 'adminLoginView', 'adminDashboardView'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
    }

    async handleRoute() {
        const hash = (window.location.hash || '').toLowerCase();
        const pathname = window.location.pathname || '/';
        const lowerPath = pathname.toLowerCase();
        const fullHref = (window.location.href || '').toLowerCase();

        this.trackAnalyticsPageView(
            document.title,
            window.location.pathname + window.location.search + window.location.hash
        );

        this.syncDailyDateInCurrentUrl();

        // 1. Admin Panel Route (/adminpanel, #adminpanel, or ?adminpanel — works seamlessly with ?date=YYYY-MM-DD)
        const CleanLowerPath = lowerPath.replace(/\/+$/, '');
        if (
            hash.includes('adminpanel') ||
            CleanLowerPath.endsWith('/adminpanel') ||
            fullHref.includes('#adminpanel') ||
            window.location.search.toLowerCase().includes('adminpanel')
        ) {
            this.showAdminPanelRoute();
            return;
        }

        // 2. Live Chapter Reader Route: /comics/<series-slug>/chapter/<chapter-num>
        const chapterMatch = pathname.match(/^\/comics\/([^/]+)\/chapter\/([^/]+)\/?$/i);
        if (chapterMatch && this.mangas.length > 0) {
            const seriesSlug = decodeURIComponent(chapterMatch[1]);
            const chParam = decodeURIComponent(chapterMatch[2]);
            const manga = this.findMangaBySlug(seriesSlug);
            if (manga) {
                this.currentManga = manga;
                this.currentChapters = (await this.api.getChaptersForManga(manga.id)) || [];
                this.sortCurrentChapters();
                const ascList = [...this.currentChapters].sort((a, b) => (a.number || 0) - (b.number || 0));
                const targetCh = ascList.find((ch, idx) => {
                    return (
                        this.getChapterSlug(ch, idx + 1).toLowerCase() === chParam.toLowerCase() ||
                        ch.id.toLowerCase() === chParam.toLowerCase() ||
                        String(ch.number) === chParam
                    );
                }) || ascList[0];

                if (targetCh) {
                    await this.reader.openReader(targetCh.id, false);
                    return;
                }
            }
        }

        // 3. Live Series Detail Route: /comics/<series-slug>
        const seriesMatch = pathname.match(/^\/comics\/([^/]+)\/?$/i);
        if (seriesMatch && this.mangas.length > 0) {
            const seriesSlug = decodeURIComponent(seriesMatch[1]);
            const manga = this.findMangaBySlug(seriesSlug);
            if (manga) {
                await this.showDetailView(manga.id, false);
                return;
            }
        }

        // 4. Default Home Route (/)
        this.showHomeView(false);
    }

    showAdminPanelRoute() {
        this.hideAllViews();
        const isAuthed = sessionStorage.getItem('vaniscans_admin_auth') === 'true';

        if (isAuthed) {
            document.getElementById('adminDashboardView').classList.remove('hidden');
            this.updateSeriesSelectOptions();
            this.renderAdminSeriesList();
            this.renderMonetizationAdminUI();
        } else {
            document.getElementById('adminLoginView').classList.remove('hidden');
        }
        window.scrollTo({ top: 0, behavior: 'instant' });
        if (window.lucide) lucide.createIcons();
    }

    async handleAdminLogin(e) {
        e.preventDefault();
        const u = document.getElementById('adminUser').value.trim();
        const p = document.getElementById('adminPass').value;

        const isValid = await this.api.authenticateAdmin(u, p);
        if (isValid) {
            sessionStorage.setItem('vaniscans_admin_auth', 'true');
            document.getElementById('adminUser').value = '';
            document.getElementById('adminPass').value = '';
            this.showToast('Authentication verified via SHA-256!', 'success');
            this.showAdminPanelRoute();
        } else {
            this.showToast('Invalid credentials provided', 'error');
        }
    }

    adminLogout() {
        sessionStorage.removeItem('vaniscans_admin_auth');
        this.showToast('Admin panel locked', 'info');
        this.showHomeView(true);
    }

    showHomeView(pushUrl = true) {
        if (pushUrl) {
            const targetUrl = this.buildUrlWithDailyDate('/', '');
            if (window.location.pathname + window.location.search !== targetUrl || window.location.hash) {
                window.history.pushState({ view: 'home' }, 'VaniScans — Read Manhwa, Manga & Webtoons', targetUrl);
            }
        } else {
            this.syncDailyDateInCurrentUrl();
        }
        document.title = 'VaniScans — Read Manhwa, Manga & Webtoons';
        document.getElementById('catalogSectionTitle').textContent = 'LATEST CHAPTER RELEASES';
        this.hideAllViews();
        document.getElementById('homeView').classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        this.renderHeroCarousel();
        this.renderMangaGrid();
        this.renderPopularSidebar();
        if (window.lucide) lucide.createIcons();
    }


    decodeHtmlEntities(str) {
        if (!str) return '';
        const txt = document.createElement('textarea');
        txt.innerHTML = str;
        return txt.value;
    }

    getSortedChaptersAscending() {
        if (!this.currentChapters || this.currentChapters.length === 0) return [];
        return [...this.currentChapters].sort((a, b) => {
            const numA = typeof a.number === 'number' ? a.number : parseFloat((a.title || '').replace(/[^\d.-]/g, '')) || 0;
            const numB = typeof b.number === 'number' ? b.number : parseFloat((b.title || '').replace(/[^\d.-]/g, '')) || 0;
            return numA - numB;
        });
    }

    readFirstChapter() {
        const asc = this.getSortedChaptersAscending();
        if (asc.length === 0) {
            this.showToast('No chapters available for this series yet.', 'info');
            return;
        }
        this.openReader(asc[0].id);
    }

    readLatestChapter() {
        const asc = this.getSortedChaptersAscending();
        if (asc.length === 0) {
            this.showToast('No chapters available for this series yet.', 'info');
            return;
        }
        this.openReader(asc[asc.length - 1].id);
    }

    openFirstChapterInReader() {
        this.readFirstChapter();
    }

    // =========================================================================
    // CHAPTER COMMENTS & READER CHAT
    // =========================================================================

    async loadAndRenderChapterComments(chapterId) {
        if (!chapterId) return;
        const savedAuthor = localStorage.getItem('vaniscans_reader_nickname') || '';
        const authorInput = document.getElementById('commentAuthorInput');
        if (authorInput && !authorInput.value && savedAuthor) {
            authorInput.value = savedAuthor;
        }

        const comments = await this.api.getCommentsForChapter(chapterId);
        this.renderChapterCommentsList(chapterId, comments);
    }

    renderChapterCommentsList(chapterId, comments = []) {
        const listEl = document.getElementById('chapterCommentsList');
        const badgeEl = document.getElementById('chapterCommentsCountBadge');
        if (!listEl) return;

        if (badgeEl) badgeEl.textContent = String(comments.length);

        if (comments.length === 0) {
            listEl.innerHTML = `
                <div class="py-10 text-center bg-[#16192a] rounded-2xl border border-dashed border-[#242842] space-y-2">
                    <i data-lucide="message-circle" class="w-8 h-8 text-slate-500 mx-auto"></i>
                    <p class="text-xs font-semibold text-slate-300">No comments on this chapter yet</p>
                    <p class="text-[11px] text-slate-500">Be the first reader to start the discussion!</p>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        const isAdmin = sessionStorage.getItem('vaniscans_admin_auth') === 'true';
        const myCommentIds = JSON.parse(localStorage.getItem('vaniscans_my_comment_ids') || '[]');

        listEl.innerHTML = comments
            .map(c => {
                const initial = (c.author || 'R').trim().charAt(0).toUpperCase();
                const canDelete = isAdmin || myCommentIds.includes(c.id);
                const safeAuthor = (c.author || 'Reader').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const safeText = (c.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                return `
                <div class="p-4 rounded-2xl bg-[#16192a] border border-[#22263e] flex items-start gap-3.5 transition hover:border-purple-500/30">
                    <div class="w-9 h-9 rounded-xl font-black text-xs text-white flex items-center justify-center shrink-0 shadow" style="background:${c.avatarColor || '#8b5cf6'}">
                        ${initial}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between gap-2">
                            <div class="flex items-center gap-2">
                                <span class="text-xs font-bold text-white">${safeAuthor}</span>
                                <span class="text-[10px] text-slate-500">${this.getRelativeTime(c.createdAt)}</span>
                            </div>
                            ${
                                canDelete
                                    ? `<button type="button" onclick="app.handleDeleteChapterComment('${chapterId}', '${c.id}')" class="text-[11px] text-rose-400 hover:text-rose-300 p-1 rounded-lg hover:bg-rose-500/10 transition" title="Delete comment">
                                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                                       </button>`
                                    : ''
                            }
                        </div>
                        <p class="text-xs text-slate-300 mt-1.5 leading-relaxed break-words">${safeText}</p>
                    </div>
                </div>
            `;
            })
            .join('');
        if (window.lucide) lucide.createIcons();
    }

    async handlePostChapterComment(e) {
        e.preventDefault();
        const ch = this.reader?.currentChapterObj;
        if (!ch) return;

        const authorEl = document.getElementById('commentAuthorInput');
        const textEl = document.getElementById('commentTextInput');
        const author = (authorEl?.value || '').trim() || 'Anonymous Reader';
        const text = (textEl?.value || '').trim();
        if (!text) return;

        localStorage.setItem('vaniscans_reader_nickname', author);
        const palette = ['#8b5cf6', '#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6'];
        const color = palette[Math.abs(author.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)) % palette.length];

        try {
            const created = await this.api.addCommentForChapter(ch.id, author, text, color);
            const myCommentIds = JSON.parse(localStorage.getItem('vaniscans_my_comment_ids') || '[]');
            myCommentIds.push(created.id);
            localStorage.setItem('vaniscans_my_comment_ids', JSON.stringify(myCommentIds));

            if (textEl) textEl.value = '';
            await this.loadAndRenderChapterComments(ch.id);
            this.showToast('Comment posted!', 'success');
        } catch (err) {
            this.showToast(err.message || 'Could not post comment', 'error');
        }
    }

    async handleDeleteChapterComment(chapterId, commentId) {
        await this.api.deleteCommentForChapter(chapterId, commentId);
        await this.loadAndRenderChapterComments(chapterId);
        this.showToast('Comment deleted', 'info');
    }

    openReader(chapterId) { return this.reader.openReader(chapterId, true); }
    reloadCurrentChapterImages() { return this.reader.reloadCurrentChapterImages(); }
    exitReader() { return this.reader.exitReader(); }
    navigateChapter(step) { return this.reader.navigateChapter(step); }
    jumpToChapter(chapterId) { return this.reader.jumpToChapter(chapterId); }
    toggleReadingMode() { return this.reader.toggleReadingMode(); }
    toggleFullScreen() { return this.reader.toggleFullScreen(); }
    changeSinglePage(delta) { return this.reader.changeSinglePage(delta); }

    loadMonetizationSettings() {
        try {
            const raw = localStorage.getItem('vaniscans_monetization');
            if (!raw) return JSON.parse(JSON.stringify(DEFAULT_MONETIZATION));
            const parsed = JSON.parse(raw);
            return {
                ...DEFAULT_MONETIZATION,
                ...parsed,
                ads: {
                    beforeFirst: { ...DEFAULT_MONETIZATION.ads.beforeFirst, ...(parsed.ads?.beforeFirst || {}) },
                    afterFifth: { ...DEFAULT_MONETIZATION.ads.afterFifth, ...(parsed.ads?.afterFifth || {}) },
                    afterTenth: { ...DEFAULT_MONETIZATION.ads.afterTenth, ...(parsed.ads?.afterTenth || {}) },
                    afterLast: { ...DEFAULT_MONETIZATION.ads.afterLast, ...(parsed.ads?.afterLast || {}) }
                }
            };
        } catch (_) {
            return JSON.parse(JSON.stringify(DEFAULT_MONETIZATION));
        }
    }

    injectGoogleAnalytics() {
        const existingContainer = document.getElementById('vaniscansGaDynamicContainer');
        if (existingContainer) existingContainer.remove();

        if (!this.monetization || !this.monetization.gaEnabled) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'vaniscansGaDynamicContainer';

        const measurementId = (this.monetization.gaMeasurementId || '').trim();
        if (measurementId) {
            const gtagScript = document.createElement('script');
            gtagScript.async = true;
            gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
            wrapper.appendChild(gtagScript);

            const inlineScript = document.createElement('script');
            inlineScript.textContent = `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${measurementId.replace(/'/g, "\\'")}');
            `;
            wrapper.appendChild(inlineScript);
        }

        const customCode = (this.monetization.gaCustomScript || '').trim();
        if (customCode) {
            const range = document.createRange();
            const fragment = range.createContextualFragment(customCode);
            wrapper.appendChild(fragment);
        }

        document.head.appendChild(wrapper);
    }

    trackAnalyticsPageView(pageTitle, pagePath) {
        if (!this.monetization?.gaEnabled) return;
        if (typeof window.gtag === 'function' && this.monetization.gaMeasurementId) {
            window.gtag('event', 'page_view', {
                page_title: pageTitle,
                page_path: pagePath
            });
        }
    }

    toggleMobileDrawer() {
        const drawer = document.getElementById('mobileNavDrawer');
        if (drawer) drawer.classList.toggle('hidden');
    }

    scrollToCatalog() {
        this.showHomeView();
        setTimeout(() => {
            const el = document.getElementById('catalogSection');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 50);
    }

    async showDetailView(mangaId, updateUrl = true) {
        const manga = this.mangas.find(m => m.id === mangaId);
        if (!manga) return;

        this.currentManga = manga;
        this.currentChapters = (await this.api.getChaptersForManga(mangaId)) || [];
        this.sortCurrentChapters();

        if (updateUrl) {
            const slug = this.getMangaSlug(manga);
            const targetUrl = this.buildUrlWithDailyDate(`/comics/${slug}`, '');
            if (window.location.pathname + window.location.search !== targetUrl) {
                window.history.pushState({ view: 'detail', mangaId: manga.id }, `${manga.title} — VaniScans`, targetUrl);
            }
        } else {
            this.syncDailyDateInCurrentUrl();
        }
        document.title = `${manga.title} — VaniScans`;

        this.hideAllViews();
        document.getElementById('detailView').classList.remove('hidden');

        document.getElementById('detailCover').src = manga.cover;
        document.getElementById('detailBanner').style.backgroundImage = `url('${manga.banner || manga.cover}')`;
        document.getElementById('detailTitle').textContent = manga.title;
        document.getElementById('detailAuthor').textContent = manga.author || 'Author Unknown';
        document.getElementById('detailStatus').textContent = manga.status || 'Ongoing';
        document.getElementById('detailRating').innerHTML = `<i data-lucide="star" class="w-3.5 h-3.5 fill-current"></i> ${manga.rating || '9.8'}`;
        document.getElementById('detailTotalChapters').textContent = this.currentChapters.length;
        document.getElementById('detailSynopsis').textContent = this.decodeHtmlEntities(manga.synopsis || 'No synopsis provided.');

        const firstBtn = document.getElementById('firstChapterBtn');
        const latestBtn = document.getElementById('latestChapterBtn');
        if (firstBtn) firstBtn.disabled = this.currentChapters.length === 0;
        if (latestBtn) latestBtn.disabled = this.currentChapters.length === 0;

        const genresContainer = document.getElementById('detailGenres');
        genresContainer.innerHTML = (manga.genres || ['Action'])
            .map(g => `<span class="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-purple-600/20 text-purple-300 border border-purple-500/30">${g}</span>`)
            .join('');

        this.updateBookmarkButtonState();
        this.renderDetailChapterList();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (window.lucide) lucide.createIcons();
    }

    renderHeroCarousel() {
        const hero = document.getElementById('heroCarousel');
        const dots = document.getElementById('carouselDots');
        if (!hero || !dots) return;
        hero.innerHTML = '';
        dots.innerHTML = '';

        this.mangas = this.api.deduplicateMangas(this.mangas);
        const featured = this.mangas.slice(0, 4);
        if (featured.length === 0) {
            hero.innerHTML = `
                <div class="relative z-10 max-w-2xl space-y-3 py-12">
                    <span class="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest bg-purple-600 text-white shadow">Dynamic Hub Ready</span>
                    <h1 class="text-2xl sm:text-4xl font-black text-white">Your Catalog is Empty</h1>
                    <p class="text-xs sm:text-sm text-slate-400">Open the Admin Panel (<code class="text-purple-400">/adminpanel</code>) and use the MangaDex Live Crawler to import series & real chapters.</p>
                </div>
            `;
            return;
        }

        featured.forEach((manga, idx) => {
            const slide = document.createElement('div');
            slide.className = `hero-slide absolute inset-0 w-full h-full flex items-end p-6 sm:p-12 transition-opacity duration-700 ${idx === 0 ? 'opacity-100 z-10' : 'opacity-0 z-0'}`;
            slide.innerHTML = `
                <div class="absolute inset-0 bg-cover bg-center" style="background-image: url('${manga.banner || manga.cover}');">
                    <div class="absolute inset-0 bg-gradient-to-t from-[#0b0c13] via-[#0b0c13]/70 to-transparent"></div>
                    <div class="absolute inset-0 bg-gradient-to-r from-[#0b0c13] via-[#0b0c13]/80 to-transparent"></div>
                </div>
                <div class="relative z-10 max-w-2xl space-y-3">
                    <div class="flex items-center gap-2">
                        <span class="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest bg-purple-600 text-white shadow">Trending #${idx + 1}</span>
                        <span class="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/10 text-purple-300 backdrop-blur">${manga.status}</span>
                    </div>
                    <h1 class="text-2xl sm:text-4xl md:text-5xl font-black text-white leading-tight tracking-tight">${manga.title}</h1>
                    <p class="text-xs sm:text-sm text-slate-300 line-clamp-2 sm:line-clamp-3 leading-relaxed font-normal">${manga.synopsis}</p>
                    <div class="flex items-center gap-3 pt-2">
                        <button onclick="app.showDetailView('${manga.id}')" class="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg shadow-purple-600/30 flex items-center gap-2 transition">
                            <i data-lucide="book-open" class="w-4 h-4"></i> Read Now
                        </button>
                        <button onclick="app.toggleBookmark('${manga.id}')" class="p-2.5 bg-[#171a2d]/80 hover:bg-white/10 text-white rounded-xl border border-white/10 backdrop-blur transition">
                            <i data-lucide="bookmark" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>
            `;
            hero.appendChild(slide);

            const dot = document.createElement('button');
            dot.className = `w-2 h-2 rounded-full transition-all ${idx === 0 ? 'bg-purple-500 w-6' : 'bg-white/30'}`;
            dot.onclick = () => this.setSlide(idx);
            dots.appendChild(dot);
        });

        if (this.heroInterval) clearInterval(this.heroInterval);
        this.heroInterval = setInterval(() => this.nextSlide(), 6000);
    }

    setSlide(index) {
        const slides = document.querySelectorAll('.hero-slide');
        const dots = document.querySelectorAll('#carouselDots button');
        slides.forEach((s, idx) => {
            if (idx === index) {
                s.classList.remove('opacity-0', 'z-0');
                s.classList.add('opacity-100', 'z-10');
            } else {
                s.classList.add('opacity-0', 'z-0');
                s.classList.remove('opacity-100', 'z-10');
            }
        });
        dots.forEach((d, idx) => {
            d.className =
                idx === index
                    ? 'w-6 h-2 rounded-full bg-purple-500 transition-all'
                    : 'w-2 h-2 rounded-full bg-white/30 transition-all';
        });
        this.heroSlideIndex = index;
    }

    nextSlide() {
        const count = Math.min(this.mangas.length, 4);
        if (count <= 1) return;
        this.setSlide((this.heroSlideIndex + 1) % count);
    }

    prevSlide() {
        const count = Math.min(this.mangas.length, 4);
        if (count <= 1) return;
        this.setSlide((this.heroSlideIndex - 1 + count) % count);
    }

    /**
     * Concurrency-safe, deduplicated Manga Grid renderer
     */
    async renderMangaGrid() {
        const currentToken = ++this.renderGridToken;
        const grid = document.getElementById('mangaGrid');
        const empty = document.getElementById('emptyCatalogState');
        if (!grid || !empty) return;

        this.mangas = this.api.deduplicateMangas(this.mangas);
        let filtered = [...this.mangas];

        if (this.activeGenre !== 'All') {
            filtered = filtered.filter(
                m => m.genres && m.genres.some(g => g.toLowerCase() === this.activeGenre.toLowerCase())
            );
        }

        const status = document.getElementById('statusFilter')?.value || 'All';
        if (status !== 'All') {
            filtered = filtered.filter(m => m.status === status);
        }

        const query = document.getElementById('globalSearchInput')?.value.toLowerCase().trim();
        if (query) {
            filtered = filtered.filter(
                m =>
                    m.title.toLowerCase().includes(query) ||
                    (m.author && m.author.toLowerCase().includes(query))
            );
        }

        const sort = document.getElementById('sortFilter')?.value || 'latest';
        if (sort === 'latest') {
            filtered.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        } else if (sort === 'rating') {
            filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        } else if (sort === 'alphabetical') {
            filtered.sort((a, b) => a.title.localeCompare(b.title));
        }

        const badge = document.getElementById('seriesCountBadge');
        if (badge) badge.textContent = `${filtered.length} Series`;

        if (filtered.length === 0) {
            grid.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');

        // Build all cards in a detached fragment first so concurrent calls never interleave!
        const fragment = document.createDocumentFragment();

        for (const manga of filtered) {
            const chapters = (await this.api.getChaptersForManga(manga.id)) || [];
            if (currentToken !== this.renderGridToken) return; // Abort if a newer render started

            chapters.sort((a, b) => (b.number || 0) - (a.number || 0));
            const latest2 = chapters.slice(0, 2);

            const card = document.createElement('div');
            card.className =
                'group flex flex-col bg-[#121422] rounded-2xl overflow-hidden border border-[#1f2337] hover:border-purple-500/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl';
            card.innerHTML = `
                <div class="relative aspect-[3/4] overflow-hidden cursor-pointer" onclick="app.showDetailView('${manga.id}')">
                    <img src="${manga.cover}" alt="${manga.title.replace(/"/g, '&quot;')}" referrerpolicy="no-referrer" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="if(!this.dataset.fb){this.dataset.fb='1';this.src='https://wsrv.nl/?url='+encodeURIComponent(this.src)+'&w=400';}else{this.src='https://placehold.co/400x600/1a1d30/a855f7?text=Cover';}">
                    <div class="absolute inset-0 bg-gradient-to-t from-[#121422] via-transparent to-transparent opacity-80"></div>
                    <div class="absolute top-2 left-2">
                        <span class="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-purple-600 text-white shadow">${manga.status}</span>
                    </div>
                    <div class="absolute top-2 right-2">
                        <button onclick="event.stopPropagation(); app.toggleBookmark('${manga.id}')" class="p-1.5 rounded-lg bg-black/60 text-white hover:text-purple-400 backdrop-blur transition">
                            <i data-lucide="bookmark" class="w-3.5 h-3.5 ${this.isBookmarked(manga.id) ? 'fill-purple-500 text-purple-500' : ''}"></i>
                        </button>
                    </div>
                    <div class="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] font-semibold text-slate-300">
                        <span class="flex items-center gap-1 text-amber-400">
                            <i data-lucide="star" class="w-3 h-3 fill-current"></i> ${manga.rating || '9.8'}
                        </span>
                        <span class="text-slate-400">${this.getRelativeTime(manga.updatedAt)}</span>
                    </div>
                </div>
                <div class="p-3.5 flex flex-col flex-grow justify-between gap-2.5">
                    <div>
                        <h3 onclick="app.showDetailView('${manga.id}')" class="text-sm font-bold text-white group-hover:text-purple-400 transition line-clamp-1 cursor-pointer">
                            ${manga.title}
                        </h3>
                        <p class="text-[11px] text-slate-400 truncate mt-0.5">${manga.author || 'Author Unknown'}</p>
                    </div>
                    <div class="space-y-1.5 pt-1 border-t border-[#1a1d30]">
                        ${
                            latest2.length > 0
                                ? latest2
                                      .map(
                                          ch => `
                            <a href="javascript:void(0)" onclick="app.openReader('${ch.id}')" class="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#181a2c] hover:bg-purple-600 text-slate-300 hover:text-white transition text-xs font-semibold group/ch">
                                <span class="truncate max-w-[125px]">${ch.title}</span>
                                <span class="text-[10px] text-purple-400 group-hover/ch:text-purple-200">${ch.pages ? ch.pages.length + 'p' : 'Read'}</span>
                            </a>
                        `
                                      )
                                      .join('')
                                : `<div class="text-[11px] text-slate-500 italic py-1 text-center">No chapters uploaded</div>`
                        }
                    </div>
                </div>
            `;
            fragment.appendChild(card);
        }

        if (currentToken !== this.renderGridToken) return;
        grid.innerHTML = '';
        grid.appendChild(fragment);
        if (window.lucide) lucide.createIcons();
    }

    renderPopularSidebar() {
        const container = document.getElementById('popularSidebarList');
        if (!container) return;
        this.mangas = this.api.deduplicateMangas(this.mangas);
        const sorted = [...this.mangas].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 6);
        if (sorted.length === 0) {
            container.innerHTML = `<div class="text-xs text-slate-500 py-4 text-center">No series in catalog yet.</div>`;
            return;
        }
        container.innerHTML = sorted
            .map(
                (m, idx) => `
            <div onclick="app.showDetailView('${m.id}')" class="flex items-center gap-3 p-2 rounded-xl hover:bg-[#181b2e] cursor-pointer transition group">
                <div class="w-7 h-7 rounded-lg font-black text-xs flex items-center justify-center shrink-0 ${idx === 0 ? 'bg-purple-600 text-white shadow shadow-purple-600/40' : idx === 1 ? 'bg-indigo-600/80 text-white' : idx === 2 ? 'bg-violet-600/60 text-white' : 'bg-[#1a1d30] text-slate-400'}">
                    ${idx + 1}
                </div>
                <img src="${m.cover}" alt="${m.title.replace(/"/g, '&quot;')}" referrerpolicy="no-referrer" class="w-12 h-16 object-cover rounded-lg shrink-0 border border-white/5" onerror="if(!this.dataset.fb){this.dataset.fb='1';this.src='https://wsrv.nl/?url='+encodeURIComponent(this.src)+'&w=200';}else{this.src='https://placehold.co/100x140/1a1d30/a855f7?text=Cover';}">
                <div class="min-w-0 flex-1">
                    <h4 class="text-xs font-bold text-white group-hover:text-purple-400 transition truncate">${m.title}</h4>
                    <p class="text-[11px] text-slate-400 truncate">${(m.genres || []).slice(0, 2).join(', ')}</p>
                    <div class="flex items-center gap-1 text-[11px] text-amber-400 font-semibold mt-0.5">
                        <i data-lucide="star" class="w-3 h-3 fill-current"></i> ${m.rating || '9.8'}
                    </div>
                </div>
            </div>
        `
            )
            .join('');
        if (window.lucide) lucide.createIcons();
    }

    renderDetailChapterList() {
        const list = document.getElementById('detailChapterList');
        if (!list) return;
        list.innerHTML = '';

        if (this.currentChapters.length === 0) {
            list.innerHTML = `
                <div class="p-8 text-center text-slate-500 bg-[#16182a] rounded-xl border border-dashed border-[#23273e]">
                    <p class="text-xs">No chapters uploaded for this series yet.</p>
                </div>
            `;
            return;
        }

        this.currentChapters.forEach(ch => {
            const row = document.createElement('div');
            row.onclick = () => this.openReader(ch.id);
            row.className =
                'flex items-center justify-between p-3 sm:p-3.5 bg-[#16192a] hover:bg-purple-600/25 hover:border-purple-500/40 border border-[#20243b] rounded-xl cursor-pointer transition group';
            row.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-[#1f233a] group-hover:bg-purple-600 text-purple-400 group-hover:text-white flex items-center justify-center text-xs font-bold transition">
                        <i data-lucide="file-text" class="w-4 h-4"></i>
                    </div>
                    <div>
                        <h4 class="text-sm font-semibold text-white group-hover:text-purple-300 transition">${ch.title}</h4>
                        <span class="text-[11px] text-slate-500">${this.getRelativeTime(ch.createdAt || Date.now())} • ${ch.pages ? ch.pages.length : 0} pages</span>
                    </div>
                </div>
                <span class="text-xs font-bold px-3 py-1 bg-[#1f233a] group-hover:bg-purple-600 text-slate-300 group-hover:text-white rounded-lg transition">Read</span>
            `;
            list.appendChild(row);
        });
        if (window.lucide) lucide.createIcons();
    }

    sortCurrentChapters() {
        this.currentChapters.sort((a, b) => {
            const numA = typeof a.number === 'number' ? a.number : parseFloat(a.title.replace(/[^\d.-]/g, '')) || 0;
            const numB = typeof b.number === 'number' ? b.number : parseFloat(b.title.replace(/[^\d.-]/g, '')) || 0;
            return this.chapterSortAsc ? numA - numB : numB - numA;
        });
    }

    reverseChapterOrder() {
        this.chapterSortAsc = !this.chapterSortAsc;
        this.sortCurrentChapters();
        this.renderDetailChapterList();
    }

    filterChaptersInDetail(val) {
        const term = val.toLowerCase().trim();
        const items = document.querySelectorAll('#detailChapterList > div');
        items.forEach((item, idx) => {
            const ch = this.currentChapters[idx];
            if (!ch) return;
            if (ch.title.toLowerCase().includes(term)) {
                item.classList.remove('hidden');
            } else {
                item.classList.add('hidden');
            }
        });
    }

    switchStudioTab(tab) {
        const tabNew = document.getElementById('tabNewSeries');
        const tabSingle = document.getElementById('tabSingleChapter');
        const tabBulk = document.getElementById('tabBulkZip');
        const tabAnalyticsAds = document.getElementById('tabAnalyticsAds');

        const btnNew = document.getElementById('tabBtnNewSeries');
        const btnSingle = document.getElementById('tabBtnSingleChapter');
        const btnBulk = document.getElementById('tabBtnBulkZip');
        const btnAnalyticsAds = document.getElementById('tabBtnAnalyticsAds');

        [tabNew, tabSingle, tabBulk, tabAnalyticsAds].forEach(t => {
            if (t) t.classList.add('hidden');
        });
        [btnNew, btnSingle, btnBulk, btnAnalyticsAds].forEach(b => {
            if (b)
                b.className =
                    'py-3 px-5 border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center gap-2 whitespace-nowrap';
        });

        const activeBtnClass =
            'py-3 px-5 border-b-2 border-purple-500 text-purple-400 flex items-center gap-2 whitespace-nowrap';

        if (tab === 'newSeries') {
            tabNew.classList.remove('hidden');
            btnNew.className = activeBtnClass;
        } else if (tab === 'singleChapter') {
            tabSingle.classList.remove('hidden');
            btnSingle.className = activeBtnClass;
        } else if (tab === 'bulkZip') {
            tabBulk.classList.remove('hidden');
            btnBulk.className = activeBtnClass;
        } else if (tab === 'analyticsAds') {
            tabAnalyticsAds.classList.remove('hidden');
            btnAnalyticsAds.className = activeBtnClass;
            this.renderMonetizationAdminUI();
        }
        if (window.lucide) lucide.createIcons();
    }

    // =========================================================================
    // MANGADEX.ORG & MANGAKATANA.COM LIVE CRAWLER & CUSTOM CHAPTER IMPORTER
    // =========================================================================

    setCrawlerSource(source) {
        this.crawlerSource = source === 'mangakatana' ? 'mangakatana' : 'mangadex';
        const btnMd = document.getElementById('sourceBtnMangaDex');
        const btnMk = document.getElementById('sourceBtnMangaKatana');
        const searchLabel = document.getElementById('crawlerSearchLabel');
        const searchInput = document.getElementById('mangadexSearchInput');
        const scanBtnLabel = document.getElementById('scanSourceBtnLabel');
        const langSelect = document.getElementById('mangadexLangSelect');

        if (this.crawlerSource === 'mangakatana') {
            if (btnMk) btnMk.className = 'px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 transition flex items-center gap-1.5';
            if (btnMd) btnMd.className = 'px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-[#1a1d30] text-slate-300 hover:text-white border border-[#2b3052] transition flex items-center gap-1.5';
            if (searchLabel) searchLabel.textContent = 'Search MangaKatana Title or URL';
            if (searchInput) searchInput.placeholder = 'e.g. Naruto, Solo Leveling, or mangakatana.com/manga/...';
            if (scanBtnLabel) scanBtnLabel.textContent = 'Search Katana';
            if (langSelect) langSelect.disabled = true;
        } else {
            if (btnMd) btnMd.className = 'px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-purple-600 text-white shadow-lg shadow-purple-600/30 transition flex items-center gap-1.5';
            if (btnMk) btnMk.className = 'px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-[#1a1d30] text-slate-300 hover:text-white border border-[#2b3052] transition flex items-center gap-1.5';
            if (searchLabel) searchLabel.textContent = 'Search MangaDex Title, URL, or UUID';
            if (searchInput) searchInput.placeholder = 'e.g. Berserk, Chainsaw Man, or mangadex.org/title/...';
            if (scanBtnLabel) scanBtnLabel.textContent = 'Search MangaDex';
            if (langSelect) langSelect.disabled = false;
        }
    }

    async scanMangaDexCatalog(presetQuery = null, forceSource = null) {
        if (forceSource) {
            this.setCrawlerSource(forceSource);
        }
        const isKatana = this.crawlerSource === 'mangakatana';
        const sourceLabel = isKatana ? 'MangaKatana.com' : 'MangaDex.org';

        const queryInput = document.getElementById('mangadexSearchInput');
        if (presetQuery !== null && queryInput) {
            queryInput.value = presetQuery;
        }
        const keyword = (queryInput?.value || '').trim();
        const workspace = document.getElementById('scannerWorkspace');
        const grid = document.getElementById('scannedMangaGrid');
        const statusLog = document.getElementById('scannerStatusLog');
        const countBadge = document.getElementById('scannedCountBadge');
        const scanBtn = document.getElementById('scanSourceBtn');

        workspace.classList.remove('hidden');
        if (scanBtn) scanBtn.disabled = true;
        statusLog.textContent = keyword
            ? `Searching ${sourceLabel} for "${keyword}"...`
            : `Fetching Popular Manga from ${sourceLabel}...`;
        countBadge.textContent = `Querying ${isKatana ? 'MangaKatana' : 'MangaDex'}...`;
        grid.innerHTML = `
            <div class="col-span-full py-12 text-center space-y-3">
                <div class="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p class="text-xs text-slate-400">Connecting to <span class="text-purple-400 font-semibold">${sourceLabel}</span> & fetching live series metadata + cover art...</p>
            </div>
        `;

        try {
            const results = isKatana
                ? await this.api.searchMangaKatanaCatalog(keyword)
                : await this.api.searchMangaDexCatalog(keyword);
            this.lastScannedResults = results;

            if (!results || results.length === 0) {
                statusLog.textContent = `No matching series found on ${sourceLabel}.`;
                countBadge.textContent = '0 Series';
                grid.innerHTML = `
                    <div class="col-span-full py-10 text-center text-slate-400 text-xs">
                        No series matched "${keyword}" on ${sourceLabel}. Try another title or switch source above.
                    </div>
                `;
                return;
            }

            statusLog.textContent = `Connected to ${sourceLabel} — Enter how many chapters you want and click Import Series`;
            countBadge.textContent = `${results.length} ${isKatana ? 'MangaKatana' : 'MangaDex'} Series`;
            this.renderScannedMangaCards();
            this.showToast(`Found ${results.length} series on ${sourceLabel}!`, 'success');
        } catch (err) {
            statusLog.textContent = `${sourceLabel} Crawler Error: ${err.message}`;
            countBadge.textContent = 'Error';
            grid.innerHTML = `
                <div class="col-span-full py-10 text-center text-rose-400 text-xs">
                    ${err.message}
                </div>
            `;
            this.showToast(err.message || `Failed to reach ${sourceLabel}`, 'error');
        } finally {
            if (scanBtn) scanBtn.disabled = false;
        }
    }

    getDefaultCustomChapterCount() {
        const val = parseInt(document.getElementById('customChapterCountInput')?.value || '5', 10);
        return isNaN(val) || val < 1 ? 5 : val;
    }

    syncAllCardChapterInputs(val) {
        const num = Math.max(1, parseInt(val, 10) || 1);
        document.querySelectorAll('.card-chapter-count-input').forEach(inp => {
            inp.value = num;
        });
    }

    renderScannedMangaCards() {
        const grid = document.getElementById('scannedMangaGrid');
        if (!grid || !this.lastScannedResults) return;
        const defaultCount = this.getDefaultCustomChapterCount();

        grid.innerHTML = this.lastScannedResults
            .map((item, idx) => {
                const isKatanaItem = item.sourceHost === 'mangakatana.com' || !!item.mangakatanaId;
                const alreadyExists = this.mangas.some(
                    m =>
                        (item.mangadexId && m.mangadexId === item.mangadexId) ||
                        (item.mangakatanaId && m.mangakatanaId === item.mangakatanaId) ||
                        m.title.toLowerCase() === item.title.toLowerCase()
                );
                const badgeClass = isKatanaItem
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-orange-500/20 text-orange-300 border-orange-500/30';
                const badgeText = isKatanaItem ? 'MangaKatana' : 'MangaDex.org';
                const shortId = isKatanaItem
                    ? (item.mangakatanaId || '').slice(0, 12)
                    : (item.mangadexId || '').slice(0, 8);

                return `
                <div class="bg-[#181b2e] border border-[#292d4b] hover:border-purple-500/50 rounded-2xl p-4 flex flex-col justify-between gap-3 transition">
                    <div class="flex gap-3.5">
                        <img src="${item.cover}" alt="${item.title.replace(/"/g, '&quot;')}" referrerpolicy="no-referrer" class="w-20 h-28 object-cover rounded-xl shrink-0 border border-white/10" onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src='https://wsrv.nl/?url='+encodeURIComponent(this.src)+'&w=400';}else{this.src='https://placehold.co/200x300/1a1d30/a855f7?text=Cover';}">
                        <div class="min-w-0 flex-1 space-y-1">
                            <div class="flex items-center justify-between gap-1">
                                <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded ${badgeClass} border truncate">${badgeText}</span>
                                <span class="text-[10px] font-mono text-slate-400 truncate" title="${shortId}">${shortId}</span>
                            </div>
                            <h4 class="text-xs font-black text-white line-clamp-2" title="${item.title.replace(/"/g, '&quot;')}">${item.title}</h4>
                            <p class="text-[11px] text-purple-300 truncate">${item.author}</p>
                            <p class="text-[10px] text-slate-400 line-clamp-2">${item.synopsis}</p>
                        </div>
                    </div>

                    <div class="pt-2.5 border-t border-[#232741] space-y-2">
                        <div class="flex items-center justify-between gap-2">
                            <label class="text-[11px] font-semibold text-slate-300">Chapters to pull:</label>
                            <input type="number" id="cardChCount_${idx}" min="1" max="5000" value="${defaultCount}"
                                class="card-chapter-count-input w-24 bg-[#121422] border border-[#2f3558] rounded-lg px-2.5 py-1 text-xs font-bold text-white text-center focus:outline-none focus:border-purple-500">
                        </div>

                        <button type="button" id="importBtn_${idx}" onclick="app.importScannedMangaByIndex(${idx})" 
                            class="w-full py-2 px-3 rounded-xl text-[11px] font-black uppercase tracking-wider transition flex items-center justify-center gap-1.5 ${alreadyExists ? 'bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30' : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white shadow shadow-purple-600/30'}">
                            <i data-lucide="${alreadyExists ? 'refresh-cw' : 'download-cloud'}" class="w-3.5 h-3.5"></i>
                            <span>${alreadyExists ? 'Pull & Update Chapters' : 'Import Series + Real Chapters'}</span>
                        </button>
                        <div id="cardProgress_${idx}" class="hidden text-[10px] font-mono text-purple-300 truncate text-center"></div>
                    </div>
                </div>
            `;
            })
            .join('');
        if (window.lucide) lucide.createIcons();
    }

    async importScannedMangaByIndex(idx) {
        const item = this.lastScannedResults?.[idx];
        if (!item) return;

        const isKatanaItem = item.sourceHost === 'mangakatana.com' || !!item.mangakatanaId;
        const sourceName = isKatanaItem ? 'MangaKatana' : 'MangaDex';

        const cardInput = document.getElementById(`cardChCount_${idx}`);
        const globalInput = document.getElementById('customChapterCountInput');
        const desiredChapters = Math.max(
            1,
            parseInt(cardInput?.value || globalInput?.value || '5', 10) || 5
        );
        const lang = document.getElementById('mangadexLangSelect')?.value || 'en';

        const btn = document.getElementById(`importBtn_${idx}`);
        const progEl = document.getElementById(`cardProgress_${idx}`);
        const statusLog = document.getElementById('scannerStatusLog');

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span> Crawling ${desiredChapters} Chs...`;
        }
        if (progEl) {
            progEl.classList.remove('hidden');
            progEl.textContent = `Fetching chapter list from ${sourceName}...`;
        }

        try {
            let targetManga = this.mangas.find(
                m =>
                    (item.mangadexId && m.mangadexId === item.mangadexId) ||
                    (item.mangakatanaId && m.mangakatanaId === item.mangakatanaId) ||
                    m.title.trim().toLowerCase() === item.title.trim().toLowerCase()
            );

            const defaultId = isKatanaItem
                ? `manga-mk-${(item.mangakatanaId || Date.now()).toString().replace(/[^a-z0-9]/gi, '').slice(0, 10)}`
                : `manga-md-${(item.mangadexId || Date.now()).toString().slice(0, 8)}`;
            const targetMangaId = targetManga ? targetManga.id : defaultId;

            const realChapters = isKatanaItem
                ? await this.api.crawlMangaKatanaChaptersWithImages(
                      item.mangakatanaUrl || item.mangakatanaId,
                      targetMangaId,
                      desiredChapters,
                      (currentNum, totalToPull, chTitle) => {
                          const msg = `Pulling (${currentNum}/${totalToPull}): ${chTitle}`;
                          if (progEl) progEl.textContent = msg;
                          if (statusLog) statusLog.textContent = `[${item.title}] ${msg}`;
                      }
                  )
                : await this.api.crawlMangaDexChaptersWithImages(
                      item.mangadexId,
                      targetMangaId,
                      desiredChapters,
                      lang,
                      (currentNum, totalToPull, chTitle) => {
                          const msg = `Pulling (${currentNum}/${totalToPull}): ${chTitle}`;
                          if (progEl) progEl.textContent = msg;
                          if (statusLog) statusLog.textContent = `[${item.title}] ${msg}`;
                      }
                  );

            if (!targetManga) {
                targetManga = {
                    id: targetMangaId,
                    mangadexId: item.mangadexId || null,
                    mangakatanaId: item.mangakatanaId || null,
                    mangakatanaUrl: item.mangakatanaUrl || null,
                    title: item.title,
                    author: item.author,
                    cover: item.cover,
                    banner: item.cover,
                    genres: item.genres,
                    status: item.status,
                    rating: parseFloat(item.rating) || 9.6,
                    synopsis: item.synopsis,
                    updatedAt: Date.now()
                };
            } else {
                if (item.mangadexId) targetManga.mangadexId = item.mangadexId;
                if (item.mangakatanaId) targetManga.mangakatanaId = item.mangakatanaId;
                if (item.mangakatanaUrl) targetManga.mangakatanaUrl = item.mangakatanaUrl;
                targetManga.cover = item.cover;
                targetManga.banner = item.cover;
                targetManga.updatedAt = Date.now();
            }

            await this.api.saveManga(targetManga);
            await this.api.bulkSaveChapters(realChapters);

            const freshMangas = await this.api.getAllMangas();
            this.mangas = this.api.deduplicateMangas(freshMangas);

            const totalImages = realChapters.reduce((acc, c) => acc + (c.pages ? c.pages.length : 0), 0);
            if (statusLog) {
                statusLog.textContent = `Successfully pulled ${realChapters.length} chapters (${totalImages} real page images) for "${item.title}" from ${sourceName}!`;
            }

            this.updateSeriesSelectOptions();
            this.renderAdminSeriesList();
            this.renderHeroCarousel();
            await this.renderMangaGrid();
            this.renderPopularSidebar();
            this.renderScannedMangaCards();
            this.showToast(
                `Imported "${item.title}" with ${realChapters.length} real ${sourceName} chapters (${totalImages} pages)!`,
                'success'
            );
        } catch (err) {
            console.error(`${sourceName} Import Error:`, err);
            if (progEl) {
                progEl.classList.remove('hidden');
                progEl.className = 'text-[10px] font-mono text-rose-400 truncate text-center';
                progEl.textContent = err.message || 'Failed to pull chapters';
            }
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<span>Retry Import</span>`;
            }
            this.showToast(err.message || `Failed to pull chapters from ${sourceName}`, 'error');
        }
    }

    renderMonetizationAdminUI() {
        const gaToggle = document.getElementById('gaEnabledToggle');
        const gaIdInput = document.getElementById('gaMeasurementId');
        const gaScriptInput = document.getElementById('gaCustomScript');

        if (gaToggle) gaToggle.checked = !!this.monetization.gaEnabled;
        if (gaIdInput) gaIdInput.value = this.monetization.gaMeasurementId || '';
        if (gaScriptInput) gaScriptInput.value = this.monetization.gaCustomScript || '';

        const container = document.getElementById('adSlotsConfigContainer');
        if (!container) return;

        const slotOrder = ['beforeFirst', 'afterFifth', 'afterTenth', 'afterLast'];
        container.innerHTML = slotOrder
            .map(key => {
                const slot = this.monetization.ads[key];
                return `
                <div class="bg-[#181b2e] border border-[#292d4b] rounded-2xl p-5 space-y-4">
                    <div class="flex items-start justify-between gap-3 border-b border-[#242842] pb-3">
                        <div>
                            <div class="text-sm font-black text-white flex items-center gap-2">
                                <span class="w-2.5 h-2.5 rounded-full ${slot.enabled ? 'bg-emerald-400' : 'bg-slate-600'}" id="dot_${key}"></span>
                                ${slot.label}
                            </div>
                            <p class="text-[11px] text-slate-400 mt-0.5">${slot.desc}</p>
                        </div>
                        <label class="inline-flex items-center cursor-pointer shrink-0">
                            <input type="checkbox" id="adEnabled_${key}" ${slot.enabled ? 'checked' : ''} onchange="app.syncAdCardVisual('${key}')" class="sr-only peer">
                            <div class="w-10 h-5 bg-[#121422] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all relative peer-checked:bg-purple-600"></div>
                        </label>
                    </div>
                    <div class="flex items-center gap-2 text-xs">
                        <span class="text-slate-400 font-semibold">Ad Format:</span>
                        <select id="adMode_${key}" onchange="app.toggleAdSlotMode('${key}', this.value)" class="bg-[#121422] border border-[#292d4b] rounded-lg px-2.5 py-1.5 text-xs text-white font-semibold focus:outline-none focus:border-purple-500">
                            <option value="banner" ${slot.mode === 'banner' ? 'selected' : ''}>Banner Image + Link URL</option>
                            <option value="html" ${slot.mode === 'html' ? 'selected' : ''}>Custom HTML / AdScript</option>
                        </select>
                    </div>
                    <div id="adBannerFields_${key}" class="${slot.mode === 'html' ? 'hidden' : ''} space-y-3">
                        <div>
                            <label class="block text-[11px] font-semibold text-slate-300 mb-1">Banner Image URL</label>
                            <input type="text" id="adImg_${key}" value="${(slot.imageUrl || '').replace(/"/g, '&quot;')}" placeholder="https://example.com/ad.jpg" 
                                class="w-full bg-[#121422] border border-[#292d4b] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500">
                        </div>
                        <div>
                            <label class="block text-[11px] font-semibold text-slate-300 mb-1">Click Destination URL</label>
                            <input type="text" id="adLink_${key}" value="${(slot.linkUrl || '').replace(/"/g, '&quot;')}" placeholder="https://sponsor.com" 
                                class="w-full bg-[#121422] border border-[#292d4b] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500">
                        </div>
                    </div>
                    <div id="adHtmlFields_${key}" class="${slot.mode === 'html' ? '' : 'hidden'} space-y-2">
                        <label class="block text-[11px] font-semibold text-slate-300 mb-1">Custom Ad HTML / Script</label>
                        <textarea id="adHtml_${key}" rows="4" placeholder="Custom ad code snippet..." 
                            class="w-full bg-[#121422] border border-[#292d4b] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-purple-500">${slot.htmlCode || ''}</textarea>
                    </div>
                </div>
            `;
            })
            .join('');
    }

    syncAdCardVisual(key) {
        const checked = document.getElementById(`adEnabled_${key}`)?.checked;
        const dot = document.getElementById(`dot_${key}`);
        if (dot) dot.className = `w-2.5 h-2.5 rounded-full ${checked ? 'bg-emerald-400' : 'bg-slate-600'}`;
    }

    toggleAdSlotMode(key, mode) {
        const bannerBox = document.getElementById(`adBannerFields_${key}`);
        const htmlBox = document.getElementById(`adHtmlFields_${key}`);
        if (mode === 'html') {
            bannerBox?.classList.add('hidden');
            htmlBox?.classList.remove('hidden');
        } else {
            bannerBox?.classList.remove('hidden');
            htmlBox?.classList.add('hidden');
        }
    }

    fillSampleAds() {
        const slotOrder = ['beforeFirst', 'afterFifth', 'afterTenth', 'afterLast'];
        slotOrder.forEach(key => {
            this.monetization.ads[key].enabled = true;
            this.monetization.ads[key].mode = 'banner';
            if (!this.monetization.ads[key].imageUrl) {
                this.monetization.ads[key].imageUrl = DEFAULT_MONETIZATION.ads[key].imageUrl;
            }
        });
        this.renderMonetizationAdminUI();
        this.saveMonetizationSettings();
        this.showToast('Demo ad banners enabled for all 4 positions!', 'success');
    }

    saveMonetizationSettings() {
        this.monetization.gaEnabled = !!document.getElementById('gaEnabledToggle')?.checked;
        this.monetization.gaMeasurementId = (document.getElementById('gaMeasurementId')?.value || '').trim();
        this.monetization.gaCustomScript = (document.getElementById('gaCustomScript')?.value || '').trim();

        const slotOrder = ['beforeFirst', 'afterFifth', 'afterTenth', 'afterLast'];
        slotOrder.forEach(key => {
            const slot = this.monetization.ads[key];
            slot.enabled = !!document.getElementById(`adEnabled_${key}`)?.checked;
            slot.mode = document.getElementById(`adMode_${key}`)?.value || 'banner';
            slot.imageUrl = (document.getElementById(`adImg_${key}`)?.value || '').trim();
            slot.linkUrl = (document.getElementById(`adLink_${key}`)?.value || '').trim();
            slot.htmlCode = (document.getElementById(`adHtml_${key}`)?.value || '').trim();
        });

        localStorage.setItem('vaniscans_monetization', JSON.stringify(this.monetization));
        this.injectGoogleAnalytics();
        this.showToast('Analytics & Chapter Ad settings saved!', 'success');
    }

    updateSeriesSelectOptions() {
        const singleSelect = document.getElementById('singleChapterSeriesSelect');
        const bulkSelect = document.getElementById('bulkZipSeriesSelect');
        const optionsHtml = this.mangas.map(m => `<option value="${m.id}">${m.title}</option>`).join('');
        if (singleSelect) singleSelect.innerHTML = optionsHtml;
        if (bulkSelect) bulkSelect.innerHTML = optionsHtml;
    }

    handleCoverFilePicked(input) {
        const file = input.files[0];
        if (!file) return;
        document.getElementById('coverFileName').textContent = file.name;
        const reader = new FileReader();
        reader.onload = e => {
            this.tempCoverDataUrl = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    renderAdminSeriesList() {
        const listEl = document.getElementById('adminSeriesManageList');
        if (!listEl) return;
        this.mangas = this.api.deduplicateMangas(this.mangas);
        if (this.mangas.length === 0) {
            listEl.innerHTML = `<div class="col-span-full text-xs text-slate-500 py-4 text-center">No series in catalog. Use Tab 1 or Tab 3 (MangaDex Crawler) to add series.</div>`;
            return;
        }
        listEl.innerHTML = this.mangas
            .map(
                m => `
            <div class="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[#181b2e] border border-[#272b46]">
                <div class="flex items-center gap-3 min-w-0">
                    <img src="${m.cover}" referrerpolicy="no-referrer" class="w-10 h-14 object-cover rounded-lg shrink-0" alt="">
                    <div class="min-w-0">
                        <div class="text-xs font-bold text-white truncate">${m.title}</div>
                        <div class="text-[10px] text-slate-400">${m.status} • ★ ${m.rating || '9.8'}</div>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <button onclick="app.loadSeriesForEdit('${m.id}')" class="p-2 rounded-lg bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white transition" title="Edit Series">
                        <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                    </button>
                    <button onclick="app.deleteSeriesById('${m.id}')" class="p-2 rounded-lg bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white transition" title="Delete Series">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
            </div>
        `
            )
            .join('');
        if (window.lucide) lucide.createIcons();
    }

    loadSeriesForEdit(mangaId) {
        const m = this.mangas.find(item => item.id === mangaId);
        if (!m) return;
        document.getElementById('editingSeriesId').value = m.id;
        document.getElementById('seriesInputTitle').value = m.title;
        document.getElementById('seriesInputAuthor').value = m.author || '';
        document.getElementById('seriesInputCoverUrl').value = m.cover.startsWith('data:') ? '' : m.cover;
        document.getElementById('seriesInputGenres').value = (m.genres || []).join(', ');
        document.getElementById('seriesInputStatus').value = m.status || 'Ongoing';
        document.getElementById('seriesInputRating').value = m.rating || 9.8;
        document.getElementById('seriesInputSynopsis').value = m.synopsis || '';
        document.getElementById('seriesFormHeading').textContent = `Editing Series: ${m.title}`;
        document.getElementById('seriesSubmitBtn').textContent = 'Update Series';
        document.getElementById('cancelEditSeriesBtn').classList.remove('hidden');
        this.showToast(`Loaded "${m.title}" for editing`, 'info');
    }

    resetSeriesForm() {
        document.getElementById('seriesEditorForm').reset();
        document.getElementById('editingSeriesId').value = '';
        this.tempCoverDataUrl = null;
        document.getElementById('coverFileName').textContent = '';
        document.getElementById('seriesFormHeading').textContent = 'Create New Manga Series';
        document.getElementById('seriesSubmitBtn').textContent = 'Save & Publish Series';
        document.getElementById('cancelEditSeriesBtn').classList.add('hidden');
    }

    async deleteSeriesById(mangaId) {
        const m = this.mangas.find(item => item.id === mangaId);
        await this.api.deleteManga(mangaId);
        this.mangas = this.mangas.filter(item => item.id !== mangaId);
        this.updateSeriesSelectOptions();
        this.renderAdminSeriesList();
        this.renderHeroCarousel();
        await this.renderMangaGrid();
        this.renderPopularSidebar();
        this.showToast(`Deleted "${m ? m.title : mangaId}" permanently`, 'info');
    }

    async handleCreateSeries(e) {
        e.preventDefault();
        const editId = document.getElementById('editingSeriesId').value;
        const title = document.getElementById('seriesInputTitle').value.trim();
        const author = document.getElementById('seriesInputAuthor').value.trim();
        const coverUrl = document.getElementById('seriesInputCoverUrl').value.trim();
        const genresStr = document.getElementById('seriesInputGenres').value.trim();
        const status = document.getElementById('seriesInputStatus').value;
        const rating = parseFloat(document.getElementById('seriesInputRating').value) || 9.8;
        const synopsis = document.getElementById('seriesInputSynopsis').value.trim();

        const genres = genresStr
            ? genresStr
                  .split(',')
                  .map(g => g.trim())
                  .filter(Boolean)
            : ['Action'];

        if (editId) {
            const existing = this.mangas.find(m => m.id === editId);
            if (existing) {
                existing.title = title;
                existing.author = author || 'Studio Original';
                if (this.tempCoverDataUrl) existing.cover = this.tempCoverDataUrl;
                else if (coverUrl) existing.cover = coverUrl;
                existing.banner = existing.cover;
                existing.genres = genres;
                existing.status = status;
                existing.rating = rating;
                existing.synopsis = synopsis || 'No synopsis provided.';
                existing.updatedAt = Date.now();
                await this.api.saveManga(existing);
                this.showToast(`Updated series "${title}"!`, 'success');
            }
        } else {
            const cover =
                this.tempCoverDataUrl ||
                coverUrl ||
                'https://placehold.co/400x600/1a1d30/a855f7?text=Cover';
            const newManga = {
                id: 'manga-' + Date.now(),
                title,
                author: author || 'Studio Original',
                cover,
                banner: cover,
                genres,
                status,
                rating,
                synopsis: synopsis || 'No synopsis provided.',
                updatedAt: Date.now()
            };
            await this.api.saveManga(newManga);
            const fresh = await this.api.getAllMangas();
            this.mangas = this.api.deduplicateMangas(fresh);
            this.showToast(`Series "${title}" created successfully!`, 'success');
        }

        this.resetSeriesForm();
        this.updateSeriesSelectOptions();
        this.renderAdminSeriesList();
        this.renderHeroCarousel();
        await this.renderMangaGrid();
        this.renderPopularSidebar();
    }

    async handleCreateSingleChapter(e) {
        e.preventDefault();
        const mangaId = document.getElementById('singleChapterSeriesSelect').value;
        const title = document.getElementById('singleChapterTitle').value.trim();
        const files = document.getElementById('singleChapterFiles').files;
        const urlsText = document.getElementById('singleChapterUrls').value.trim();

        if (!mangaId) {
            this.showToast('Please select a target series', 'error');
            return;
        }

        const pages = [];
        if (files && files.length > 0) {
            const fileArray = Array.from(files).sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
            );
            for (const f of fileArray) {
                const dataUrl = await this.fileToDataUrl(f);
                pages.push(dataUrl);
            }
        }
        if (urlsText) {
            const urls = urlsText
                .split('\n')
                .map(u => u.trim())
                .filter(Boolean);
            pages.push(...urls);
        }

        if (pages.length === 0) {
            this.showToast('Please provide image files or URLs', 'error');
            return;
        }

        const newChapter = {
            id: `${mangaId}-ch-${Date.now()}`,
            mangaId,
            title,
            number: parseFloat(title.replace(/[^\d.-]/g, '')) || Date.now() % 1000,
            pages,
            createdAt: Date.now()
        };

        await this.api.saveChapter(newChapter);
        const manga = this.mangas.find(m => m.id === mangaId);
        if (manga) {
            manga.updatedAt = Date.now();
            await this.api.saveManga(manga);
        }

        await this.renderMangaGrid();
        this.showToast(`Published ${title} with ${pages.length} pages!`, 'success');
        e.target.reset();
    }

    handleZipSelected(file) {
        if (!file) return;
        this.pendingZipFile = file;
        document.getElementById('selectedZipFileName').textContent = `Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
        document.getElementById('startZipProcessBtn').disabled = false;
    }

    async processBulkZip() {
        if (!this.pendingZipFile) return;
        const mangaId = document.getElementById('bulkZipSeriesSelect').value;
        if (!mangaId) {
            this.showToast('Select a target series', 'error');
            return;
        }

        const progressSection = document.getElementById('zipProgressSection');
        const progressBar = document.getElementById('zipProgressBar');
        const statusText = document.getElementById('zipStatusText');
        const percentText = document.getElementById('zipPercentText');
        const detailsLog = document.getElementById('zipExtractionDetails');
        const startBtn = document.getElementById('startZipProcessBtn');

        progressSection.classList.remove('hidden');
        startBtn.disabled = true;
        detailsLog.innerHTML = '<div>Opening ZIP container...</div>';

        try {
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(this.pendingZipFile);

            statusText.textContent = 'Analyzing folder structure...';
            progressBar.style.width = '15%';
            percentText.textContent = '15%';

            const imgExts = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'];
            const chaptersMap = new Map();
            const rootImages = [];

            zipContent.forEach((relativePath, zipEntry) => {
                if (zipEntry.dir) return;
                if (relativePath.includes('__MACOSX') || relativePath.split(/[/\\]/).some(p => p.startsWith('.')))
                    return;
                const lowerPath = relativePath.toLowerCase();
                if (!imgExts.some(ext => lowerPath.endsWith(ext))) return;

                const pathParts = relativePath.split(/[/\\]/).filter(Boolean);
                if (pathParts.length > 1) {
                    const folderName = pathParts[pathParts.length - 2];
                    if (!chaptersMap.has(folderName)) chaptersMap.set(folderName, []);
                    chaptersMap.get(folderName).push({
                        filename: pathParts[pathParts.length - 1],
                        entry: zipEntry
                    });
                } else if (pathParts.length === 1) {
                    rootImages.push({
                        filename: pathParts[0],
                        entry: zipEntry
                    });
                }
            });

            if (chaptersMap.size === 0 && rootImages.length > 0) {
                chaptersMap.set(this.pendingZipFile.name.replace(/\.[^/.]+$/, ''), rootImages);
            }

            if (chaptersMap.size === 0) {
                throw new Error('No supported image files found inside chapter folders.');
            }

            const sortedFolders = Array.from(chaptersMap.entries()).sort((a, b) =>
                a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' })
            );

            const detectedCount = sortedFolders.length;
            let processed = 0;
            const createdChapters = [];

            for (const [folderName, files] of sortedFolders) {
                files.sort((a, b) =>
                    a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: 'base' })
                );
                const pages = [];
                for (const fileObj of files) {
                    const blob = await fileObj.entry.async('blob');
                    const dataUrl = await this.blobToDataUrl(blob);
                    pages.push(dataUrl);
                }

                const matchNum = folderName.match(/(\d+(\.\d+)?)/);
                const chapterNum = matchNum ? parseFloat(matchNum[1]) : processed + 1;
                createdChapters.push({
                    id: `${mangaId}-ch-${Date.now()}-${processed}`,
                    mangaId,
                    title: folderName,
                    number: chapterNum,
                    pages,
                    createdAt: Date.now() - (detectedCount - processed) * 1000
                });
                processed++;

                const pct = Math.round(15 + (processed / detectedCount) * 80);
                progressBar.style.width = `${pct}%`;
                percentText.textContent = `${pct}%`;
                statusText.textContent = `Unpacked: ${folderName}`;
                detailsLog.innerHTML += `<div>✓ Created Chapter: <strong>${folderName}</strong> (${pages.length} pages)</div>`;
            }

            await this.api.bulkSaveChapters(createdChapters);
            const manga = this.mangas.find(m => m.id === mangaId);
            if (manga) {
                manga.updatedAt = Date.now();
                await this.api.saveManga(manga);
            }

            progressBar.style.width = '100%';
            percentText.textContent = '100%';
            statusText.textContent = 'Complete!';
            await this.renderMangaGrid();
            this.showToast(`Successfully extracted ${createdChapters.length} chapters!`, 'success');

            setTimeout(() => {
                progressSection.classList.add('hidden');
                document.getElementById('selectedZipFileName').textContent = '';
                this.pendingZipFile = null;
                startBtn.disabled = false;
            }, 1500);
        } catch (err) {
            statusText.textContent = 'Error parsing ZIP';
            this.showToast(err.message || 'Failed to extract ZIP', 'error');
            startBtn.disabled = false;
        }
    }

    toggleBookmark(mangaId) {
        const idx = this.bookmarks.indexOf(mangaId);
        if (idx > -1) {
            this.bookmarks.splice(idx, 1);
            this.showToast('Removed from Bookmarks', 'info');
        } else {
            this.bookmarks.push(mangaId);
            this.showToast('Added to Bookmarks!', 'success');
        }
        localStorage.setItem('vaniscans_bookmarks', JSON.stringify(this.bookmarks));
        this.renderMangaGrid();
        this.updateBookmarkButtonState();
    }

    toggleBookmarkDetail() {
        if (this.currentManga) this.toggleBookmark(this.currentManga.id);
    }

    isBookmarked(mangaId) {
        return this.bookmarks.includes(mangaId);
    }

    updateBookmarkButtonState() {
        const btn = document.getElementById('bookmarkToggleBtn');
        const text = document.getElementById('bookmarkBtnText');
        if (!btn || !this.currentManga) return;

        if (this.isBookmarked(this.currentManga.id)) {
            btn.className =
                'w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 bg-purple-600 text-white border border-purple-500 shadow-lg shadow-purple-600/30 transition';
            text.textContent = 'Bookmarked';
        } else {
            btn.className =
                'w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 bg-[#181b2e] hover:bg-[#20243b] text-slate-300 border border-[#272b46] transition';
            text.textContent = 'Add to Bookmarks';
        }
    }

    filterBookmarks() {
        this.showHomeView();
        document.getElementById('catalogSectionTitle').textContent = 'YOUR SAVED BOOKMARKS';
        const grid = document.getElementById('mangaGrid');
        const empty = document.getElementById('emptyCatalogState');
        if (!grid || !empty) return;
        grid.innerHTML = '';

        const bookmarkedMangas = this.mangas.filter(m => this.isBookmarked(m.id));
        const badge = document.getElementById('seriesCountBadge');
        if (badge) badge.textContent = `${bookmarkedMangas.length} Bookmarks`;

        if (bookmarkedMangas.length === 0) {
            empty.classList.remove('hidden');
            empty.querySelector('h3').textContent = 'No bookmarks saved yet';
            empty.querySelector('p').textContent = 'Explore series and tap the bookmark icon to save your favorites.';
            return;
        }
        empty.classList.add('hidden');

        bookmarkedMangas.forEach(manga => {
            const card = document.createElement('div');
            card.className =
                'group flex flex-col bg-[#121422] rounded-2xl overflow-hidden border border-[#1f2337] hover:border-purple-500/60 transition cursor-pointer';
            card.onclick = () => this.showDetailView(manga.id);
            card.innerHTML = `
                <div class="relative aspect-[3/4] overflow-hidden">
                    <img src="${manga.cover}" alt="${manga.title}" referrerpolicy="no-referrer" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
                    <div class="absolute inset-0 bg-gradient-to-t from-[#121422] via-transparent to-transparent"></div>
                    <div class="absolute bottom-2 left-2.5 right-2.5">
                        <div class="text-xs font-bold text-white truncate">${manga.title}</div>
                        <div class="text-[10px] text-purple-400 font-semibold">${manga.status}</div>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
        if (window.lucide) lucide.createIcons();
    }

    setGenreFilter(genre) {
        this.activeGenre = genre;
        document.querySelectorAll('.genre-tag').forEach(tag => {
            if (tag.dataset.genre === genre) {
                tag.className =
                    'genre-tag active-genre px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600 text-white transition';
            } else {
                tag.className =
                    'genre-tag px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1a1d30] hover:bg-purple-600/30 text-slate-300 transition';
            }
        });
        this.renderMangaGrid();
    }

    filterByGenre(genre) {
        this.showHomeView();
        this.setGenreFilter(genre);
    }

    applyFilters() {
        this.renderMangaGrid();
    }

    initSearchAndListeners() {
        const search = document.getElementById('globalSearchInput');
        if (search) {
            search.addEventListener('input', () => this.renderMangaGrid());
        }

        window.addEventListener('keydown', e => {
            if (
                (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) ||
                (e.altKey && (e.key === 'a' || e.key === 'A'))
            ) {
                e.preventDefault();
                window.location.hash = '#adminpanel';
                this.showAdminPanelRoute();
                return;
            }

            const readerEl = document.getElementById('readerView');
            if (readerEl && !readerEl.classList.contains('hidden')) {
                if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
                    if (this.reader.readingMode === 'single') this.changeSinglePage(1);
                    else this.navigateChapter(1);
                } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
                    if (this.reader.readingMode === 'single') this.changeSinglePage(-1);
                    else this.navigateChapter(-1);
                } else if (e.key === 'f' || e.key === 'F') {
                    this.toggleFullScreen();
                } else if (e.key === 'Escape') {
                    this.exitReader();
                }
            }
        });

        const dropzone = document.getElementById('zipDropzone');
        if (dropzone) {
            ['dragenter', 'dragover'].forEach(name => {
                dropzone.addEventListener(name, e => {
                    e.preventDefault();
                    dropzone.classList.add('border-purple-500', 'bg-purple-900/10');
                });
            });
            ['dragleave', 'drop'].forEach(name => {
                dropzone.addEventListener(name, e => {
                    e.preventDefault();
                    dropzone.classList.remove('border-purple-500', 'bg-purple-900/10');
                });
            });
            dropzone.addEventListener('drop', e => {
                const file = e.dataTransfer.files[0];
                if (file && (file.name.endsWith('.zip') || file.type.includes('zip'))) {
                    this.handleZipSelected(file);
                } else {
                    this.showToast('Please drop a valid .zip file', 'error');
                }
            });
            dropzone.addEventListener('click', () => {
                document.getElementById('bulkZipFileInput').click();
            });
        }
    }

    fileToDataUrl(file) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    }

    blobToDataUrl(blob) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(blob);
        });
    }

    getRelativeTime(timestamp) {
        if (!timestamp) return 'Recently';
        const diff = (Date.now() - timestamp) / 1000;
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)} mins ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
        return `${Math.floor(diff / 86400)} days ago`;
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        const colors = {
            success: 'bg-[#121422] border-emerald-500/60 text-emerald-300',
            error: 'bg-[#121422] border-rose-500/60 text-rose-300',
            info: 'bg-[#121422] border-purple-500/60 text-purple-300'
        };
        toast.className = `p-3.5 px-4 rounded-xl border ${colors[type] || colors.info} shadow-2xl backdrop-blur-md flex items-center gap-2 text-xs font-bold transition-all duration-300 transform translate-y-3 opacity-0`;
        toast.innerHTML = `
            <i data-lucide="${type === 'success' ? 'check-circle' : type === 'error' ? 'alert-triangle' : 'info'}" class="w-4 h-4"></i>
            <span>${message}</span>
        `;
        container.appendChild(toast);
        if (window.lucide) lucide.createIcons();

        requestAnimationFrame(() => {
            toast.classList.remove('translate-y-3', 'opacity-0');
        });

        setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-y-3');
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }
}

let app;
window.addEventListener('DOMContentLoaded', async () => {
    app = new App();
    window.app = app;
    await app.init();
});
