// POST /api/note-article
// body: { date, stadium, raceNo, markdown }
import { getDB } from '~/server/utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { date, stadium, raceNo, markdown } = body

  if (!date || !stadium || raceNo == null || !markdown) {
    throw createError({ statusCode: 400, message: 'date / stadium / raceNo / markdown は必須です' })
  }

  const db = getDB()
  db.prepare(`
    INSERT INTO note記事 (日付, 会場番号, レース番号, 記事内容, 保存日時)
    VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT (日付, 会場番号, レース番号)
    DO UPDATE SET 記事内容 = excluded.記事内容, 保存日時 = excluded.保存日時
  `).run(date, Number(stadium), Number(raceNo), markdown)

  return { ok: true }
})
