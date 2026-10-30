import { getDb } from '@/lib/db';

function humanizeSlug(slug = '') {
    const cleaned = decodeURIComponent(slug)
        .replace(/-[a-z0-9]{8}$/i, '')
        .replace(/^manga-(md|mk|mf)-/i, '')
        .replace(/-/g, ' ')
        .trim();
    if (!cleaned) return 'Manga';
    return cleaned.replace(/\b\w/g, c => c.toUpperCase());
}

export async function generateMetadata({ params }) {
    try {
        const resolvedParams = await params;
        const slug = (resolvedParams?.slug || '').toLowerCase();

        const db = await getDb();
        const rows = await db.execute('SELECT * FROM mangas');
        const list = rows?.rows || [];

        const found = list.find(m => {
            const mSlug = (m.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            const shortHash = (m.mangadexId || m.mangakatanaId || m.mangafireId || m.id || '').replace(/^manga-(md|mk|mf)-/, '').slice(0, 8).toLowerCase();
            const fullSlug = shortHash ? `${mSlug}-${shortHash}` : mSlug;
            return fullSlug === slug || mSlug === slug || (m.id || '').toLowerCase() === slug;
        });

        if (found) {
            const finalTitle = (found.metaTitle && found.metaTitle.trim())
                ? found.metaTitle.trim()
                : `Read ${found.title} - VaniScans`;
            const finalDesc = (found.metaDescription && found.metaDescription.trim())
                ? found.metaDescription.trim()
                : `Read ${found.title} / ${found.synopsis || 'Read manga, manhwa and webtoons online free on VaniScans.'}`;

            return {
                title: finalTitle,
                description: finalDesc,
                openGraph: {
                    title: finalTitle,
                    description: finalDesc,
                    images: found.cover ? [found.cover] : [],
                    type: 'website'
                },
                twitter: {
                    card: 'summary_large_image',
                    title: finalTitle,
                    description: finalDesc,
                    images: found.cover ? [found.cover] : []
                }
            };
        }

        const fallbackName = humanizeSlug(slug);
        const fallbackTitle = `Read ${fallbackName} - VaniScans`;
        const fallbackDesc = `Read ${fallbackName} / Read the latest chapters online in high quality on VaniScans.`;
        return {
            title: fallbackTitle,
            description: fallbackDesc,
            openGraph: {
                title: fallbackTitle,
                description: fallbackDesc,
                type: 'website'
            }
        };
    } catch (_) {
        return {
            title: 'Read Manga Online - VaniScans',
            description: 'High performance manhwa, manga and webtoon reading hub.'
        };
    }
}

export default function MangaSlugLayout({ children }) {
    return <>{children}</>;
}
