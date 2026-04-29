// 全レース一括スナップショット保存ユーティリティ
// refresh後・起動時に呼び出して予想スナップショットテーブルを最新状態にする
import { getDB } from '~/server/utils/db'

const COURSE_WIN_RATE: Record<number, number> = { 1:0.559, 2:0.142, 3:0.128, 4:0.098, 5:0.054, 6:0.019 }
const VENUE_COURSE1_RATE: Record<number, number> = {
  1:0.555, 2:0.438, 3:0.48,  4:0.475, 5:0.53,  6:0.545,
  7:0.545, 8:0.55,  9:0.555,10:0.545,11:0.545,12:0.56,
 13:0.55, 14:0.555,15:0.55, 16:0.545,17:0.545,18:0.63,
 19:0.605,20:0.545,21:0.612,22:0.55, 23:0.55, 24:0.627,
}
const GRADE_WIN_RATE: Record<number, number> = { 1:0.27, 2:0.179, 3:0.103, 4:0.048 }
const GRADE_LABEL:    Record<number, string>  = { 1:'A1', 2:'A2', 3:'B1', 4:'B2' }
const W = { course:28, grade:18, nat_win:12, local_win:6, motor:4.0, boat:2.0, st:25, exhibit_time:20, f_penalty:1.5, session:2.0, course_apt:8, course_st:4 }

const rd = (v: number) => Math.round(v * 100) / 100

/**
 * 指定日（YYYY-MM-DD 形式）の全レースを採点してスナップショットを保存する
 * すでにスナップショットがある場合は上書き（INSERT OR REPLACE）
 */
export function saveSnapshotsForDate(date: string): { saved: number; skipped: number } {
  const db = getDB()
  const dateCompact = date.replace(/-/g, '')

  // ===== 出走表 =====
  const allBoats = db.prepare(`
    SELECT 会場番号, 会場名, 艇番, 選手名, 選手番号, 級別番号, F数, 平均ST,
           全国1着率, 当地1着率, モーター2着率, ボート2着率, レース番号
    FROM 出走表 WHERE 日付 = ? ORDER BY 会場番号, レース番号, 艇番
  `).all(date) as any[]

  if (allBoats.length === 0) return { saved: 0, skipped: 0 }

  // ===== 直前情報 =====
  const allPreviews = db.prepare(`
    SELECT 会場番号, 艇番, レース番号, コース番号, 展示タイム, スタートST, チルト調整
    FROM 直前情報 WHERE 日付 = ?
  `).all(date) as any[]

  // ===== 今節成績 =====
  const playerNos = [...new Set(allBoats.map((b: any) => b.選手番号))] as number[]
  const venueNos  = [...new Set(allBoats.map((b: any) => b.会場番号))] as number[]

  const sessionMap: Record<string, number[]> = {}  // `${venue}-${player}` → [着順...]
  if (playerNos.length > 0 && venueNos.length > 0) {
    const rows = db.prepare(`
      SELECT 会場番号, 選手番号, 着順
      FROM レース結果
      WHERE 会場番号 IN (${venueNos.map(() => '?').join(',')})
        AND 日付 < ?
        AND 選手番号 IN (${playerNos.map(() => '?').join(',')})
    `).all(...venueNos, date, ...playerNos) as any[]
    for (const r of rows) {
      const key = `${r.会場番号}-${r.選手番号}`
      if (!sessionMap[key]) sessionMap[key] = []
      if (r.着順 != null) sessionMap[key].push(r.着順)
    }
  }

  // ===== 選手コース成績 =====
  const pcMap: Record<number, any> = {}
  if (playerNos.length > 0) {
    const pcRows = db.prepare(`
      SELECT s.* FROM 選手コース成績 s
      INNER JOIN (
        SELECT 選手番号, MAX(算出期間_至) AS max_at
        FROM 選手コース成績
        WHERE 選手番号 IN (${playerNos.map(() => '?').join(',')}) AND 算出期間_至 <= ?
        GROUP BY 選手番号
      ) latest ON s.選手番号 = latest.選手番号 AND s.算出期間_至 = latest.max_at
    `).all(...playerNos, dateCompact) as any[]
    for (const pc of pcRows) pcMap[pc.選手番号] = pc
  }

  // ===== レース別グループ化 =====
  const raceKeys = [...new Set(allBoats.map((b: any) => `${b.会場番号}-${b.レース番号}`))]
    .sort((a, b) => {
      const [av, ar] = a.split('-').map(Number)
      const [bv, br] = b.split('-').map(Number)
      return av !== bv ? av - bv : ar - br
    })

  const stmt = db.prepare(`
    INSERT INTO 予想スナップショット
      (日付, 会場番号, レース番号, 本命, 対抗, 穴, 大穴, boats_json, upset_json, 保存日時)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(日付, 会場番号, レース番号) DO UPDATE SET
      本命 = excluded.本命, 対抗 = excluded.対抗,
      穴   = excluded.穴,   大穴 = excluded.大穴,
      boats_json = excluded.boats_json, upset_json = excluded.upset_json,
      保存日時   = excluded.保存日時
  `)

  let saved = 0, skipped = 0

  for (const raceKey of raceKeys) {
    const [venueNo, raceNo] = raceKey.split('-').map(Number)
    const boats = allBoats.filter((b: any) => b.会場番号 === venueNo && b.レース番号 === raceNo)
    if (boats.length === 0) { skipped++; continue }

    const prevMap: Record<number, any> = {}
    for (const p of allPreviews.filter((p: any) => p.会場番号 === venueNo && p.レース番号 === raceNo)) {
      prevMap[p.艇番] = p
    }

    // 展示タイム最速
    const times = Object.values(prevMap)
      .filter((p: any) => p.展示タイム != null && p.展示タイム > 0)
      .map((p: any) => p.展示タイム as number)
    const fastestTime = times.length > 0 ? Math.min(...times) : null

    // 会場・風速補正（スナップショット時は風速情報がないためスキップ）
    const venue1Rate   = VENUE_COURSE1_RATE[venueNo] ?? COURSE_WIN_RATE[1]
    const course1Scale = (1 - venue1Rate) / (1 - COURSE_WIN_RATE[1])

    // ===== スコア算出 =====
    const scored = boats.map((b: any) => {
      const pre     = prevMap[b.艇番] || {}
      const courseNo = pre.コース番号 ?? b.艇番

      const venueAdjRate = courseNo === 1 ? venue1Rate : (COURSE_WIN_RATE[courseNo] ?? 0.019) * course1Scale
      const courseScore  = venueAdjRate * W.course
      const gradeScore   = (GRADE_WIN_RATE[b.級別番号 ?? 3] ?? 0.1) * W.grade
      const natScore     = ((b['全国1着率'] ?? 0) / 100) * W.nat_win
      const localScore   = ((b['当地1着率'] ?? 0) / 100) * W.local_win
      const motorScore   = ((b.モーター2着率 ?? 0) / 100) * W.motor
      const boatScore    = ((b.ボート2着率  ?? 0) / 100) * W.boat

      const pc         = pcMap[b.選手番号]
      const pcEntries  = pc ? (pc[`c${courseNo}進入`] ?? 0) : 0
      const pcCourseST = pc && pcEntries >= 5 ? pc[`c${courseNo}ST`] : null
      const avgST      = pcCourseST ?? b.平均ST ?? 0.18
      const stScore    = (0.2 - avgST) * W.st

      let courseAptScore = 0
      if (pc && pcEntries >= 10) {
        courseAptScore = ((pc[`c${courseNo}複勝率`] ?? 0) / 100 - 0.33) * W.course_apt
      }
      const fPenalty  = (b.F数 ?? 0) * W.f_penalty
      const tiltBonus = (pre.チルト調整 ?? 0) >= 1.0 && courseNo >= 4 ? 1.5 : 0

      let timeScore = 0
      if (pre.展示タイム != null && pre.展示タイム > 0 && fastestTime != null) {
        timeScore = (fastestTime - pre.展示タイム) * W.exhibit_time
      }

      let sessionScore = 0
      const sess = sessionMap[`${venueNo}-${b.選手番号}`]
      if (sess && sess.length >= 1) {
        const avg  = sess.reduce((a: number, c: number) => a + c, 0) / sess.length
        sessionScore = (3.5 - avg) * W.session * Math.min(sess.length / 3, 1)
      }

      const score = courseScore + gradeScore + natScore + localScore + motorScore + boatScore + stScore + timeScore + tiltBonus - fPenalty + sessionScore + courseAptScore

      return {
        艇番: b.艇番, 選手名: b.選手名,
        級別: GRADE_LABEL[b.級別番号] || String(b.級別番号),
        コース番号: courseNo, 展示タイム: pre.展示タイム ?? null,
        平均ST: b.平均ST, score: rd(score),
        scoreDetail: { 今節点: rd(sessionScore) },
      }
    })

    // スコア降順ソート・予想順位付け
    const sortedByScore = [...scored].sort((a, b) => b.score - a.score)
    sortedByScore.forEach((b, i) => { b.予想順位 = i + 1 })

    const b1 = sortedByScore[0], b2 = sortedByScore[1], b3 = sortedByScore[2], b4 = sortedByScore[3]
    if (!b1) { skipped++; continue }

    // 本命
    const honmei = b3 ? `${b1.艇番}→${b2.艇番}→${b3.艇番}` : null

    // 対抗（コース差なだらか、今節調子・級別・展示を重視、本命被りは4位差し替え）
    const TAIKOU_COURSE: Record<number, number> = { 1: 4, 2: 3.5, 3: 3, 4: 2.5, 5: 2, 6: 2 }
    const TAIKOU_GRADE: Record<string, number> = { A1: 8, A2: 5, B1: 2, B2: 0 }
    const taikouSorted = [...scored]
      .map(b => ({
        ...b,
        taikouScore: (TAIKOU_COURSE[b.コース番号 ?? 6] ?? 2)
          + (b.scoreDetail.今節点 ?? 0) * 3
          + (TAIKOU_GRADE[b.級別] ?? 0)
          + (fastestTime != null && b.展示タイム != null && b.展示タイム > 0
              ? (fastestTime - b.展示タイム) * 15 : 0),
      }))
      .sort((a, b) => b.taikouScore - a.taikouScore)
    let taikou: string | null = null
    if (taikouSorted[0] && taikouSorted[1] && taikouSorted[2]) {
      const taikouKey = `${taikouSorted[0].艇番}→${taikouSorted[1].艇番}→${taikouSorted[2].艇番}`
      if (taikouKey === honmei && taikouSorted[3]) {
        taikou = `${taikouSorted[0].艇番}→${taikouSorted[1].艇番}→${taikouSorted[3].艇番}`
      } else {
        taikou = taikouKey
      }
    }

    // 穴（4位→1位→2位）
    const ana = b4 ? `${b4.艇番}→${b1.艇番}→${b2.艇番}` : null

    // 大穴（外コース最高スコア軸）
    let oozana: string | null = null
    const outerBoats = scored.filter(b => (b.コース番号 ?? 0) >= 4).sort((a, b) => b.score - a.score)
    if (outerBoats.length > 0) {
      const axisNo = outerBoats[0].艇番
      const rest   = sortedByScore.filter(b => b.艇番 !== axisNo)
      if (rest.length >= 2) {
        const candidate = `${axisNo}→${rest[0].艇番}→${rest[1].艇番}`
        if (candidate !== ana) oozana = candidate
      }
    }

    stmt.run(date, venueNo, raceNo, honmei, taikou, ana, oozana, JSON.stringify(scored), null)
    saved++
  }

  return { saved, skipped }
}
