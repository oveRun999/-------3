// GET /api/programs?date=2026-04-01&stadium=2
// 指定日・会場の出走表（レース情報 + 全艇）を返す
import { getDB, todayStr } from '~/server/utils/db'

export default defineEventHandler((event) => {
  const query    = getQuery(event)
  const date     = (query.date    as string) || todayStr()
  const stadiumNo = query.stadium ? Number(query.stadium) : null

  const db = getDB()

  // レース情報
  const raceInfoRows = db.prepare(`
    SELECT レース番号, 締切時刻, 日目, グレード名, レース名, サブタイトル, 距離
    FROM レース情報
    WHERE 日付 = ? AND (? IS NULL OR 会場番号 = ?)
    ORDER BY レース番号
  `).all(date, stadiumNo, stadiumNo) as any[]

  // 出走表（全艇）
  const boatRows = db.prepare(`
    SELECT
      レース番号, 艇番, 選手名, 選手番号, 級別番号,
      年齢, 体重, F数, L数, 平均ST,
      全国1着率, 全国2着率, 全国3着率,
      当地1着率, 当地2着率, 当地3着率,
      モーター番号, モーター2着率, モーター3着率,
      ボート番号, ボート2着率, ボート3着率
    FROM 出走表
    WHERE 日付 = ? AND (? IS NULL OR 会場番号 = ?)
    ORDER BY レース番号, 艇番
  `).all(date, stadiumNo, stadiumNo) as any[]

  // 単勝払い戻し（レース完了後のみ存在）
  const winPayouts = db.prepare(`
    SELECT レース番号, 組み合わせ, 金額
    FROM 払い戻し
    WHERE 日付 = ? AND (? IS NULL OR 会場番号 = ?) AND 種別 = '単勝'
  `).all(date, stadiumNo, stadiumNo) as any[]

  // {レース番号: {艇番文字列: 金額}} のマップを作成
  const winMap: Record<number, Record<string, number>> = {}
  for (const w of winPayouts) {
    if (!winMap[w.レース番号]) winMap[w.レース番号] = {}
    winMap[w.レース番号][w.組み合わせ] = w.金額
  }

  // レース番号でグループ化
  const raceMap: Record<number, any> = {}
  for (const r of raceInfoRows) {
    raceMap[r.レース番号] = { ...r, boats: [] }
  }
  for (const b of boatRows) {
    if (raceMap[b.レース番号]) {
      const win = winMap[b.レース番号]?.[String(b.艇番)] ?? null
      raceMap[b.レース番号].boats.push({ ...b, 単勝払い戻し: win })
    }
  }

  return Object.values(raceMap)
})
