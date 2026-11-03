// Some sources (FanFox / mfcdn / zjcdn / mangafox) block hotlinking or use
// short-lived token URLs: route those covers through our image proxy.
const HOTLINK_PROTECTED = /fanfox\.net|mfcdn|zjcdn|mangafox/i;

export function coverSrc(url = '', fanfoxUrl = '') {
    if (!url || typeof url !== 'string') return url;
    let clean = url.trim();
    if (!clean) return clean;
    if (clean.startsWith('/api/proxy/img') || clean.startsWith('data:')) return clean;

    if (clean.startsWith('//')) {
        clean = `https:${clean}`;
    } else if (clean.startsWith('/') && !clean.startsWith('//')) {
        clean = `https://fanfox.net${clean}`;
    }

    if (/^https?:\/\//i.test(clean) && HOTLINK_PROTECTED.test(clean)) {
        const extra = fanfoxUrl ? `&chapterUrl=${encodeURIComponent(fanfoxUrl)}` : '';
        return `/api/proxy/img?source=fanfox&url=${encodeURIComponent(clean)}${extra}`;
    }
    return clean;
}
