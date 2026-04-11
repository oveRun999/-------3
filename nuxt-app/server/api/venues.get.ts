// GET /api/venues?date=2026-04-01
// 指定日に出走表データがある会場一覧を返す
import { getDB, todayStr } from '~/server/utils/db'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const date  = (query.date as string) || todayStr()

  const db = getDB()
  const rows = db.prepare(`
    SELECT DISTINCT 会場番号, 会場名
    FROM 出走表
    WHERE 日付 = ?
    ORDER BY 会場番号
  `).all(date) as { 会場番号: number; 会場名: string }[]

  return rows
})
