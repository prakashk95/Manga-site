export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { isAdminRequest, unauthorized } from '@/lib/adminAuth';

export async function GET() {
    try {
        const db = await getDb();
        const row = await db.execute('SELECT settings FROM monetization WHERE id = 1');
        if (row.rows.length === 0 || !row.rows[0].settings) return NextResponse.json({});
        return NextResponse.json(JSON.parse(row.rows[0].settings), { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req) {
    if (!isAdminRequest(req)) return unauthorized();
    try {
        const db = await getDb();
        const settings = await req.json();
        const jsonStr = JSON.stringify(settings || {});
        await db.execute({
            sql: `INSERT INTO monetization (id, settings, updatedAt)
                 VALUES (1, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                    settings = excluded.settings,
                    updatedAt = excluded.updatedAt`,
            args: [jsonStr, Date.now()]
        });
        return NextResponse.json(settings);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
