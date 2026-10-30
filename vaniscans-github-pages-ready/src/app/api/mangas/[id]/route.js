export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function DELETE(req, { params }) {
    try {
        const db = await getDb();
        const { id } = await params;
        await db.execute({ sql: 'DELETE FROM chapters WHERE mangaId = ?', args: [id] });
        await db.execute({ sql: 'DELETE FROM mangas WHERE id = ?', args: [id] });
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
