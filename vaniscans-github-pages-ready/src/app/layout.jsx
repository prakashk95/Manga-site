import './globals.css';
import { getDb, getCachedQuery } from '@/lib/db';
import { mergeMonetization } from '@/lib/monetization';

export const revalidate = 60;

async function getServerMonetization() {
    try {
        const raw = await getCachedQuery('monetization_settings', 120000, async () => {
            const db = await getDb();
            const row = await db.execute('SELECT settings FROM monetization WHERE id = 1');
            if (row.rows && row.rows.length > 0 && row.rows[0].settings) {
                return JSON.parse(row.rows[0].settings);
            }
            return {};
        });
        return mergeMonetization(raw);
    } catch (_) {}
    return mergeMonetization(null);
}

async function getServerSeoCatalog() {
    try {
        return await getCachedQuery('seo_ssr_catalog_links', 300000, async () => {
            const db = await getDb();
            const rows = await db.execute('SELECT id, mangadexId, mangakatanaId, title, author, synopsis, genres, status FROM mangas ORDER BY updatedAt DESC LIMIT 100');
            return (rows.rows || []).map(m => {
                const base = (m.title || 'series').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                const hash = (m.mangadexId || m.mangakatanaId || m.id || '').replace(/^manga-(md|mk)-/, '').slice(0, 8).toLowerCase();
                const slug = hash ? `${base}-${hash}` : base;
                return {
                    id: m.id,
                    title: m.title,
                    author: m.author || 'Author',
                    synopsis: m.synopsis || '',
                    status: m.status || 'Ongoing',
                    slug
                };
            });
        });
    } catch (_) {
        return [];
    }
}

function extractVerificationToken(rawInput = '') {
    const trimmed = (rawInput || '').trim();
    if (!trimmed) return '';
    const match = trimmed.match(/name=["']google-site-verification["'][^>]*content=["']([^"']+)["']/i)
        || trimmed.match(/content=["']([^"']+)["'][^>]*name=["']google-site-verification["']/i);
    if (match && match[1]) return match[1].trim();
    if (!trimmed.startsWith('<')) return trimmed;
    return '';
}

function parseCustomMetaTags(html = '') {
    const metas = [];
    const metaRegex = /<meta\s+([^>]*?)\/?>/gi;
    let match;
    while ((match = metaRegex.exec(html)) !== null) {
        const attrStr = match[1];
        const attrs = {};
        const attrPairRegex = /([a-zA-Z0-9_-]+)\s*=\s*["']([^"']*)["']/g;
        let pair;
        while ((pair = attrPairRegex.exec(attrStr)) !== null) {
            attrs[pair[1]] = pair[2];
        }
        if (Object.keys(attrs).length > 0) {
            metas.push(attrs);
        }
    }
    return metas;
}

export async function generateMetadata() {
    const m = await getServerMonetization();
    const tokenFromField = extractVerificationToken(m.googleSiteVerification);
    const tokenFromHead = extractVerificationToken(m.customHeadCode);
    const finalVerificationToken = tokenFromField || tokenFromHead;

    const metaObj = {
        metadataBase: new URL('https://vaniscans.online'),
        title: {
            default: 'VaniScans — Read Manhwa, Manga & Webtoons Online',
            template: '%s'
        },
        description: 'Read high-quality manga, manhwa, and webtoons online free on VaniScans (vaniscans.online). Fast updates, vertical webtoon scroll, and zero popups.',
        keywords: ['VaniScans', 'vaniscans.online', 'read manga online', 'read manhwa online', 'webtoons online', 'Infinite Mage', 'Solo Leveling', 'manga reader'],
        alternates: {
            canonical: 'https://vaniscans.online',
        },
        openGraph: {
            title: 'VaniScans — Read Manhwa, Manga & Webtoons Online',
            description: 'Read high-quality manga, manhwa, and webtoons online free on VaniScans (vaniscans.online).',
            url: 'https://vaniscans.online',
            siteName: 'VaniScans',
            type: 'website',
        },
    };

    if (finalVerificationToken) {
        metaObj.verification = {
            google: finalVerificationToken,
        };
    }

    return metaObj;
}

export default async function RootLayout({ children }) {
    const [m, seoCatalog] = await Promise.all([
        getServerMonetization(),
        getServerSeoCatalog()
    ]);
    const customHeadHtml = (m.customHeadCode || '').trim();
    const parsedMetas = parseCustomMetaTags(customHeadHtml);

    const websiteJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'VaniScans',
        alternateName: 'vaniscans.online',
        url: 'https://vaniscans.online',
        description: 'High performance manhwa, manga and webtoon reading hub.',
    };

    return (
        <html lang="en" className="dark">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
                />
                {parsedMetas.map((attrs, idx) => (
                    <meta key={`custom-meta-${idx}`} {...attrs} />
                ))}
                {m.gaEnabled && m.gaMeasurementId && (
                    <>
                        <script async src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(m.gaMeasurementId.trim())}`}></script>
                        <script
                            dangerouslySetInnerHTML={{
                                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${m.gaMeasurementId.trim().replace(/'/g, "\\'")}');`
                            }}
                        />
                    </>
                )}
            </head>
            <body className="min-h-screen flex flex-col bg-[#0b0c13] selection:bg-purple-600 selection:text-white">
                {customHeadHtml && (
                    <div
                        id="vaniscans-custom-head-injection"
                        style={{ display: 'none' }}
                        dangerouslySetInnerHTML={{ __html: customHeadHtml }}
                    />
                )}
                {children}
                {/* Server-Rendered SEO Directory so Googlebot immediately crawls all Manga series & Legal Pages without waiting for client JS */}
                {seoCatalog.length > 0 && (
                    <nav aria-label="VaniScans Manga Catalog Directory" className="sr-only">
                        <h2>VaniScans Manga, Manhwa &amp; Webtoon Series Directory</h2>
                        <ul>
                            {seoCatalog.map(item => (
                                <li key={item.id}>
                                    <a href={`/comics/${item.slug}`}>
                                        Read {item.title} Manga Online - VaniScans
                                    </a>
                                    <p>{item.synopsis}</p>
                                </li>
                            ))}
                        </ul>
                    </nav>
                )}
            </body>
        </html>
    );
}
