// GET /api/results?date=2026-03-31&stadium=2
// 指定日・会場のレース結果 + 払い戻しを返す
import { getDB, todayStr } from '~/server/utils/db'

export default defineEventHandler((event) => {
  const query     = getQuery(event)
  const date      = (query.date    as string) || todayStr()
  const stadiumNo = query.stadium ? Number(query.stadium) : null

  const db = getDB()

  // レース結果
  const resultRows = db.prepare(`
    SELECT
      レース番号, 風速, 波高, 天候番号, 気温, 水温, 決まり手番号,
      艇番, コース番号, スタートST, 着順, 選手番号, 選手名
    FROM レース結果
    WHERE 日付 = ? AND (? IS NULL OR 会場番号 = ?)
    ORDER BY レース番号, 着順
  `).all(date, stadiumNo, stadiumNo) as any[]

  // 払い戻し
  const payoutRows = db.prepare(`
    SELECT レース番号, 種別, 組み合わせ, 金額
    FROM 払い戻し
    WHERE 日付 = ? AND (? IS NULL OR 会場番号 = ?)
    ORDER BY レース番号,
      CASE 種別
        WHEN '三連単' THEN 1 WHEN '三連複' THEN 2 WHEN '二連単' THEN 3
        WHEN '二連複' THEN 4 WHEN '拡連複' THEN 5 WHEN '単勝'  THEN 6
        ELSE 7 END
  `).all(date, stadiumNo, stadiumNo) as any[]

  // レース番号でグループ化
  const raceMap: Record<number, any> = {}
  for (const r of resultRows) {
    if (!raceMap[r.レース番号]) {
      raceMap[r.レース番号] = {
        raceNo: r.レース番号,
        weather: { 風速: r.風速, 波高: r.波高, 天候番号: r.天候番号, 気温: r.気温, 水温: r.水温 },
        boats: [],
        payouts: [],
      }
    }
    if (r.着順) {
      raceMap[r.レース番号].boats.push({
        着順: r.着順, 艇番: r.艇番, 選手名: r.選手名,
        コース番号: r.コース番号, スタートST: r.スタートST,
        決まり手番号: r.決まり手番号,
      })
    }
  }
  for (const p of payoutRows) {
    if (raceMap[p.レース番号]) {
      raceMap[p.レース番号].payouts.push({
        種別: p.種別, 組み合わせ: p.組み合わせ, 金額: p.金額,
      })
    }
  }

  return Object.values(raceMap).filter(r => r.boats.length > 0)
})
