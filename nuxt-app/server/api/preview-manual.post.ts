// POST /api/preview-manual
// body: { date, stadium, raceNo, boats: [{ 艇番, 展示タイム?, スタートST? }] }
import { getDB } from '~/server/utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { date, stadium, raceNo, boats } = body

  if (!date || !stadium || !raceNo || !Array.isArray(boats)) {
    throw createError({ statusCode: 400, message: 'date / stadium / raceNo / boats は必須です' })
  }

  const db = getDB()
  const stmt = db.prepare(`
    INSERT INTO 直前情報手動入力 (日付, 会場番号, レース番号, 艇番, 展示タイム, スタートST)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (日付, 会場番号, レース番号, 艇番)
    DO UPDATE SET
      展示タイム = COALESCE(excluded.展示タイム, 展示タイム),
      スタートST = COALESCE(excluded.スタートST, スタートST)
  `)

  for (const b of boats) {
    stmt.run(
      date,
      Number(stadium),
      Number(raceNo),
      Number(b.艇番),
      b.展示タイム != null ? Number(b.展示タイム) : null,
      b.スタートST != null ? Number(b.スタートST) : null,
    )
  }

  return { ok: true }
})
