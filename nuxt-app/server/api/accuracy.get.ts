// GET /api/accuracy?years=5
// 会場別の予想的中率を集計して返す（期間指定可）
import { getDB } from "~/server/utils/db";

const COURSE_WIN_RATE: Record<number, number> = {
  1: 0.465,
  2: 0.164,
  3: 0.139,
  4: 0.12,
  5: 0.075,
  6: 0.052,
};
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
};
const GRADE_WIN_RATE: Record<number, number> = {
  1: 0.27,
  2: 0.179,
  3: 0.103,
  4: 0.048,
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
};

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const years = Math.min(Number(query.years) || 1, 2);

  const db = getDB();

  // 対象期間の開始日（最大2年、デフォルト1年）
  const startYear = new Date().getFullYear() - years + 1;
  const startDate = `${startYear}-01-01`;

  // DBの実際のデータ範囲を取得
  const dateRange = db
    .prepare(
      `
    SELECT MIN(日付) AS minDate, MAX(日付) AS maxDate FROM レース結果 WHERE 着順 IS NOT NULL
  `,
    )
    .get() as { minDate: string; maxDate: string };

  // 結果がある (日付, 会場番号) ペアを一括取得（レース結果に会場名カラムはない）
  const datePairs = db
    .prepare(
      `
    SELECT DISTINCT 日付, 会場番号
    FROM レース結果
    WHERE 日付 >= ? AND 着順 IS NOT NULL
    ORDER BY 日付, 会場番号
  `,
    )
    .all(startDate) as { 日付: string; 会場番号: number }[];

  if (datePairs.length === 0)
    return {
      years,
      startDate,
      actualMinDate: dateRange?.minDate ?? null,
      actualMaxDate: dateRange?.maxDate ?? null,
      result: [],
    };

  // 会場名マップ（出走表から取得）
  const venueNames = db
    .prepare(
      `
    SELECT DISTINCT 会場番号, 会場名
    FROM 出走表
    WHERE 日付 >= ?
  `,
    )
    .all(startDate) as { 会場番号: number; 会場名: string }[];
  const venueNameMap: Record<number, string> = {};
  for (const v of venueNames) venueNameMap[v.会場番号] = v.会場名;

  // 全出走表・直前情報・レース結果をまとめて取得
  const allBoats = db
    .prepare(
      `
    SELECT 会場番号, レース番号, 日付, 艇番, 級別番号, F数, 平均ST,
           全国1着率, 当地1着率, モーター2着率, ボート2着率
    FROM 出走表
    WHERE 日付 >= ?
  `,
    )
    .all(startDate) as any[];

  const allPreviews = db
    .prepare(
      `
    SELECT 会場番号, レース番号, 日付, 艇番, コース番号, 展示タイム
    FROM 直前情報
    WHERE 日付 >= ?
  `,
    )
    .all(startDate) as any[];

  const allResults = db
    .prepare(
      `
    SELECT 会場番号, レース番号, 日付, 艇番, 着順, コース番号 AS 結果コース番号, 風速
    FROM レース結果
    WHERE 日付 >= ? AND 着順 IS NOT NULL
  `,
    )
    .all(startDate) as any[];

  // インデックス化: key = `日付|会場番号|レース番号|艇番`（| で区切る。- は日付内にも含まれるため不可）
  const boatIdx: Record<string, any> = {};
  for (const b of allBoats) {
    boatIdx[`${b.日付}|${b.会場番号}|${b.レース番号}|${b.艇番}`] = b;
  }
  const previewIdx: Record<string, any> = {};
  for (const p of allPreviews) {
    previewIdx[`${p.日付}|${p.会場番号}|${p.レース番号}|${p.艇番}`] = p;
  }

  // レース結果をグループ化: `日付|会場番号|レース番号` → 艇番→結果
  const raceResultMap: Record<string, Record<number, any>> = {};
  for (const r of allResults) {
    const key = `${r.日付}|${r.会場番号}|${r.レース番号}`;
    if (!raceResultMap[key]) raceResultMap[key] = {};
    raceResultMap[key][r.艇番] = r;
  }

  // 会場別集計バッファ
  const venueStats: Record<
    number,
    {
      total: number;
      top1: number;
      top3_partial: number; // TOP3 1艇以上的中
      top3_2: number; // TOP3 2艇的中
      top3_perfect: number; // TOP3 3艇的中
      trifecta: number; // 三連単完全一致
      years: Set<number>;
    }
  > = {};

  for (const { 日付: date, 会場番号: venueNo } of datePairs) {
    const venue1Rate = VENUE_COURSE1_RATE[venueNo] ?? COURSE_WIN_RATE[1];
    const course1Scale = (1 - venue1Rate) / (1 - COURSE_WIN_RATE[1]);

    // この日・会場のレース番号一覧
    const raceNos = new Set<number>();
    for (const key of Object.keys(raceResultMap)) {
      const [kDate, kVenue, kRace] = key.split("|");
      if (kDate === date && Number(kVenue) === venueNo)
        raceNos.add(Number(kRace));
    }

    if (!venueStats[venueNo]) {
      venueStats[venueNo] = {
        total: 0,
        top1: 0,
        top3_partial: 0,
        top3_2: 0,
        top3_perfect: 0,
        trifecta: 0,
        years: new Set(),
      };
    }
    venueStats[venueNo].years.add(Number(date.slice(0, 4)));

    for (const raceNo of raceNos) {
      const raceKey = `${date}|${venueNo}|${raceNo}`;
      const resMap = raceResultMap[raceKey] ?? {};
      const boatNos = Object.keys(resMap).map(Number);
      if (boatNos.length === 0) continue;

      // 展示タイム最速
      const times = boatNos
        .map(
          (bn) => previewIdx[`${date}|${venueNo}|${raceNo}|${bn}`]?.展示タイム,
        )
        .filter((t): t is number => t != null && t > 0);
      const fastestTime = times.length > 0 ? Math.min(...times) : null;

      // 風速（最初の艇から取得）
      const windSpeed: number = resMap[boatNos[0]]?.風速 ?? 0;
      const windBonus = (courseNo: number): number => {
        if (windSpeed < 3) return 0;
        if (courseNo === 1) return -Math.min(windSpeed * 0.008, 0.06);
        if (courseNo >= 4) return Math.min(windSpeed * 0.004, 0.03);
        return 0;
      };

      // スコア算出
      const scored = boatNos.map((bn) => {
        const b = boatIdx[`${date}|${venueNo}|${raceNo}|${bn}`] ?? {};
        const pre = previewIdx[`${date}|${venueNo}|${raceNo}|${bn}`] ?? {};
        const res = resMap[bn];

        const courseNo = pre.コース番号 ?? res?.結果コース番号 ?? bn;
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
        const stScore = (0.2 - (b.平均ST ?? 0.18)) * W.st;
        const fPenalty = (b.F数 ?? 0) * W.f_penalty;
        let timeScore = 0;
        if (
          pre.展示タイム != null &&
          pre.展示タイム > 0 &&
          fastestTime != null
        ) {
          timeScore = (fastestTime - pre.展示タイム) * W.exhibit_time;
        }
        const score =
          courseScore +
          gradeScore +
          natScore +
          localScore +
          motorScore +
          boatScore +
          stScore +
          timeScore -
          fPenalty;

        return { bn, score, 着順: res?.着順 ?? null };
      });

      const sortedByScore = [...scored].sort((a, b) => b.score - a.score);
      const top3Predicted = sortedByScore.slice(0, 3).map((b) => b.bn);
      const top3Actual = scored
        .filter((b) => b.着順 != null && b.着順 <= 3)
        .map((b) => b.bn);
      const matchCount = top3Predicted.filter((bn) =>
        top3Actual.includes(bn),
      ).length;

      const actualTop3Ordered = scored
        .filter((b) => b.着順 != null && b.着順 <= 3)
        .sort((a, b) => a.着順! - b.着順!)
        .map((b) => b.bn);
      const trifectaHit =
        top3Predicted.join("-") === actualTop3Ordered.join("-");

      venueStats[venueNo].total++;
      if (sortedByScore[0]?.着順 === 1) venueStats[venueNo].top1++;
      if (matchCount >= 1) venueStats[venueNo].top3_partial++;
      if (matchCount >= 2) venueStats[venueNo].top3_2++;
      if (matchCount === 3) venueStats[venueNo].top3_perfect++;
      if (trifectaHit) venueStats[venueNo].trifecta++;
    }
  }

  // 結果整形
  const result = Object.entries(venueStats)
    .filter(([, s]) => s.total > 0)
    .map(([venueNoStr, s]) => {
      const venueNo = Number(venueNoStr);
      const t = s.total;
      return {
        会場番号: venueNo,
        会場名: venueNameMap[venueNo] ?? `会場${venueNo}`,
        総レース数: t,
        対象年数: s.years.size,
        TOP1的中率: t > 0 ? Math.round((s.top1 / t) * 1000) / 10 : 0,
        TOP3部分的中: t > 0 ? Math.round((s.top3_partial / t) * 1000) / 10 : 0,
        TOP3_2艇: t > 0 ? Math.round((s.top3_2 / t) * 1000) / 10 : 0,
        三連複: t > 0 ? Math.round((s.top3_perfect / t) * 1000) / 10 : 0,
        三連単的中率: t > 0 ? Math.round((s.trifecta / t) * 1000) / 10 : 0,
      };
    });

  return {
    years,
    startDate,
    actualMinDate: dateRange?.minDate ?? null,
    actualMaxDate: dateRange?.maxDate ?? null,
    result,
  };
});