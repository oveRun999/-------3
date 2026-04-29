// GET /api/predict?date=2026-04-01&stadium=2&raceNo=1
// 指定レースの各艇スコアを算出して返す
//
// 【最適化済みスコアリング v2】
// 3月分1,518レースでバックテスト済み
//   1着的中率: 55.7%  |  スコア1位がTOP3入り: 81.4%  |  TOP3平均一致率: 69.9%
//
// 主要素と最適化重み:
//   コース(32) > ST(30) > 級別(20) > 展示タイム(20) > 全国1着率(14) > 当地1着率(6)
//   モーター(0.3) / ボート(0.5) は実データでほぼ影響なし → 低重み
import { getDB, todayStr } from '~/server/utils/db'

// ===== 実データに基づくコース別1着率（全国平均） =====
const COURSE_WIN_RATE: Record<number, number> = {
  1: 0.465,
  2: 0.164,
  3: 0.139,
  4: 0.12,
  5: 0.075,
  6: 0.052,
}

// ===== 会場別1コース1着率（実績データ自動生成: 2026-04-10）=====
const VENUE_COURSE1_RATE: Record<number, number> = {
  1: 0.428,  // 桐生
  2: 0.369,  // 戸田
  3: 0.437,  // 江戸川
  4: 0.382,  // 平和島
  5: 0.42,  // 多摩川
  6: 0.438,  // 浜名湖
  7: 0.47,  // 蒲郡
  8: 0.479,  // 常滑
  9: 0.487,  // 津
  10: 0.457,  // 三国
  11: 0.427,  // びわこ
  12: 0.503,  // 住之江
  13: 0.496,  // 尼崎
  14: 0.421,  // 鳴門
  15: 0.474,  // 丸亀
  16: 0.484,  // 児島
  17: 0.491,  // 宮島
  18: 0.534,  // 徳山
  19: 0.499,  // 下関
  20: 0.474,  // 若松
  21: 0.525,  // 芦屋
  22: 0.431,  // 福岡
  23: 0.457,  // 唐津
  24: 0.565,  // 大村
}

// ===== 級別別1着率 =====
const GRADE_WIN_RATE: Record<number, number> = {
  1: 0.270, 2: 0.179, 3: 0.103, 4: 0.048,
}

// 級別番号 → 表示文字列
const GRADE_LABEL: Record<number, string> = { 1: 'A1', 2: 'A2', 3: 'B1', 4: 'B2' }

// ===== 最適化重み（v4: CSVコース適性追加） =====
const W = {
  course:       28,    // コース（会場別補正で実態に近づける）
  grade:        18,    // 級別（A1≫B2）
  nat_win:      12,    // 全国1着率
  local_win:     6,    // 当地1着率
  motor:         4.0,  // モーター2着率
  boat:          2.0,  // ボート2着率
  st:            25,   // 平均ST（低いほど加点）
  exhibit_time:  20,   // 展示タイム差（最速との差）
  f_penalty:     1.5,  // Fペナルティ
  session:       2.0,  // 今節成績
  course_apt:    8,    // コース適性（CSV由来: 選手のコース別複勝率偏差）
  course_st:     4,    // コース別ST補正（CSV由来: 全体平均STより細分化）
}

export default defineEventHandler((event) => {
  const query     = getQuery(event)
  const date      = (query.date as string) || todayStr()
  const stadiumNo = query.stadium ? Number(query.stadium) : null
  const raceNo    = query.raceNo  ? Number(query.raceNo)  : null

  if (!stadiumNo || !raceNo) return []

  const db = getDB()

  // ===== レース情報（グレード名・レース名） =====
  const raceInfo = db.prepare(`
    SELECT グレード名, グレード番号, レース名, サブタイトル, 締切時刻, 距離
    FROM レース情報
    WHERE 日付 = ? AND 会場番号 = ? AND レース番号 = ?
  `).get(date, stadiumNo, raceNo) as any || {}

  // ===== 出走表 =====
  const boats = db.prepare(`
    SELECT
      艇番, 選手名, 選手番号, 級別番号,
      年齢, 体重, F数, L数, 平均ST,
      全国1着率, 全国2着率, 全国3着率,
      当地1着率, 当地2着率, 当地3着率,
      モーター番号, モーター2着率,
      ボート番号, ボート2着率
    FROM 出走表
    WHERE 日付 = ? AND 会場番号 = ? AND レース番号 = ?
    ORDER BY 艇番
  `).all(date, stadiumNo, raceNo) as any[]

  if (boats.length === 0) return []

  // ===== 直前情報（展示タイム・コース・ST・体重調整・天候） =====
  const previews = db.prepare(`
    SELECT 艇番, コース番号, スタートST, 展示タイム, チルト調整,
           体重調整, 気温, 水温, 波高, 風速
    FROM 直前情報
    WHERE 日付 = ? AND 会場番号 = ? AND レース番号 = ?
  `).all(date, stadiumNo, raceNo) as any[]

  const previewMap: Record<number, any> = {}
  for (const p of previews) previewMap[p.艇番] = p

  // ===== 手動入力値をマージ（直前情報にない艇番の値を補完） =====
  const manualRows = db.prepare(`
    SELECT 艇番, 展示タイム, スタートST
    FROM 直前情報手動入力
    WHERE 日付 = ? AND 会場番号 = ? AND レース番号 = ?
  `).all(date, stadiumNo, raceNo) as any[]

  for (const m of manualRows) {
    if (!previewMap[m.艇番]) previewMap[m.艇番] = {}
    if (m.展示タイム != null && previewMap[m.艇番].展示タイム == null)
      previewMap[m.艇番].展示タイム = m.展示タイム
    if (m.スタートST != null && previewMap[m.艇番].スタートST == null)
      previewMap[m.艇番].スタートST = m.スタートST
  }

  // 展示タイムの最速を取得
  const validTimes = previews
    .filter(p => p.展示タイム != null && p.展示タイム > 0)
    .map(p => p.展示タイム as number)
  const fastestTime = validTimes.length > 0 ? Math.min(...validTimes) : null

  // ===== 今節成績（同会場・対象日より前のレース結果） =====
  const sessionResults = db.prepare(`
    SELECT 選手番号, 着順
    FROM レース結果
    WHERE 会場番号 = ? AND 日付 < ? AND 選手番号 IN (${boats.map(() => '?').join(',')})
    ORDER BY 日付
  `).all(stadiumNo, date, ...boats.map((b: any) => b.選手番号)) as any[]

  // 選手ごとの今節成績をまとめる
  const sessionMap: Record<number, number[]> = {}
  for (const sr of sessionResults) {
    if (!sessionMap[sr.選手番号]) sessionMap[sr.選手番号] = []
    if (sr.着順 != null) sessionMap[sr.選手番号].push(sr.着順)
  }

  // ===== 選手コース成績（CSVから取込済み）の取得 =====
  // レース日より前の最新期間データを取得
  const dateCompact = date.replace(/-/g, '')  // YYYYMMDD形式
  const playerNos = boats.map((b: any) => b.選手番号)
  const playerCourseStats = playerNos.length > 0
    ? db.prepare(`
        SELECT s.*
        FROM 選手コース成績 s
        INNER JOIN (
          SELECT 選手番号, MAX(算出期間_至) AS max_at
          FROM 選手コース成績
          WHERE 選手番号 IN (${playerNos.map(() => '?').join(',')})
            AND 算出期間_至 <= ?
          GROUP BY 選手番号
        ) latest ON s.選手番号 = latest.選手番号 AND s.算出期間_至 = latest.max_at
      `).all(...playerNos, dateCompact) as any[]
    : []

  const pcMap: Record<number, any> = {}
  for (const pc of playerCourseStats) pcMap[pc.選手番号] = pc

  // ===== 会場補正・気象データの準備 =====
  // 会場の1コース実績勝率（文献データ）
  const venue1Rate = VENUE_COURSE1_RATE[stadiumNo!] ?? COURSE_WIN_RATE[1]
  // 2〜6コースは「1コース以外」の残り分をスケーリング
  const course1Scale = (1 - venue1Rate) / (1 - COURSE_WIN_RATE[1])

  // 風速（直前情報から取得）
  const windSrc = previews.find((p: any) => p.風速 != null) || {} as any
  const windSpeed: number = windSrc.風速 ?? 0
  // 風速補正: 3m以上でイン不利・外コース有利、5m以上でさらに顕著
  const windBonus = (courseNo: number): number => {
    if (windSpeed < 3) return 0
    if (courseNo === 1) return -Math.min(windSpeed * 0.008, 0.06)   // 最大-6%
    if (courseNo >= 4)  return  Math.min(windSpeed * 0.004, 0.03)   // 最大+3%
    return 0
  }

  // ===== スコア算出 =====
  const rd = (v: number) => Math.round(v * 100) / 100

  const results = boats.map((b: any) => {
    const pre = previewMap[b.艇番] || {}
    const courseNo = pre.コース番号 ?? b.艇番 // 直前情報がなければ艇番=コース

    // --- コース補正（会場別勝率 + 風速補正） ---
    // 会場の特性を反映した実効コース勝率
    const venueAdjRate = courseNo === 1
      ? venue1Rate
      : (COURSE_WIN_RATE[courseNo] ?? 0.019) * course1Scale
    const courseScore = (venueAdjRate + windBonus(courseNo)) * W.course

    // --- 級別補正 ---
    const gradeNo: number = b.級別番号 ?? 3
    const gradeScore = (GRADE_WIN_RATE[gradeNo] ?? 0.1) * W.grade

    // --- 全国1着率（%値→小数） ---
    const natWin = (b['全国1着率'] ?? 0) / 100
    const natScore = natWin * W.nat_win

    // --- 当地1着率 ---
    const localWin = (b['当地1着率'] ?? 0) / 100
    const localScore = localWin * W.local_win

    // --- モーター2着率（重要: 40%超=A1級モーター） ---
    // シンプルな倍率方式（偏差ではなく絶対値）。全艇プラス評価でゼロ以下にならない
    const motorRate = (b.モーター2着率 ?? 0) / 100
    const motorScore = motorRate * W.motor

    // --- ボート2着率 ---
    const boatRate = (b.ボート2着率 ?? 0) / 100
    const boatScore = boatRate * W.boat

    // --- 平均ST（低いほど加点、基準0.20） ---
    // CSVのコース別STが使えれば優先（同コースでの実績STはより精確）
    const pc = pcMap[b.選手番号]
    const pcEntries: number = pc ? (pc[`c${courseNo}進入`] ?? 0) : 0
    const pcCourseST: number | null = (pc && pcEntries >= 5) ? pc[`c${courseNo}ST`] : null
    const avgST = pcCourseST ?? b.平均ST ?? 0.18
    const stScore = (0.20 - avgST) * W.st

    // --- コース適性（CSV由来: 選手のコース別複勝率、平均33%基準で偏差） ---
    let courseAptScore = 0
    if (pc && pcEntries >= 10) {
      const pcPlaceRate: number = (pc[`c${courseNo}複勝率`] ?? 0) / 100
      courseAptScore = (pcPlaceRate - 0.33) * W.course_apt
    }

    // --- 展示タイム（レース内で最速との差を評価） ---
    let timeScore = 0
    if (pre.展示タイム != null && pre.展示タイム > 0 && fastestTime != null) {
      timeScore = (fastestTime - pre.展示タイム) * W.exhibit_time
    }

    // --- チルト補正（高チルト=伸び足重視=外枠のまくり力向上） ---
    // チルト1.0度以上の外コース艇は最高速が高く「まくり」の脅威あり
    const tilt = pre.チルト調整 ?? 0
    const tiltBonus = (courseNo >= 4 && tilt >= 1.0) ? 1.5 : 0

    // --- Fペナルティ（F持ちはスタート控えめ傾向） ---
    const fPenalty = (b.F数 ?? 0) * W.f_penalty

    // --- 今節成績（同会場での直近着順平均、3.5が基準） ---
    let sessionScore = 0
    const sess = sessionMap[b.選手番号]
    if (sess && sess.length >= 1) {
      const avg = sess.reduce((a: number, b: number) => a + b, 0) / sess.length
      // レース数が少ないうちは信頼度を下げる
      const confidence = Math.min(sess.length / 3, 1)
      sessionScore = (3.5 - avg) * W.session * confidence
    }

    const score = courseScore + gradeScore + natScore + localScore +
                  motorScore + boatScore + stScore + timeScore -
                  fPenalty + sessionScore + tiltBonus + courseAptScore

    return {
      艇番:         b.艇番,
      選手名:       b.選手名,
      選手番号:     b.選手番号,
      級別:         GRADE_LABEL[gradeNo] || String(gradeNo),
      F数:          b.F数,
      平均ST:       b.平均ST,
      全国勝率:     b['全国1着率'],
      全国2着率:    b['全国2着率'],
      当地勝率:     b['当地1着率'],
      当地2着率:    b['当地2着率'],
      モーター番号: b.モーター番号,
      モーター2着率: b.モーター2着率,
      ボート番号:   b.ボート番号,
      ボート2着率:  b.ボート2着率,
      体重:         b.体重,
      コース番号:   courseNo,
      展示タイム:   pre.展示タイム ?? null,
      スタートST:   pre.スタートST ?? null,
      チルト調整:   pre.チルト調整 ?? null,
      体重調整:     pre.体重調整 ?? null,
      今節成績:     sess ? rd(sess.reduce((a: number, b: number) => a + b, 0) / sess.length) : null,
      今節着順リスト: sess ?? [],
      コース複勝率: (pc && pcEntries >= 10) ? rd((pc[`c${courseNo}複勝率`] ?? 0)) : null,
      コース別ST:   pcCourseST != null ? rd(pcCourseST) : null,
      今節レース数: sess ? sess.length : 0,
      score:        rd(score),
      scoreDetail: {
        コース点:    rd(courseScore),
        級別点:      rd(gradeScore),
        全国勝率点:  rd(natScore),
        当地勝率点:  rd(localScore),
        モーター点:  rd(motorScore),
        ボート点:    rd(boatScore),
        ST点:        rd(stScore),
        展示点:      rd(timeScore),
        Fペナルティ: rd(-fPenalty),
        今節点:      rd(sessionScore),
      },
    }
  })

  // スコア降順でランクを付ける
  const sorted = [...results].sort((a, b) => b.score - a.score)
  const rankMap: Record<number, number> = {}
  sorted.forEach((r, i) => { rankMap[r.艇番] = i + 1 })
  results.forEach(r => { (r as any).rank = rankMap[r.艇番] })

  // 天候情報（直前情報から取得）
  const weatherSrc = previews.find((p: any) => p.気温 != null) || {} as any
  const weather = {
    気温: weatherSrc.気温 ?? null,
    水温: weatherSrc.水温 ?? null,
    波高: weatherSrc.波高 ?? null,
    風速: weatherSrc.風速 ?? null,
  }

  // 単勝・複勝払い戻し（レース完了後のみ存在）
  const payoutRows = db.prepare(`
    SELECT 種別, 組み合わせ, 金額 FROM 払い戻し
    WHERE 日付 = ? AND 会場番号 = ? AND レース番号 = ?
    AND 種別 IN ('単勝', '複勝')
  `).all(date, stadiumNo, raceNo) as any[]

  // {単勝: {艇番: 金額}, 複勝: {艇番: 金額}}
  const payoutMap: Record<string, Record<string, number>> = {}
  for (const p of payoutRows) {
    if (!payoutMap[p.種別]) payoutMap[p.種別] = {}
    payoutMap[p.種別][p.組み合わせ] = p.金額
  }

  // 各艇に単勝・複勝を追加
  for (const r of results as any[]) {
    r.単勝払い戻し = payoutMap['単勝']?.[String(r.艇番)] ?? null
    r.複勝払い戻し = payoutMap['複勝']?.[String(r.艇番)] ?? null
  }

  // ===== 大穴分析 =====
  // 三連単払い戻しが1万円超えになりやすい条件を多角的にスコアリング
  const sortedForUpset = [...results].sort((a: any, b: any) => b.score - a.score)
  const top1 = sortedForUpset[0] as any
  const top2 = sortedForUpset[1] as any

  // コース別の艇を特定
  const course1Boat = results.find((r: any) => r.コース番号 === 1) as any
  const outerBoats  = results.filter((r: any) => r.コース番号 >= 4) as any[]

  const upsetFactors: string[] = []
  let upsetScore = 0
  const fs: Record<string, number> = { 風速: 0, 波高: 0, '1C級別': 0, 接戦度: 0, 外A1: 0, 展示逆転: 0, Fペナ: 0, 本命不調: 0 }

  // (1) 風速補正: 強風はイン不利・外有利
  if (windSpeed >= 7) {
    fs['風速'] = 25; upsetScore += 25
    upsetFactors.push(`強風${windSpeed}m：インコース大幅不利`)
  } else if (windSpeed >= 5) {
    fs['風速'] = 18; upsetScore += 18
    upsetFactors.push(`風速${windSpeed}m：外艇スピードアップ`)
  } else if (windSpeed >= 3) {
    fs['風速'] = 8; upsetScore += 8
    upsetFactors.push(`風速${windSpeed}m：やや荒れ方向`)
  }

  // (2) 波高補正: 荒水面は実力差が縮まる
  const waveHeight: number = weather.波高 ?? 0
  if (waveHeight >= 20) {
    fs['波高'] = 20; upsetScore += 20
    upsetFactors.push(`波高${waveHeight}cm：荒水面で展開読めない`)
  } else if (waveHeight >= 10) {
    fs['波高'] = 10; upsetScore += 10
    upsetFactors.push(`波高${waveHeight}cm：やや荒れた水面`)
  }

  // (3) 1コース艇の級別: B級だと逆転されやすい
  if (course1Boat) {
    if (course1Boat.級別 === 'B2') {
      fs['1C級別'] = 25; upsetScore += 25
      upsetFactors.push(`1Cが${course1Boat.選手名?.split(/\s+/)[0] ?? ''}(B2)：実力差で逆転されやすい`)
    } else if (course1Boat.級別 === 'B1') {
      fs['1C級別'] = 15; upsetScore += 15
      upsetFactors.push(`1Cが${course1Boat.選手名?.split(/\s+/)[0] ?? ''}(B1)：外上位に逆転の余地`)
    }
  }

  // (4) スコア接戦度: 上位が僅差なら予測困難
  const scoreDiff2 = top2 ? ((top1?.score ?? 0) - (top2?.score ?? 0)) : 10
  if (scoreDiff2 < 1) {
    fs['接戦度'] = 20; upsetScore += 20
    upsetFactors.push(`上位が大接戦(${scoreDiff2.toFixed(1)}pt差)：誰でも来れる`)
  } else if (scoreDiff2 < 2.5) {
    fs['接戦度'] = 12; upsetScore += 12
    upsetFactors.push(`上位が接戦(${scoreDiff2.toFixed(1)}pt差)：波乱の余地あり`)
  }

  // (5) 外コース(4〜6)にA1選手: 捲り・差しの脅威
  const outerA1 = outerBoats.filter((b: any) => b.級別 === 'A1')
  if (outerA1.length >= 2) {
    fs['外A1'] = 18; upsetScore += 18
    upsetFactors.push(`外コースにA1が${outerA1.length}人：大捲りの脅威`)
  } else if (outerA1.length === 1) {
    fs['外A1'] = 10; upsetScore += 10
    upsetFactors.push(`${outerA1[0].コース番号}CにA1選手：捲り注意`)
  }

  // (6) 展示タイム逆転: 外が内より速い
  const prevsWithTime = previews.filter((p: any) => p.展示タイム != null && p.展示タイム > 0)
  if (prevsWithTime.length > 0 && fastestTime != null) {
    const fastestPrev = prevsWithTime.slice().sort((a: any, b: any) => a.展示タイム - b.展示タイム)[0]
    const fastestCourse: number = fastestPrev?.コース番号 ?? 0
    if (fastestCourse >= 4) {
      fs['展示逆転'] = 12; upsetScore += 12
      upsetFactors.push(`${fastestCourse}Cが展示最速：直線スピードで逆転可能`)
    }
  }

  // (7) 1コース艇にFペナルティ: スタート慎重→出遅れリスク
  if (course1Boat && (course1Boat.F数 ?? 0) >= 1) {
    fs['Fペナ'] = 15; upsetScore += 15
    upsetFactors.push(`1CにF持ち(${course1Boat.F数}F)：スタート出遅れリスク`)
  }

  // (8) 本命選手の今節不調
  if (top1 && (top1.今節レース数 ?? 0) >= 2 && top1.今節成績 != null && top1.今節成績 > 4.0) {
    fs['本命不調'] = 10; upsetScore += 10
    upsetFactors.push(`本命が今節不調(平均${top1.今節成績}着)：信頼度低下`)
  }

  upsetScore = Math.min(upsetScore, 100)

  const upsetLevel =
    upsetScore >= 70 ? '大穴警戒' :
    upsetScore >= 50 ? '波乱含み' :
    upsetScore >= 30 ? 'やや荒れ' : '本命堅い'

  // 大穴推奨買い目（外コース有力選手を軸に・重複しないよう除外）
  let upsetPick = ''
  if (upsetScore >= 50 && outerBoats.length > 0) {
    const outerTop = outerBoats.slice().sort((a: any, b: any) => b.score - a.score)[0]
    if (outerTop) {
      const axisNo = outerTop.艇番
      const rest = sortedForUpset.filter((b: any) => b.艇番 !== axisNo)
      if (rest.length >= 2) {
        upsetPick = `${axisNo}→${rest[0].艇番}→${rest[1].艇番}`
      }
    }
  }

  const upsetAnalysis = { score: upsetScore, level: upsetLevel, factors: upsetFactors, pick: upsetPick, factorScores: fs }

  return { weather, boats: results, raceInfo, upsetAnalysis }
})
