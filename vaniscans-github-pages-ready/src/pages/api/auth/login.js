import crypto from 'crypto';

const ADMIN_USER_HASH = '059a50ce956b7ec61527c7ecc0c55b5a009dc54ab4acddce8852b46baa2aba30';
const ADMIN_PASS_HASH = '9109551a88284a2754a704d50d6636fc596ae718df126354742f1637940bbc5a';

function safeCompareHex(a, b) {
    if (!a || !b || a.length !== 64 || b.length !== 64) return false;
    try {
        return crypto.timingSafeEqual(
            Buffer.from(a.toLowerCase(), 'utf-8'),
            Buffer.from(b.toLowerCase(), 'utf-8')
        );
    } catch (_) {
        return false;
    }
}

export async function POST({ request }) {
    try {
        const body = await request.json();
        const { userHash, userLowerHash, passHash } = body || {};

        const userOk = safeCompareHex(userHash, ADMIN_USER_HASH) || safeCompareHex(userLowerHash, ADMIN_USER_HASH);
        const passOk = safeCompareHex(passHash, ADMIN_PASS_HASH);

        if (userOk && passOk) {
            return Response.json({
                success: true,
                token: crypto.randomBytes(24).toString('hex')
            });
        }
        return Response.json({ success: false, message: 'Incorrect credentials' }, { status: 401 });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}
