export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { NextResponse } from 'next/server';
import { getDb, invalidateDbCache } from '@/lib/db';

function formatScoreOut10(sum, count) {
    if (!count || count <= 0) return { avg: 0, display: '0/10', count: 0 };
    const raw = sum / count;
    const rounded = Math.round(raw * 10) / 10;
    const display = Number.isInteger(rounded) ? `${rounded}/10` : `${rounded.toFixed(1)}/10`;
    return { avg: rounded, display, count: Number(count) };
}

export async function GET(req) {
    try {
        const url = new URL(req.url);
        const mangaId = url.searchParams.get('mangaId');
        const userKey = url.searchParams.get('userKey') || '';
        if (!mangaId) return NextResponse.json({ avg: 0, display: '0/10', count: 0, userScore: null });

        const db = await getDb();
        const agg = await db.execute({
            sql: 'SELECT COUNT(*) as cnt, COALESCE(SUM(score), 0) as total FROM ratings WHERE mangaId = ?',
            args: [mangaId]
        });
        const cnt = Number(agg.rows?.[0]?.cnt || 0);
        const total = Number(agg.rows?.[0]?.total || 0);

        let userScore = null;
        if (userKey) {
            const uRow = await db.execute({
                sql: 'SELECT score FROM ratings WHERE mangaId = ? AND userKey = ? LIMIT 1',
                args: [mangaId, userKey]
            });
            if (uRow.rows && uRow.rows.length > 0) {
                userScore = Number(uRow.rows[0].score);
            }
        }

        const formatted = formatScoreOut10(total, cnt);
        return NextResponse.json({ ...formatted, userScore }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const body = await req.json();
        const { mangaId, score, userKey } = body || {};
        const numericScore = Number(score);
        if (!mangaId || !userKey || isNaN(numericScore) || numericScore < 1 || numericScore > 10) {
            return NextResponse.json({ error: 'Valid mangaId, userKey, and score (1-10) required' }, { status: 400 });
        }

        const db = await getDb();
        const id = `rt-${mangaId}-${userKey}`;
        await db.execute({
            sql: `INSERT INTO ratings (id, mangaId, userKey, score, createdAt)
                  VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(mangaId, userKey) DO UPDATE SET
                    score = excluded.score,
                    createdAt = excluded.createdAt`,
            args: [id, mangaId, userKey, numericScore, Date.now()]
        });

        const agg = await db.execute({
            sql: 'SELECT COUNT(*) as cnt, COALESCE(SUM(score), 0) as total FROM ratings WHERE mangaId = ?',
            args: [mangaId]
        });
        const cnt = Number(agg.rows?.[0]?.cnt || 0);
        const total = Number(agg.rows?.[0]?.total || 0);
        const avg = cnt > 0 ? Math.round((total / cnt) * 10) / 10 : 0;

        await db.execute({
            sql: 'UPDATE mangas SET rating = ?, ratingSum = ?, ratingCount = ? WHERE id = ?',
            args: [avg, total, cnt, mangaId]
        });

        invalidateDbCache();
        const formatted = formatScoreOut10(total, cnt);
        return NextResponse.json({ ...formatted, userScore: numericScore });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
