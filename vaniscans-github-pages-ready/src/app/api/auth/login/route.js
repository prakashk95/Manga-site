export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, createSessionValue, isAdminRequest, checkAdminLogin, SESSION_MAX_AGE_SECONDS } from '@/lib/adminAuth';

export async function POST(req) {
    try {
        const body = await req.json();
        const { username, password } = body || {};

        if (!checkAdminLogin(username, password)) {
            return NextResponse.json({ success: false, message: 'Incorrect credentials' }, { status: 401 });
        }

        const session = createSessionValue();
        if (!session) {
            return NextResponse.json({ success: false, message: 'Server is missing ADMIN_SESSION_SECRET (set it in your host environment variables, 16+ random characters).' }, { status: 500 });
        }
        const res = NextResponse.json({ success: true });
        res.cookies.set(ADMIN_COOKIE, session, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: SESSION_MAX_AGE_SECONDS
        });
        return res;
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function GET(req) {
    return NextResponse.json({ authed: isAdminRequest(req) });
}

export async function DELETE() {
    const res = NextResponse.json({ success: true });
    res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
    return res;
}
