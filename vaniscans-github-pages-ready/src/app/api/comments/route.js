export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req) {
    try {
        const url = new URL(req.url);
        const chapterId = url.searchParams.get('chapterId');
        if (!chapterId) return NextResponse.json([], { status: 200 });

        const db = await getDb();
        const rows = await db.execute({
            sql: 'SELECT * FROM comments WHERE chapterId = ? ORDER BY createdAt DESC',
            args: [chapterId]
        });
        const comments = rows.rows.map(r => ({
            id: r.id,
            chapterId: r.chapterId,
            author: r.author || 'Anonymous Reader',
            avatarColor: r.avatarColor || '#8b5cf6',
            text: r.text,
            likes: Number(r.likes) || 0,
            createdAt: Number(r.createdAt) || Date.now()
        }));
        return NextResponse.json(comments, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const body = await req.json();
        const { id: incomingId, chapterId, author, text, avatarColor, createdAt: incomingCreatedAt } = body;
        if (!chapterId || !text) {
            return NextResponse.json({ error: 'ChapterId and text required' }, { status: 400 });
        }
        const db = await getDb();
        const id = incomingId || `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const createdAt = Number(incomingCreatedAt) || Date.now();
        await db.execute({
            sql: `INSERT INTO comments (id, chapterId, author, avatarColor, text, likes, createdAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                    text = excluded.text,
                    likes = excluded.likes`,
            args: [id, chapterId, (author || 'Reader').trim(), avatarColor || '#8b5cf6', text.trim(), 0, createdAt]
        });
        return NextResponse.json({ id, chapterId, author, avatarColor, text, likes: 0, createdAt });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(req) {
    try {
        const url = new URL(req.url);
        const chapterId = url.searchParams.get('chapterId');
        const commentId = url.searchParams.get('commentId');
        if (!chapterId || !commentId) return NextResponse.json({ error: 'Missing ids' }, { status: 400 });

        const db = await getDb();
        await db.execute({
            sql: 'DELETE FROM comments WHERE chapterId = ? AND id = ?',
            args: [chapterId, commentId]
        });
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
