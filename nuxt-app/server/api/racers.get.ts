// GET /api/racers?q=西川
// 選手名または選手番号で検索。出走表データから集計した成績を返す
import { getDB } from '~/server/utils/db'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const q     = ((query.q as string) || '').trim()

  if (!q) return []

  const db = getDB()
  const isNum = /^\d+$/.test(q)

  // 出走表から選手の最新情報 + 出走回数を取得（プロフィールをLEFT JOIN）
  const racers = db.prepare(`
    SELECT
      r.選手番号, r.選手名,
      MAX(r.年齢)       AS 年齢,
      MAX(r.体重)       AS 体重,
      MAX(r.級別番号)   AS 級別番号,
      MAX(r.支部番号)   AS 支部番号,
      AVG(r.全国1着率)  AS 全国勝率,
      AVG(r.全国2着率)  AS 全国2着率,
      AVG(r.当地1着率)  AS 当地勝率,
      AVG(r.当地2着率)  AS 当地2着率,
      COUNT(*)          AS 出走回数,
      MAX(r.日付)       AS 最終出走日,
      p.性別            AS 性別,
      p.養成期          AS 養成期
    FROM 出走表 r
    LEFT JOIN 選手プロフィール p ON p.選手番号 = r.選手番号
    WHERE ${isNum ? 'r.選手番号 = ?' : 'r.選手名 LIKE ?'}
    GROUP BY r.選手番号, r.選手名
    ORDER BY 最終出走日 DESC
    LIMIT 30
  `).all(isNum ? Number(q) : `%${q}%`) as any[]

  return racers
})
