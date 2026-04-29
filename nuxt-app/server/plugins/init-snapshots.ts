// Nuxt サーバー起動時に今日・明日のスナップショットを自動生成
import { saveSnapshotsForDate } from '~/server/utils/snapshotAll'

export default defineNitroPlugin(() => {
  // 起動直後は DB の準備が整っているので同期実行
  try {
    const today    = new Date()
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)

    const r1 = saveSnapshotsForDate(fmt(today))
    const r2 = saveSnapshotsForDate(fmt(tomorrow))

    console.log(`[init-snapshots] 今日(${fmt(today)}): ${r1.saved}件保存 / 明日(${fmt(tomorrow)}): ${r2.saved}件保存`)
  } catch (e) {
    console.warn('[init-snapshots] スナップショット生成失敗:', e)
  }
})
