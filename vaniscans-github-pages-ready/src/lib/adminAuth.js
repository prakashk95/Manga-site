import crypto from 'crypto';

export const ADMIN_COOKIE = 'vs_admin';
const SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours

function getSecret() {
    const s = process.env.ADMIN_SESSION_SECRET;
    return s && s.length >= 16 ? s : null;
}

function sign(payload, secret) {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// Returns the cookie value, or null if ADMIN_SESSION_SECRET is not configured
export function createSessionValue() {
    const secret = getSecret();
    if (!secret) return null;
    const exp = String(Date.now() + SESSION_MS);
    return `${exp}.${sign(exp, secret)}`;
}

export const SESSION_MAX_AGE_SECONDS = SESSION_MS / 1000;

export function isAdminRequest(req) {
    const secret = getSecret();
    if (!secret) return false;
    const raw = req.cookies?.get(ADMIN_COOKIE)?.value;
    if (!raw) return false;
    const [exp, sig] = raw.split('.');
    if (!exp || !sig || Number(exp) < Date.now()) return false;
    const expected = sign(exp, secret);
    if (sig.length !== expected.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch (_) {
        return false;
    }
}

export function unauthorized() {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
    });
}

// Credentials are checked on the server only. Set ADMIN_USER_HASH / ADMIN_PASS_HASH
// (SHA-256 hex) in your host's environment variables to rotate them.
const FALLBACK_USER_HASH = '059a50ce956b7ec61527c7ecc0c55b5a009dc54ab4acddce8852b46baa2aba30';
const FALLBACK_PASS_HASH = '9109551a88284a2754a704d50d6636fc596ae718df126354742f1637940bbc5a';

function sha256Hex(text) {
    return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function safeEq(a, b) {
    const x = Buffer.from(String(a).toLowerCase());
    const y = Buffer.from(String(b).toLowerCase());
    if (x.length !== y.length) return false;
    return crypto.timingSafeEqual(x, y);
}

export function checkAdminLogin(username, password) {
    const userHash = (process.env.ADMIN_USER_HASH || FALLBACK_USER_HASH).trim();
    const passHash = (process.env.ADMIN_PASS_HASH || FALLBACK_PASS_HASH).trim();
    const u = String(username || '').trim();
    const p = String(password || '');
    const userOk = safeEq(sha256Hex(u), userHash) || safeEq(sha256Hex(u.toLowerCase()), userHash);
    const passOk = safeEq(sha256Hex(p), passHash) || safeEq(sha256Hex(p.trim()), passHash);
    return userOk && passOk;
}
