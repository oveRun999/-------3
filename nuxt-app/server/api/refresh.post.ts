// POST /api/refresh
// fetch_from_openapi.py を実行してデータを更新する
// body: { startDate?: "YYYYMMDD", endDate?: "YYYYMMDD" }
//   両方省略 → 今日のみ
//   startDate のみ → その日のみ
//   両方指定  → 範囲取得
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const { startDate, endDate } = body ?? {}

  // nuxt-app の親ディレクトリ（競艇予想アプリ3/）にスクリプトがある
  const scriptDir  = path.resolve(process.cwd(), '..')
  const scriptPath = path.join(scriptDir, 'fetch_from_openapi.py')

  // 引数を組み立て（デフォルトは今日〜明日）
  let args = ''
  if (startDate && endDate)   args = `${startDate} ${endDate}`
  else if (startDate)         args = startDate
  else {
    // 引数なし → 今日〜明日
    const today    = new Date()
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')
    args = `${fmt(today)} ${fmt(tomorrow)}`
  }

  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'
  const cmd = `${pythonCmd} "${scriptPath}" ${args}`.trim()

  try {
    const { stdout, stderr } = await execAsync(
      cmd,
      { cwd: scriptDir, timeout: 300_000 } // 最大5分（複数日対応）
    )
    const lines = (stdout + stderr).split('\n')
    const summary = lines.find(l => l.includes('完了:')) || ''
    const dbLine  = lines.filter(l => l.includes('件')).slice(-5).join(' / ')
    return {
      success: true,
      summary: summary.trim(),
      detail:  dbLine.trim(),
    }
  } catch (e: any) {
    return {
      success: false,
      error: e.message?.slice(0, 200) ?? '不明なエラー',
    }
  }
})
