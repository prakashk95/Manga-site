// Some sources (FanFox / mfcdn / zjcdn) block hotlinking: the image only loads
// when the request carries their Referer. Route those covers through our proxy.
const HOTLINK_PROTECTED = /fanfox\.net|mfcdn|zjcdn/i;

export function coverSrc(url = '') {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('/api/proxy/img')) return url;
    if (/^https?:\/\//i.test(url) && HOTLINK_PROTECTED.test(url)) {
        return `/api/proxy/img?source=fanfox&url=${encodeURIComponent(url)}`;
    }
    return url;
}
