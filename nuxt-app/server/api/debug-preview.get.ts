// GET /api/debug-preview?date=2026-04-20&stadium=4&raceNo=7
export default defineEventHandler(async (event) => {
  const q      = getQuery(event)
  const date   = (q.date as string).replace(/-/g, '')
  const jcd    = String(q.stadium).padStart(2, '0')
  const raceNo = q.raceNo
  const url    = `https://boatrace.jp/owpc/pc/race/beforeinfo?hd=${date}&jcd=${jcd}&rno=${raceNo}`

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
    'Referer': 'https://boatrace.jp/',
  }

  const res  = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
  const html = await res.text()

  // 全文を返す（構造確認用）
  return {
    url,
    status: res.status,
    totalLength: html.length,
    // body タグの中身だけ抽出
    body: (() => {
      const s = html.indexOf('<body')
      const e = html.indexOf('</body>')
      return s >= 0 ? html.slice(s, e > s ? e + 7 : s + 8000) : html
    })(),
  }
})
