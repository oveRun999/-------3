// POST /api/predict-snapshot
// body: { date, stadium, raceNo, honmei, taikou, ana, oozana, boats, upsetAnalysis }
// 予想結果をスナップショットとしてDBに保存（予想ページ表示のたびに自動上書き）
import { getDB } from '~/server/utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { date, stadium, raceNo, honmei, taikou, ana, oozana, boats, upsetAnalysis } = body

  if (!date || !stadium || !raceNo || !boats) {
    throw createError({ statusCode: 400, message: 'date / stadium / raceNo / boats は必須です' })
  }

  const db = getDB()
  db.prepare(`
    INSERT INTO 予想スナップショット
      (日付, 会場番号, レース番号, 本命, 対抗, 穴, 大穴, boats_json, upset_json, 保存日時)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(日付, 会場番号, レース番号) DO UPDATE SET
      本命       = excluded.本命,
      対抗       = excluded.対抗,
      穴         = excluded.穴,
      大穴       = excluded.大穴,
      boats_json = excluded.boats_json,
      upset_json = excluded.upset_json,
      保存日時   = excluded.保存日時
  `).run(
    date,
    Number(stadium),
    Number(raceNo),
    honmei  ?? null,
    taikou  ?? null,
    ana     ?? null,
    oozana  ?? null,
    JSON.stringify(boats),
    upsetAnalysis ? JSON.stringify(upsetAnalysis) : null,
  )

  return { ok: true }
})
