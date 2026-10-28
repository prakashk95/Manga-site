const express = require('express');
const router = express.Router();
const mangaController = require('../controllers/mangaController');

// Auth Route (SHA-256 Hash Verification)
router.post('/auth/login', mangaController.verifyAdminLogin);

// MangaDex Live Crawler & Binary Image Proxy Routes
router.get('/mangadex/search', mangaController.searchMangaDex);
router.get('/mangadex/feed', mangaController.getMangaDexFeed);
router.get('/mangadex/pages', mangaController.getMangaDexPages);
router.get('/mangadex/img', mangaController.proxyMangaDexImage);

// MangaKatana Live Crawler & Binary Image Proxy Routes
router.get('/mangakatana/search', mangaController.searchMangaKatana);
router.get('/mangakatana/chapters', mangaController.getMangaKatanaChapters);
router.get('/mangakatana/pages', mangaController.getMangaKatanaPages);
router.get('/mangakatana/img', mangaController.proxyMangaDexImage);

// Dynamic Manga Series Routes
router.get('/mangas', mangaController.getAllMangas);
router.post('/mangas', mangaController.saveManga);
router.delete('/mangas/:id', mangaController.deleteManga);

// Dynamic Chapters Routes
router.get('/mangas/:mangaId/chapters', mangaController.getChaptersForManga);
router.get('/chapters/:id', mangaController.getChapterById);
router.post('/chapters', mangaController.saveChapter);
router.post('/chapters/bulk', mangaController.bulkSaveChapters);

// Monetization & GA Settings
router.get('/monetization', mangaController.getMonetization);
router.post('/monetization', mangaController.saveMonetization);

module.exports = router;
