export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { loadTursoRuntimeConfig, saveTursoRuntimeConfig, getDb } from '@/lib/db';

export async function GET() {
    try {
        const cfg = await loadTursoRuntimeConfig();
        return NextResponse.json({
            url: cfg.url || '',
            hasToken: Boolean(cfg.authToken),
            source: cfg.source || 'local',
            isNetlify: Boolean(process.env.NETLIFY),
            isVercel: Boolean(process.env.VERCEL)
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { url, authToken } = await req.json();
        await saveTursoRuntimeConfig(url, authToken);
        // Verify connection & initialize schema
        const db = await getDb();
        const res = await db.execute('SELECT COUNT(*) as count FROM mangas');
        return NextResponse.json({
            success: true,
            url: (url || '').trim(),
            mangaCount: res.rows?.[0]?.count ?? 0
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
