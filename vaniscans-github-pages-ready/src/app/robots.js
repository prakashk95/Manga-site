export default function robots() {
    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: ['/api/', '/Fang-creater'],
            },
            {
                userAgent: [
                    'GPTBot',
                    'ChatGPT-User',
                    'ClaudeBot',
                    'Claude-Web',
                    'anthropic-ai',
                    'CCBot',
                    'Bytespider',
                    'PetalBot',
                    'AhrefsBot',
                    'SemrushBot',
                    'DotBot',
                    'MJ12bot',
                    'BLEXBot',
                    'DataForSeoBot'
                ],
                disallow: '/',
            },
        ],
        sitemap: 'https://vaniscans.online/sitemap.xml',
        host: 'https://vaniscans.online',
    };
}
