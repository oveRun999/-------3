// 全ページで日付を共有するコンポーザブル
// useState は Nuxt 全体でシングルトンなので、ページ遷移しても値が維持される

const DAY_JA = ['日', '月', '火', '水', '木', '金', '土']

const todayStr = () => new Date().toISOString().slice(0, 10)

export const useSharedDate = () => {
  // useState でアプリ全体に共有（初期値は今日）
  const selectedDate = useState<string>('sharedDate', () => todayStr())

  // 曜日（"月" "火" など）
  const dayOfWeek = computed(() => {
    if (!selectedDate.value) return ''
    const d = new Date(selectedDate.value + 'T00:00:00')
    return DAY_JA[d.getDay()]
  })

  // 土日かどうか（赤・青で表示するため）
  const isWeekend = computed(() => {
    const d = new Date(selectedDate.value + 'T00:00:00')
    const day = d.getDay()
    return day === 0 || day === 6  // 0=日, 6=土
  })

  const isSunday = computed(() => {
    return new Date(selectedDate.value + 'T00:00:00').getDay() === 0
  })

  return { selectedDate, dayOfWeek, isWeekend, isSunday }
}
