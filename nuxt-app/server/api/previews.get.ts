// GET /api/previews?date=2026-04-01&stadium=2
// 指定日・会場の直前情報を返す
import { getDB, todayStr } from '~/server/utils/db'

export default defineEventHandler((event) => {
  const query     = getQuery(event)
  const date      = (query.date    as string) || todayStr()
  const stadiumNo = query.stadium ? Number(query.stadium) : null

  const db = getDB()

  const rows = db.prepare(`
    SELECT
      レース番号, 風速, 風向き番号, 波高, 天候番号, 気温, 水温,
      艇番, コース番号, スタートST, 体重, 体重調整, 展示タイム, チルト調整
    FROM 直前情報
    WHERE 日付 = ? AND (? IS NULL OR 会場番号 = ?)
    ORDER BY レース番号, 艇番
  `).all(date, stadiumNo, stadiumNo) as any[]

  // レース番号でグループ化
  const raceMap: Record<number, { raceNo: number; weather: any; boats: any[] }> = {}
  for (const row of rows) {
    if (!raceMap[row.レース番号]) {
      raceMap[row.レース番号] = {
        raceNo: row.レース番号,
        weather: {
          風速: row.風速, 風向き番号: row.風向き番号,
          波高: row.波高, 天候番号: row.天候番号,
          気温: row.気温, 水温: row.水温,
        },
        boats: [],
      }
    }
    raceMap[row.レース番号].boats.push({
      艇番: row.艇番,
      コース番号: row.コース番号,
      スタートST: row.スタートST,
      体重: row.体重,
      体重調整: row.体重調整,
      展示タイム: row.展示タイム,
      チルト調整: row.チルト調整,
    })
  }

  return Object.values(raceMap)
})
