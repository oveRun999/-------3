// GET /api/racer-analysis?id=4016&years=5
// 選手コース成績テーブルから選手の特徴・強み・弱みを返す
import { getDB } from '~/server/utils/db'

// コース番号 → ラベル
const COURSE_NAME: Record<number, string> = {
  1: '1コース(イン)', 2: '2コース', 3: '3コース',
  4: '4コース', 5: '5コース', 6: '6コース(アウト)',
}

export default defineEventHandler((event) => {
  const query   = getQuery(event)
  const id      = Number(query.id)
  const years   = Math.min(Number(query.years) || 5, 15)

  if (!id) return null

  const db          = getDB()
  const currentYear = new Date().getFullYear()
  const startYear   = currentYear - years + 1

  // ===== 過去N年の選手コース成績を全期取得 =====
  const records = db.prepare(`
    SELECT 年, 期終了月, 算出期間_自, 算出期間_至,
           c1進入, c1複勝率, c1ST,
           c2進入, c2複勝率, c2ST,
           c3進入, c3複勝率, c3ST,
           c4進入, c4複勝率, c4ST,
           c5進入, c5複勝率, c5ST,
           c6進入, c6複勝率, c6ST
    FROM 選手コース成績
    WHERE 選手番号 = ? AND 年 >= ?
    ORDER BY 年 ASC, 期終了月 ASC
  `).all(id, startYear) as any[]

  if (records.length === 0) return { id, found: false, yearly: [], summary: null, profile: null }

  // ===== コース別の加重平均（進入回数で重み付け） =====
  const courseAvg: Record<number, { rate: number; st: number; entries: number }> = {}
  for (let c = 1; c <= 6; c++) {
    let totalEntries = 0, sumRate = 0, sumST = 0
    for (const r of records) {
      const entries = r[`c${c}進入`] ?? 0
      if (entries < 1) continue
      sumRate    += (r[`c${c}複勝率`] ?? 0) * entries
      sumST      += (r[`c${c}ST`]     ?? 0) * entries
      totalEntries += entries
    }
    courseAvg[c] = {
      rate:    totalEntries > 0 ? Math.round(sumRate / totalEntries * 10) / 10 : 0,
      st:      totalEntries > 0 ? Math.round(sumST  / totalEntries * 1000) / 1000 : 0,
      entries: totalEntries,
    }
  }

  // ===== 年別サマリー（年×期をフラットに） =====
  const yearly = records.map(r => ({
    年: r.年,
    期終了月: r.期終了月,
    label: `${r.年}年${r.期終了月 === 4 ? '4月' : '10月'}期`,
    算出期間_至: r.算出期間_至,
    courses: [1,2,3,4,5,6].map(c => ({
      コース: c,
      進入: r[`c${c}進入`] ?? 0,
      複勝率: r[`c${c}複勝率`] ?? 0,
      ST: r[`c${c}ST`] ?? 0,
    }))
  }))

  // ===== 得意コース・苦手コース =====
  const avgAll = Object.values(courseAvg).reduce((s, v) => s + v.rate, 0) / 6

  // 進入回数10回以上のコースのみ評価対象
  const validCourses = Object.entries(courseAvg)
    .filter(([, v]) => v.entries >= 10)
    .map(([c, v]) => ({ c: Number(c), ...v }))
    .sort((a, b) => b.rate - a.rate)

  const bestCourses  = validCourses.filter(v => v.rate >= avgAll + 8).map(v => v.c)
  const worstCourses = validCourses.filter(v => v.rate <= avgAll - 8).map(v => v.c)

  // ===== STタイプ =====
  const allSTEntries = Object.values(courseAvg).filter(v => v.st > 0 && v.entries >= 5)
  const avgST = allSTEntries.length > 0
    ? allSTEntries.reduce((s, v) => s + v.st, 0) / allSTEntries.length
    : null

  // ===== 年別トレンド（最近2期 vs 以前2期の比較） =====
  let trend: 'up' | 'down' | 'stable' = 'stable'
  if (records.length >= 4) {
    const recent = records.slice(-2)
    const older  = records.slice(-4, -2)
    const avgRecent = (recent.reduce((s, r) => s + [1,2,3,4,5,6].reduce((ss, c) => ss + (r[`c${c}複勝率`] ?? 0), 0) / 6, 0)) / recent.length
    const avgOlder  = (older.reduce((s, r) => s + [1,2,3,4,5,6].reduce((ss, c) => ss + (r[`c${c}複勝率`] ?? 0), 0) / 6, 0)) / older.length
    if (avgRecent - avgOlder > 3) trend = 'up'
    else if (avgOlder - avgRecent > 3) trend = 'down'
  }

  // ===== 選手タイプラベル =====
  const labels: string[] = []

  // イン巧者
  if (courseAvg[1].entries >= 10 && courseAvg[1].rate >= 62) labels.push('イン巧者')
  else if (courseAvg[1].entries >= 10 && courseAvg[1].rate >= 55) labels.push('イン安定')

  // まくり・アウト系
  const outerAvg = [4, 5, 6].filter(c => courseAvg[c].entries >= 10)
    .reduce((s, c) => s + courseAvg[c].rate, 0) / 3
  if (outerAvg >= 38) labels.push('まくり屋')
  else if (outerAvg >= 30) labels.push('アウト健闘')

  // ST系
  if (avgST !== null && avgST <= 0.145) labels.push('スタート巧者')
  else if (avgST !== null && avgST >= 0.20) labels.push('スタート遅め')

  // 万能型（コース別のバラつき小）
  const spread = validCourses.length >= 4
    ? (validCourses[0].rate - validCourses[validCourses.length - 1].rate)
    : 999
  if (spread < 15 && validCourses.length >= 4) labels.push('万能型')

  // トレンド
  if (trend === 'up')   labels.push('📈上昇中')
  if (trend === 'down') labels.push('📉下降気味')

  if (labels.length === 0) labels.push('標準型')

  // ===== 強み・弱みテキスト =====
  const strengths: string[] = []
  const weaknesses: string[] = []

  if (bestCourses.length > 0) {
    strengths.push(`${bestCourses.map(c => COURSE_NAME[c]).join('・')}が得意（複勝率 ${bestCourses.map(c => courseAvg[c].rate + '%').join('・')}）`)
  }
  if (courseAvg[1].entries >= 10 && courseAvg[1].rate >= 58) {
    strengths.push(`インコース勝率 ${courseAvg[1].rate}%（全国平均65%水準）`)
  }
  if (avgST !== null && avgST <= 0.155) {
    strengths.push(`平均ST ${avgST.toFixed(3)}秒（スタートが速い）`)
  }

  if (worstCourses.length > 0) {
    weaknesses.push(`${worstCourses.map(c => COURSE_NAME[c]).join('・')}が苦手（複勝率 ${worstCourses.map(c => courseAvg[c].rate + '%').join('・')}）`)
  }
  if (courseAvg[1].entries >= 10 && courseAvg[1].rate < 45) {
    weaknesses.push(`インコースで苦戦（複勝率 ${courseAvg[1].rate}%）`)
  }
  if (avgST !== null && avgST >= 0.195) {
    weaknesses.push(`平均ST ${avgST.toFixed(3)}秒（スタートが遅め）`)
  }
  if (trend === 'down') {
    weaknesses.push('最近2期の成績が下降傾向')
  }

  return {
    id,
    found: true,
    years,
    yearly,
    summary: {
      courses: [1,2,3,4,5,6].map(c => ({
        コース: c,
        名前: COURSE_NAME[c],
        ...courseAvg[c],
      })),
      avgST,
      trend,
    },
    profile: {
      labels,
      strengths,
      weaknesses,
      bestCourses,
      worstCourses,
    },
  }
})
