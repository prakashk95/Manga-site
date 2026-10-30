/** @type {import('next').NextConfig} */
const nextConfig = {
    serverExternalPackages: ['@libsql/client'],
    images: {
        domains: ['uploads.mangadex.org', 'mangakatana.com', 'placehold.co', 'wsrv.nl', 'img.mangasual.com', 'manhwaclan.com'],
    },
};

export default nextConfig;