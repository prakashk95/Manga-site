import { getDb, invalidateDbCache } from '@/lib/db';

export async function DELETE({ params }) {
    try {
        const db = await getDb();
        const { id } = params;
        await db.execute({ sql: 'DELETE FROM chapters WHERE mangaId = ?', args: [id] });
        await db.execute({ sql: 'DELETE FROM mangas WHERE id = ?', args: [id] });
        invalidateDbCache();
        return Response.json({ success: true });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}
