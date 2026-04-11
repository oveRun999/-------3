// GET /api/predict-history?date=2026-03-31&stadium=2
// 指定日・会場の全レースについて「予想」と「実際の着順」を並べて返す
import { getDB, todayStr } from "~/server/utils/db";

// ===== スコアリング v3（predict.get.ts と同一ロジック） =====
const COURSE_WIN_RATE: Record<number, number> = {
  1: 0.559,
  2: 0.142,
  3: 0.128,
  4: 0.098,
  5: 0.054,
  6: 0.019,
};
const VENUE_COURSE1_RATE: Record<number, number> = {
  1: 0.555,
  2: 0.438,
  3: 0.48,
  4: 0.475,
  5: 0.53,
  6: 0.545,
  7: 0.545,
  8: 0.55,
  9: 0.555,
  10: 0.545,
  11: 0.545,
  12: 0.56,
  13: 0.55,
  14: 0.555,
  15: 0.55,
  16: 0.545,
  17: 0.545,
  18: 0.63,
  19: 0.605,
  20: 0.545,
  21: 0.612,
  22: 0.55,
  23: 0.55,
  24: 0.627,
};
const GRADE_WIN_RATE: Record<number, number> = {
  1: 0.27,
  2: 0.179,
  3: 0.103,
  4: 0.048,
};
const GRADE_LABEL: Record<number, string> = {
  1: "A1",
  2: "A2",
  3: "B1",
  4: "B2",
};
const W = {
  course: 28,
  grade: 18,
  nat_win: 12,
  local_win: 6,
  motor: 4.0,
  boat: 2.0,
  st: 25,
  exhibit_time: 20,
  f_penalty: 1.5,
  session: 2.0,
  course_apt: 8,
  course_st: 4,
};

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const date = (query.date as string) || todayStr();
  let stadiumNo = query.stadium ? Number(query.stadium) : null;

  // 0/undefined は全会場扱い
  if (stadiumNo === 0) stadiumNo = null;

  const db = getDB();
  const stadiumCond = stadiumNo != null ? "AND 会場番号 = ?" : "";
  const stadiumParams: any[] = stadiumNo != null ? [stadiumNo] : [];

  // ===== レース情報（グレード名・レース名 一括取得） =====
  const allRaceInfo = db
    .prepare(
      `
    SELECT 会場番号, レース番号, グレード名, グレード番号, レース名, サブタイトル
    FROM レース情報
    WHERE 日付 = ? ${stadiumCond}
    ORDER BY 会場番号, レース番号
  `,
    )
    .all(date, ...stadiumParams) as any[];

  // ===== 出走表（全レース一括取得） =====
  const allBoats = db
    .prepare(
      `
    SELECT 会場番号, 会場名, 艇番, 選手名, 選手番号, 級別番号, F数, 平均ST,
           全国1着率, 当地1着率, モーター2着率, ボート2着率, レース番号
    FROM 出走表
    WHERE 日付 = ? ${stadiumCond}
    ORDER BY 会場番号, レース番号, 艇番
  `,
    )
    .all(date, ...stadiumParams) as any[];

  if (allBoats.length === 0) return [];

  // ===== 直前情報（全レース一括取得） =====
  const allPreviews = db
    .prepare(
      `
    SELECT 会場番号, 艇番, レース番号, コース番号, 展示タイム, スタートST
    FROM 直前情報
    WHERE 日付 = ? ${stadiumCond}
  `,
    )
    .all(date, ...stadiumParams) as any[];

  // ===== 実際のレース結果（全レース一括取得） =====
  const allResults = db
    .prepare(
      `
    SELECT 会場番号, 艇番, レース番号, 着順, コース番号 AS 結果コース番号,
           スタートST, 選手名, 気温, 水温, 波高, 風速
    FROM レース結果
    WHERE 日付 = ? ${stadiumCond}
  `,
    )
    .all(date, ...stadiumParams) as any[];

  // ===== 払い戻し（全レース一括取得） =====
  const allPayouts = db
    .prepare(
      `
    SELECT 会場番号, レース番号, 種別, 組み合わせ, 金額
    FROM 払い戻し
    WHERE 日付 = ? ${stadiumCond}
    ORDER BY 会場番号, レース番号,
      CASE 種別
        WHEN '三連単' THEN 1 WHEN '三連複' THEN 2 WHEN '二連単' THEN 3
        WHEN '二連複' THEN 4 WHEN '拡連複' THEN 5 WHEN '単勝'  THEN 6
        ELSE 7 END
  `,
    )
    .all(date, ...stadiumParams) as any[];

  // ===== 今節成績（同会場・前日まで） =====
  const playerNos = [...new Set(allBoats.map((b: any) => b.選手番号))];
  const sessionResults =
    playerNos.length > 0
      ? (db
          .prepare(
            `
        SELECT 選手番号, 着順
        FROM レース結果
        WHERE 会場番号 = ? AND 日付 < ?
          AND 選手番号 IN (${playerNos.map(() => "?").join(",")})
      `,
          )
          .all(stadiumNo, date, ...playerNos) as any[])
      : [];

  const sessionMap: Record<number, number[]> = {};
  for (const sr of sessionResults) {
    if (!sessionMap[sr.選手番号]) sessionMap[sr.選手番号] = [];
    if (sr.着順 != null) sessionMap[sr.選手番号].push(sr.着順);
  }

  // ===== 選手コース成績（CSVから取込済み）の取得 =====
  const dateCompact = date.replace(/-/g, "");
  const allPlayerCourseStats =
    playerNos.length > 0
      ? (db
          .prepare(
            `
        SELECT s.*
        FROM 選手コース成績 s
        INNER JOIN (
          SELECT 選手番号, MAX(算出期間_至) AS max_at
          FROM 選手コース成績
          WHERE 選手番号 IN (${playerNos.map(() => "?").join(",")})
            AND 算出期間_至 <= ?
          GROUP BY 選手番号
        ) latest ON s.選手番号 = latest.選手番号 AND s.算出期間_至 = latest.max_at
      `,
          )
          .all(...playerNos, dateCompact) as any[])
      : [];

  const pcMap: Record<number, any> = {};
  for (const pc of allPlayerCourseStats) pcMap[pc.選手番号] = pc;

  // ===== レース番号ごとにグループ化（会場別含む） =====
  const raceKeys = [
    ...new Set(allBoats.map((b: any) => `${b.会場番号}-${b.レース番号}`)),
  ].sort((a, b) => {
    const [aVenue, aRace] = a.split("-").map(Number);
    const [bVenue, bRace] = b.split("-").map(Number);
    return aVenue !== bVenue ? aVenue - bVenue : aRace - bRace;
  });

  const raceInfoMap: Record<string, any> = {};
  for (const ri of allRaceInfo) {
    raceInfoMap[`${ri.会場番号}-${ri.レース番号}`] = ri;
  }

  const races = raceKeys
    .map((raceKey: string) => {
      const [venueNo, raceNo] = raceKey.split("-").map(Number);
      const boats = allBoats.filter(
        (b: any) => b.会場番号 === venueNo && b.レース番号 === raceNo,
      );
      if (boats.length === 0) return null;

      const venueName = boats[0].会場名 || "";
      const prevMap: Record<number, any> = {};
      for (const p of allPreviews.filter(
        (p: any) => p.会場番号 === venueNo && p.レース番号 === raceNo,
      )) {
        prevMap[p.艇番] = p;
      }
      const resMap: Record<number, any> = {};
      let weather: any = {};
      for (const r of allResults.filter(
        (r: any) => r.会場番号 === venueNo && r.レース番号 === raceNo,
      )) {
        resMap[r.艇番] = r;
        if (!weather.気温 && r.気温)
          weather = { 気温: r.気温, 水温: r.水温, 波高: r.波高, 風速: r.風速 };
      }

      // 結果がないレースはスキップ
      if (Object.keys(resMap).length === 0) return null;

      // 実際の着順リスト（着順順）
      const actualBoats = Object.values(resMap)
        .filter((r: any) => r.着順)
        .sort((a: any, b: any) => a.着順 - b.着順)
        .map((r: any) => ({
          着順: r.着順,
          艇番: r.艇番,
          選手名: r.選手名,
          コース番号: r.結果コース番号,
          スタートST: r.スタートST,
        }));

      // 払い戻しリスト（会場 + レースでフィルタ）
      const payouts = allPayouts
        .filter((p: any) => p.会場番号 === venueNo && p.レース番号 === raceNo)
        .map((p: any) => ({
          種別: p.種別,
          組み合わせ: p.組み合わせ,
          金額: p.金額,
        }));

      // 展示タイムの最速
      const times = Object.values(prevMap)
        .filter((p: any) => p.展示タイム != null && p.展示タイム > 0)
        .map((p: any) => p.展示タイム as number);
      const fastestTime = times.length > 0 ? Math.min(...times) : null;

      // 会場補正・風速補正
      const venue1Rate = VENUE_COURSE1_RATE[venueNo] ?? COURSE_WIN_RATE[1];
      const course1Scale = (1 - venue1Rate) / (1 - COURSE_WIN_RATE[1]);
      const windSpeed: number = weather.風速 ?? 0;
      const windBonus = (courseNo: number): number => {
        if (windSpeed < 3) return 0;
        if (courseNo === 1) return -Math.min(windSpeed * 0.008, 0.06);
        if (courseNo >= 4) return Math.min(windSpeed * 0.004, 0.03);
        return 0;
      };

      // スコア算出
      const rd = (v: number) => Math.round(v * 100) / 100;
      const scored = boats.map((b: any) => {
        const pre = prevMap[b.艇番] || {};
        const res = resMap[b.艇番] || {};
        const courseNo = pre.コース番号 ?? res.結果コース番号 ?? b.艇番;

        // 会場別勝率 + 風速補正
        const venueAdjRate =
          courseNo === 1
            ? venue1Rate
            : (COURSE_WIN_RATE[courseNo] ?? 0.019) * course1Scale;
        const courseScore = (venueAdjRate + windBonus(courseNo)) * W.course;
        const gradeScore = (GRADE_WIN_RATE[b.級別番号 ?? 3] ?? 0.1) * W.grade;
        const natScore = ((b["全国1着率"] ?? 0) / 100) * W.nat_win;
        const localScore = ((b["当地1着率"] ?? 0) / 100) * W.local_win;
        const motorScore = ((b.モーター2着率 ?? 0) / 100) * W.motor;
        const boatScore = ((b.ボート2着率 ?? 0) / 100) * W.boat;

        // CSV由来: コース別STと適性
        const pc = pcMap[b.選手番号];
        const pcEntries: number = pc ? (pc[`c${courseNo}進入`] ?? 0) : 0;
        const pcCourseST: number | null =
          pc && pcEntries >= 5 ? pc[`c${courseNo}ST`] : null;
        const avgST = pcCourseST ?? b.平均ST ?? 0.18;
        const stScore = (0.2 - avgST) * W.st;

        let courseAptScore = 0;
        if (pc && pcEntries >= 10) {
          const pcPlaceRate: number = (pc[`c${courseNo}複勝率`] ?? 0) / 100;
          courseAptScore = (pcPlaceRate - 0.33) * W.course_apt;
        }
        const fPenalty = (b.F数 ?? 0) * W.f_penalty;
        const tilt = pre.チルト調整 ?? 0;
        const tiltBonus = courseNo >= 4 && tilt >= 1.0 ? 1.5 : 0;

        let timeScore = 0;
        if (
          pre.展示タイム != null &&
          pre.展示タイム > 0 &&
          fastestTime != null
        ) {
          timeScore = (fastestTime - pre.展示タイム) * W.exhibit_time;
        }

        let sessionScore = 0;
        const sess = sessionMap[b.選手番号];
        if (sess && sess.length >= 1) {
          const avg =
            sess.reduce((a: number, c: number) => a + c, 0) / sess.length;
          const conf = Math.min(sess.length / 3, 1);
          sessionScore = (3.5 - avg) * W.session * conf;
        }

        const score =
          courseScore +
          gradeScore +
          natScore +
          localScore +
          motorScore +
          boatScore +
          stScore +
          timeScore +
          tiltBonus -
          fPenalty +
          sessionScore +
          courseAptScore;

        return {
          艇番: b.艇番,
          選手名: b.選手名,
          級別: GRADE_LABEL[b.級別番号] || String(b.級別番号),
          コース番号: courseNo,
          展示タイム: pre.展示タイム ?? null,
          平均ST: b.平均ST,
          score: rd(score),
          実際の着順: res.着順 ?? null,
        };
      });

      // スコア降順にソートして予想順位を付ける
      const sortedByScore = [...scored].sort((a, b) => b.score - a.score);
      sortedByScore.forEach((b, i) => {
        b.予想順位 = i + 1;
      });

      // 的中判定
      const top3Predicted = new Set(
        sortedByScore.slice(0, 3).map((b) => b.艇番),
      );
      const top3Actual = new Set(
        scored
          .filter((b) => b.実際の着順 != null && b.実際の着順 <= 3)
          .map((b) => b.艇番),
      );
      const top3Match = [...top3Predicted].filter((x) =>
        top3Actual.has(x),
      ).length;

      const win1st = sortedByScore[0]?.実際の着順 === 1; // 1着的中
      const hasPreview = Object.keys(prevMap).length > 0; // 直前情報あり

      const predictedTrifecta = sortedByScore
        .slice(0, 3)
        .map((b: any) => b.艇番)
        .join("-");
      const actualTrifecta = actualBoats
        .slice(0, 3)
        .map((b: any) => b.艇番)
        .join("-");
      const trifectaHit =
        predictedTrifecta &&
        actualTrifecta &&
        predictedTrifecta === actualTrifecta;

      const ri = raceInfoMap[raceKey] || {};
      return {
        会場番号: venueNo,
        会場名: venueName,
        raceNo,
        グレード名: ri.グレード名 ?? null,
        グレード番号: ri.グレード番号 ?? null,
        レース名: ri.レース名 ?? null,
        サブタイトル: ri.サブタイトル ?? null,
        hasPreview,
        win1st,
        top3Match,
        top3Perfect: top3Match === 3,
        trifectaHit,
        predictedTrifecta,
        actualTrifecta,
        boats: scored.sort((a, b) => a.艇番 - b.艇番), // 艇番順で返す
        weather,
        actualBoats,
        payouts,
      };
    })
    .filter(Boolean);

  // ===== サマリー集計 =====
  const total = races.length;
  const win1stCount = races.filter((r: any) => r.win1st).length;
  const top3Perfect = races.filter((r: any) => r.top3Perfect).length;
  const top3MatchSum = races.reduce((s: number, r: any) => s + r.top3Match, 0);

  return {
    date,
    stadiumNo,
    summary: {
      total,
      win1stRate: total > 0 ? Math.round((win1stCount / total) * 1000) / 10 : 0,
      top3PerfectRate:
        total > 0 ? Math.round((top3Perfect / total) * 1000) / 10 : 0,
      top3AvgMatch:
        total > 0 ? Math.round((top3MatchSum / total) * 10) / 10 : 0,
    },
    races,
  };
});
