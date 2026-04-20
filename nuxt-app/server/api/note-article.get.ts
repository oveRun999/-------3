// GET /api/note-article?date=2026-04-20&stadium=4&raceNo=7
import { getDB } from '~/server/utils/db'

export default defineEventHandler((event) => {
  const query     = getQuery(event)
  const date      = query.date      as string
  const stadiumNo = Number(query.stadium)
  const raceNo    = Number(query.raceNo)

  if (!date || !stadiumNo || !raceNo) {
    throw createError({ statusCode: 400, message: 'date / stadium / raceNo は必須です' })
  }

  const db  = getDB()
  const row = db.prepare(`
    SELECT 記事内容, 保存日時
    FROM note記事
    WHERE 日付 = ? AND 会場番号 = ? AND レース番号 = ?
  `).get(date, stadiumNo, raceNo) as { 記事内容: string; 保存日時: string } | undefined

  if (!row) return { found: false }

  return { found: true, markdown: row.記事内容, savedAt: row.保存日時 }
})
