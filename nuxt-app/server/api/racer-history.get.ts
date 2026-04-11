// GET /api/racer-history?id=4016
// 指定選手の直近50件の出走履歴を返す
import { getDB } from '~/server/utils/db'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const id    = query.id ? Number(query.id) : null
  if (!id) return []

  const db = getDB()
  return db.prepare(`
    SELECT e.日付, e.会場名, e.レース番号, e.艇番,
           e.モーター番号, e.モーター2着率, e.ボート番号, e.ボート2着率,
           r.着順
    FROM 出走表 e
    LEFT JOIN レース結果 r
      ON r.日付 = e.日付 AND r.会場番号 = e.会場番号
      AND r.レース番号 = e.レース番号 AND r.選手番号 = e.選手番号
    WHERE e.選手番号 = ?
    ORDER BY e.日付 DESC, e.レース番号 DESC
    LIMIT 50
  `).all(id)
})
