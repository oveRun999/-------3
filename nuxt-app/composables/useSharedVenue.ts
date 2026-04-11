// 全ページで会場・レース番号を共有するコンポーザブル
// useState は Nuxt 全体でシングルトンなので、ページ遷移しても値が維持される

export const useSharedVenue = () => {
  const selectedStadium = useState<number | null>('sharedStadium', () => null)
  const selectedRace = useState<number>('sharedRace', () => 1)

  return { selectedStadium, selectedRace }
}
