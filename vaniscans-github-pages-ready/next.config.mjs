/** @type {import('next').NextConfig} */
const nextConfig = {
    serverExternalPackages: ['@libsql/client', 'sql.js'],
    images: {
        domains: ['uploads.mangadex.org', 'mangakatana.com', 'placehold.co', 'wsrv.nl'],
    },
};

export default nextConfig;
