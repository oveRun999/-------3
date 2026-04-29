// POST /api/fetch-preview
// body: { date: "2026-04-20", stadium: 4, raceNo: 7 }
// boatraceopenapi.github.io の previews JSON から直前情報を取得して DB に保存
import { getDB } from '~/server/utils/db'

const VENUES: Record<number, string> = {
  1:'桐生', 2:'戸田',  3:'江戸川', 4:'平和島',  5:'多摩川', 6:'浜名湖',
  7:'蒲郡', 8:'常滑',  9:'津',    10:'三国',   11:'びわこ',12:'住之江',
 13:'尼崎',14:'鳴門', 15:'丸亀', 16:'児島',   17:'宮島',  18:'徳山',
 19:'下関',20:'若松', 21:'芦屋', 22:'福岡',   23:'唐津',  24:'大村',
}

export default defineEventHandler(async (event) => {
  const body     = await readBody(event)
  const date:    string = body.date      // "2026-04-20"
  const stadium: number = Number(body.stadium)
  const raceNo:  number = Number(body.raceNo)

  if (!date || !stadium || !raceNo) {
    throw createError({ statusCode: 400, message: 'date / stadium / raceNo は必須です' })
  }

  const ymd = date.replace(/-/g, '')    // "20260420"
  const yyyy = ymd.slice(0, 4)          // "2026"
  const url = `https://boatraceopenapi.github.io/previews/v3/${yyyy}/${ymd}.json`

  // ---- JSON 取得 ----
  let json: any
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (res.status === 404) {
      return { found: false, message: 'このレースの直前情報はまだ公開されていません' }
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    json = await res.json()
  } catch (e: any) {
    if (e.message?.includes('404')) {
      return { found: false, message: 'このレースの直前情報はまだ公開されていません' }
    }
    throw createError({ statusCode: 502, message: `データ取得に失敗しました: ${e.message}` })
  }

  // ---- 対象レースを検索 ----
  const previews: any[] = json.previews ?? []
  const target = previews.find(
    (p: any) => p.stadium_number === stadium && p.number === raceNo
  )

  if (!target) {
    return { found: false, message: 'このレースの直前情報はまだ公開されていません' }
  }

  // ---- DB に保存 ----
  const db        = getDB()
  const venueName = VENUES[stadium] ?? String(stadium)

  const boats: Record<string, any> = target.boats ?? {}
  const boatsIter = typeof boats === 'object' && !Array.isArray(boats)
    ? Object.values(boats)
    : boats as any[]

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO 直前情報
      (日付, 会場番号, 会場名, レース番号,
       風速, 風向き番号, 波高, 天候番号, 気温, 水温,
       艇番, コース番号, スタートST,
       体重, 体重調整, 展示タイム, チルト調整)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `)

  const saved: { 艇番: number; 展示タイム: number | null; スタートST: number | null }[] = []

  for (const b of boatsIter) {
    const exhibitTime = b.racer_exhibition_time ?? null
    const courseNo    = b.racer_course_number   ?? null
    if (!exhibitTime && !courseNo) continue  // 未実施プレースホルダーはスキップ

    stmt.run(
      date, stadium, venueName, raceNo,
      target.wind_speed        ?? null,
      target.wind_direction_number ?? null,
      target.wave_height       ?? null,
      target.weather_number    ?? null,
      target.air_temperature   ?? null,
      target.water_temperature ?? null,
      b.racer_boat_number,
      courseNo,
      b.racer_start_timing     ?? null,
      b.racer_weight           ?? null,
      b.racer_weight_adjustment ?? null,
      exhibitTime,
      b.racer_tilt_adjustment  ?? null,
    )
    saved.push({ 艇番: b.racer_boat_number, 展示タイム: exhibitTime, スタートST: b.racer_start_timing ?? null })
  }

  if (saved.length === 0) {
    return { found: false, message: 'このレースの直前情報はまだ公開されていません' }
  }

  return { found: true, boats: saved, count: saved.length, url }
})
