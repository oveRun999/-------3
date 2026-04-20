<template>
  <div class="page">
    <h1 class="page-title">📊 予想履歴・的中検証</h1>

    <div class="filter-bar">
      <div>
        <label>日付</label>
        <div class="date-input-group">
          <input type="date" v-model="selectedDate" @change="onDateChange" />
          <span
            class="day-badge"
            :class="isSunday ? 'sunday' : isWeekend ? 'saturday' : ''"
            >{{ dayOfWeek }}</span
          >
        </div>
      </div>
      <div>
        <label>会場</label>
        <select v-model="venueFilter" @change="onVenueChange">
          <option :value="null">全会場</option>
          <option v-for="v in venues" :key="v.会場番号" :value="v.会場番号">
            {{ v.会場番号 }}. {{ v.会場名 }}
          </option>
        </select>
      </div>
      <div>
        <label>絞り込み</label>
        <select v-model="filterType">
          <option
            v-for="chip in filterChips"
            :key="chip.value"
            :value="chip.value"
          >
            {{ chip.label }}
          </option>
        </select>
      </div>
      <div>
        <label>並べ替え</label>
        <select v-model="sortType">
          <option
            v-for="sort in sortOptions"
            :key="sort.value"
            :value="sort.value"
          >
            {{ sort.label }}
          </option>
        </select>
      </div>
      <div>
        <label>種別</label>
        <select v-model="categoryType">
          <option
            v-for="type in typeOptions"
            :key="type.value"
            :value="type.value"
          >
            {{ type.label }}
          </option>
        </select>
      </div>
    </div>

    <div class="summary-scope">
      <span>対象: {{ selectedVenueLabel }}</span>
      <span> | 絞り込み: {{ selectedFilterLabel }}</span>
      <span> | 並べ替え: {{ selectedSortLabel }}</span>
      <span>
        | 種別: {{ selectedCategoryLabel }} ({{ currentCategoryTotal }}件)</span
      >
      <span> | 表示: {{ filteredRacesCount }} 件</span>
    </div>

    <div v-if="pending" class="loading">集計中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="!data" class="empty">会場を選択してください</div>

    <template v-if="data && filteredRaces.length > 0">
      <!-- サマリーカード -->
      <div class="summary-bar">
        <div class="summary-item">
          <div class="summary-num">
            <template v-if="venueFilter === null && filterType === 'all'">
              {{ finishedRacesCount }}<span class="unit">/{{ maxRaces }}</span>
            </template>
            <template v-else>
              {{ filteredRacesCount }}<span class="unit">/{{ maxRaces }}</span>
            </template>
          </div>
          <div class="summary-label">レース数</div>
        </div>
        <div
          class="summary-item"
          :class="currentWin1stRate >= 50 ? 'good' : ''"
        >
          <div class="summary-num">
            {{ currentWin1stRate }}<span class="unit">%</span>
          </div>
          <div class="summary-label">1着的中率</div>
        </div>
        <div
          class="summary-item"
          :class="currentTop3PerfectRate >= 20 ? 'good' : ''"
        >
          <div class="summary-num">
            {{ currentTop3PerfectRate }}<span class="unit">%</span>
          </div>
          <div class="summary-label">三連複一致率</div>
        </div>
        <div
          class="summary-item"
          :class="currentTrifectaRate >= 10 ? 'good' : ''"
        >
          <div class="summary-num">
            {{ currentTrifectaRate }}<span class="unit">%</span>
          </div>
          <div class="summary-label">三連単一致率</div>
        </div>
        <div
          class="summary-item"
          :class="currentTaikouRate >= 10 ? 'good' : ''"
        >
          <div class="summary-num">
            {{ currentTaikouRate }}<span class="unit">%</span>
          </div>
          <div class="summary-label">対抗一致率</div>
        </div>
        <div class="summary-item" :class="currentAnaRate >= 10 ? 'good' : ''">
          <div class="summary-num">
            {{ currentAnaRate }}<span class="unit">%</span>
          </div>
          <div class="summary-label">穴一致率</div>
        </div>
        <div class="summary-item total-payout">
          <div class="summary-num">
            <template v-if="selectedCategoryPayoutTotal !== null">
              ¥{{ selectedCategoryPayoutTotal.toLocaleString() }}
            </template>
            <template v-else>---</template>
          </div>
          <div class="summary-label">払い戻し合計</div>
        </div>
      </div>

      <!-- レース別カード -->
      <div
        v-for="race in filteredRaces"
        :key="`${race.会場番号}-${race.raceNo}`"
        class="card"
        :class="isOozana(race) ? 'card-oozana' : ''"
      >
        <div class="card-header">
          <span v-if="venueFilter === null" class="venue-badge">{{
            race.会場名
          }}</span>
          <span class="race-badge">{{ race.raceNo }}R</span>
          <span
            v-if="race.グレード名"
            :class="['grade-badge-h', `grade-h-${race.グレード名}`]"
            >{{ race.グレード名 }}</span
          >
          <span v-if="race.レース名" class="race-name-h">{{
            race.レース名
          }}</span>
          <!-- 的中バッジ -->
          <span v-if="race.win1st" class="hit-badge hit-1st">🎯 1着的中</span>
          <span v-if="race.trifectaHit" class="hit-badge hit-trifecta"
            >🔥 三連単的中</span
          >
          <span v-if="race.top3Perfect" class="hit-badge hit-perfect"
            >✨ 三連複的中</span
          >
          <span
            v-else
            class="hit-badge"
            :class="race.top3Match >= 2 ? 'hit-partial2' : 'hit-miss'"
          >
            TOP3 {{ race.top3Match }}/3一致
          </span>
          <span v-if="isTaikouHit(race)" class="hit-badge hit-taikou"
            >⚡ 対抗的中</span
          >
          <span v-if="isAnaHit(race)" class="hit-badge hit-ana">💎 穴的中</span>
          <span v-if="isOozana(race)" class="hit-badge hit-oozana">💥 大穴(¥{{ (race.payouts?.find((p:any)=>p.種別==='三連単')?.金額??0).toLocaleString() }})</span>
          <span v-if="!race.hasPreview" class="no-preview-badge">展示なし</span>
          <span v-if="race.weather?.気温" class="weather-info">
            🌡 {{ race.weather.気温 }}℃　💧 {{ race.weather.水温 }}℃　🌊
            {{ race.weather.波高 }}cm　💨 {{ race.weather.風速 }}m
          </span>
        </div>

        <!-- 予想比較テーブル -->
        <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>予想順位</th>
              <th>艇番</th>
              <th>選手名</th>
              <th>級別</th>
              <th>C</th>
              <th>展示T</th>
              <th>平均ST</th>
              <th>スコア</th>
              <th>実際の着順</th>
              <th>判定</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="b in sortedByPrediction(race.boats)"
              :key="b.艇番"
              :class="rowClass(b)"
            >
              <td>
                <span class="pred-rank">
                  {{
                    b.予想順位 === 1
                      ? "🥇"
                      : b.予想順位 === 2
                        ? "🥈"
                        : b.予想順位 === 3
                          ? "🥉"
                          : b.予想順位
                  }}
                </span>
              </td>
              <td>
                <span :class="`boat-badge boat-${b.艇番}`">{{ b.艇番 }}</span>
              </td>
              <td
                style="
                  text-align: center;
                  font-weight: 600;
                  white-space: nowrap;
                "
              >
                {{ b.選手名 }}
              </td>
              <td>
                <span :class="`grade-badge grade-${b.級別}`">{{ b.級別 }}</span>
              </td>
              <td>
                <strong>{{ b.コース番号 }}</strong>
              </td>
              <td>
                {{ b.展示タイム != null ? b.展示タイム.toFixed(2) : "-" }}
              </td>
              <td>{{ b.平均ST != null ? b.平均ST.toFixed(2) : "-" }}</td>
              <td class="score-cell">{{ b.score.toFixed(1) }}</td>
              <td>
                <span
                  v-if="b.実際の着順 != null"
                  class="actual-place"
                  :class="`place-${b.実際の着順}`"
                >
                  {{ fmtRank(b.実際の着順) }}
                </span>
                <span v-else class="no-result">-</span>
              </td>
              <td>
                <span
                  v-if="b.実際の着順 != null"
                  class="judge"
                  :class="judgeClass(b)"
                >
                  {{ judgeLabel(b) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        </div>

        <!-- 買い目提案 -->
        <div class="bet-section">
          <div class="bet-title">💡 予想一覧</div>
          <div class="bet-list">
            <div class="bet-item">
              <span class="bet-label">単勝</span>
              <span
                :class="`boat-badge boat-${sortedByPrediction(race.boats)[0]?.艇番}`"
                >{{ sortedByPrediction(race.boats)[0]?.艇番 }}</span
              >
            </div>
            <div class="bet-item">
              <span class="bet-label">2連単</span>
              <span
                :class="`boat-badge boat-${sortedByPrediction(race.boats)[0]?.艇番}`"
                >{{ sortedByPrediction(race.boats)[0]?.艇番 }}</span
              >
              <span class="bet-arrow">→</span>
              <span
                :class="`boat-badge boat-${sortedByPrediction(race.boats)[1]?.艇番}`"
                >{{ sortedByPrediction(race.boats)[1]?.艇番 }}</span
              >
            </div>
            <div class="bet-item">
              <span class="bet-label">3連単（本命）</span>
              <span
                :class="`boat-badge boat-${sortedByPrediction(race.boats)[0]?.艇番}`"
                >{{ sortedByPrediction(race.boats)[0]?.艇番 }}</span
              >
              <span class="bet-arrow">→</span>
              <span
                :class="`boat-badge boat-${sortedByPrediction(race.boats)[1]?.艇番}`"
                >{{ sortedByPrediction(race.boats)[1]?.艇番 }}</span
              >
              <span class="bet-arrow">→</span>
              <span
                :class="`boat-badge boat-${sortedByPrediction(race.boats)[2]?.艇番}`"
                >{{ sortedByPrediction(race.boats)[2]?.艇番 }}</span
              >
            </div>
            <div class="bet-item">
              <span class="bet-label">3連単（対抗）</span>
              <span
                :class="`boat-badge boat-${taikouSortedFor(race.boats)[0]?.艇番}`"
                >{{ taikouSortedFor(race.boats)[0]?.艇番 }}</span
              >
              <span class="bet-arrow">→</span>
              <span
                :class="`boat-badge boat-${taikouSortedFor(race.boats)[1]?.艇番}`"
                >{{ taikouSortedFor(race.boats)[1]?.艇番 }}</span
              >
              <span class="bet-arrow">→</span>
              <span
                :class="`boat-badge boat-${taikouSortedFor(race.boats)[2]?.艇番}`"
                >{{ taikouSortedFor(race.boats)[2]?.艇番 }}</span
              >
            </div>
            <div class="bet-item">
              <span class="bet-label">3連単（穴）</span>
              <span
                :class="`boat-badge boat-${sortedByPrediction(race.boats)[3]?.艇番}`"
                >{{ sortedByPrediction(race.boats)[3]?.艇番 }}</span
              >
              <span class="bet-arrow">→</span>
              <span
                :class="`boat-badge boat-${sortedByPrediction(race.boats)[0]?.艇番}`"
                >{{ sortedByPrediction(race.boats)[0]?.艇番 }}</span
              >
              <span class="bet-arrow">→</span>
              <span
                :class="`boat-badge boat-${sortedByPrediction(race.boats)[1]?.艇番}`"
                >{{ sortedByPrediction(race.boats)[1]?.艇番 }}</span
              >
            </div>
            <div
              v-if="upsetPickFor(race.boats).length === 3 && !isSameAsAnaFor(race)"
              class="bet-item bet-item-oozana-h"
              :class="isOozanaHit(race) ? 'bet-item-oozana-hit' : ''"
            >
              <span class="bet-label bet-label-oozana-h">💥 3連単（大穴）</span>
              <span
                v-for="(boat, i) in upsetPickFor(race.boats)"
                :key="i"
              >
                <span v-if="i > 0" class="bet-arrow">→</span>
                <span :class="`boat-badge boat-${boat}`">{{ boat }}</span>
              </span>
              <span v-if="isOozanaHit(race)" class="oozana-hit-mark">✅ 大穴的中！</span>
            </div>
          </div>
        </div>

        <!-- 実際の着順 + 払い戻し（1つのテーブル内に統合） -->
        <div v-if="race.actualBoats?.length > 0" class="result-section">
          <div class="table-scroll">
          <table class="data-table result-table">
            <thead>
              <tr>
                <th>着順</th>
                <th>艇番</th>
                <th>選手名</th>
                <th>C</th>
                <th>ST</th>
                <th>種別</th>
                <th>組み合わせ</th>
                <th>払い戻し</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(b, index) in race.actualBoats"
                :key="`actual-${b.艇番}`"
              >
                <td :class="b.着順 >= 7 ? 'place-sp' : 'place-' + b.着順">
                  <strong>{{ fmtRank(b.着順) }}</strong>
                </td>
                <td>
                  <span :class="`boat-badge boat-${b.艇番}`">{{ b.艇番 }}</span>
                </td>
                <td
                  style="
                    text-align: center;
                    font-weight: 600;
                    white-space: nowrap;
                  "
                >
                  {{ b.選手名 }}
                </td>
                <td>{{ b.コース番号 }}</td>
                <td>
                  {{ b.スタートST != null ? b.スタートST.toFixed(2) : "-" }}
                </td>

                <td v-if="race.payouts?.[index]">
                  <span
                    :class="[
                      'payout-badge',
                      race.payouts[index].種別 === '三連単'
                        ? 'payout-trifecta'
                        : race.payouts[index].種別 === '三連複'
                          ? 'payout-trio'
                          : '',
                    ]"
                  >
                    {{ race.payouts[index].種別 }}
                  </span>
                </td>
                <td v-else>—</td>

                <td v-if="race.payouts?.[index]" style="font-weight: 700">
                  {{ race.payouts[index].組み合わせ }}
                </td>
                <td v-else></td>

                <td
                  v-if="race.payouts?.[index]"
                  style="
                    text-align: center;
                    font-weight: 700;
                    color: var(--color-warning-dark);
                  "
                >
                  ¥{{ race.payouts[index].金額?.toLocaleString() }}
                </td>
                <td v-else></td>
              </tr>
              <tr
                v-for="p in race.payouts?.slice(race.actualBoats.length)"
                :key="`payout-${p.種別}-${p.組み合わせ}`"
              >
                <td colspan="5"></td>
                <td>
                  <span
                    :class="[
                      'payout-badge',
                      p.種別 === '三連単'
                        ? 'payout-trifecta'
                        : p.種別 === '三連複'
                          ? 'payout-trio'
                          : '',
                    ]"
                  >
                    {{ p.種別 }}
                  </span>
                </td>
                <td style="font-weight: 700">{{ p.組み合わせ }}</td>
                <td
                  style="
                    text-align: center;
                    font-weight: 700;
                    color: var(--color-warning-dark);
                  "
                >
                  ¥{{ p.金額?.toLocaleString() }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </template>

    <div v-else-if="data && filteredRaces.length === 0" class="empty">
      {{
        data.races?.length === 0
          ? "結果データがありません（レース未終了の可能性があります）"
          : "該当するレースがありません"
      }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useSharedDate } from "~/composables/useSharedDate";

const { selectedDate, dayOfWeek, isWeekend, isSunday } = useSharedDate();
const venues = ref<{ 会場番号: number; 会場名: string }[]>([]);
const venueFilter = ref<number | null>(null); // null = 全会場
const data = ref<any>(null);
const pending = ref(false);
const error = ref("");

// 大穴判定（三連単払い戻し10,000円以上）
const isOozana = (race: any): boolean => {
  const trifecta = race.payouts?.find((p: any) => p.種別 === "三連単");
  return !!(trifecta && trifecta.金額 >= 10000);
};

// 絞り込みチップ
type FilterType =
  | "all"
  | "win1st"
  | "top3perfect"
  | "top3partial"
  | "miss"
  | "trifecta"
  | "taikou"
  | "ana"
  | "oozana";
const filterType = ref<FilterType>("all");
const filterChips: { label: string; value: FilterType }[] = [
  { label: "すべて", value: "all" },
  { label: "🎯 1着的中", value: "win1st" },
  { label: "🔷 TOP3部分", value: "top3partial" },
  { label: "🔥 三連単", value: "trifecta" },
  { label: "⚡ 対抗的中", value: "taikou" },
  { label: "✨ 三連複", value: "top3perfect" },
  { label: "💎 穴的中", value: "ana" },
  { label: "💥 大穴的中", value: "oozana" },
  { label: "🙅 外れ", value: "miss" },
];

// 並べ替えオプション
type SortType = "default" | "payoutDesc";
const sortType = ref<SortType>("default");
const sortOptions: { label: string; value: SortType }[] = [
  { label: "デフォルト", value: "default" },
  { label: "払い戻し大きい順", value: "payoutDesc" },
];

type CategoryType = "all" | "単勝" | "二連単" | "二連複" | "三連単" | "三連複";
const categoryType = ref<CategoryType>("all");
const typeOptions: { label: string; value: CategoryType }[] = [
  { label: "全種別", value: "all" },
  { label: "単勝", value: "単勝" },
  { label: "二連単", value: "二連単" },
  { label: "二連複", value: "二連複" },
  { label: "三連単", value: "三連単" },
  { label: "三連複", value: "三連複" },
];

const filteredRaces = computed(() => {
  if (!data.value?.races) return [];
  let races = data.value.races;
  if (venueFilter.value != null) {
    races = races.filter((r: any) => r.会場番号 === venueFilter.value);
  }
  let filtered: any[];
  switch (filterType.value) {
    case "win1st":
      filtered = races.filter((r: any) => r.win1st);
      break;
    case "top3perfect":
      filtered = races.filter((r: any) => r.top3Perfect);
      break;
    case "top3partial":
      filtered = races.filter((r: any) => r.top3Match >= 2 && !r.top3Perfect);
      break;
    case "miss":
      filtered = races.filter((r: any) => r.top3Match < 2);
      break;
    case "trifecta":
      filtered = races.filter((r: any) => r.trifectaHit);
      break;
    case "taikou":
      filtered = races.filter((r: any) => isTaikouHit(r));
      break;
    case "ana":
      filtered = races.filter((r: any) => isAnaHit(r));
      break;
    case "oozana":
      filtered = races.filter((r: any) => isOozanaHit(r));
      break;
    default:
      filtered = races;
      break;
  }

  // 並べ替え
  if (sortType.value === "payoutDesc") {
    filtered = [...filtered].sort((a, b) => {
      const aTotal = (a.payouts || []).reduce(
        (sum: number, p: any) => sum + (p.金額 || 0),
        0,
      );
      const bTotal = (b.payouts || []).reduce(
        (sum: number, p: any) => sum + (p.金額 || 0),
        0,
      );
      return bTotal - aTotal;
    });
  }

  return filtered;
});

const selectedVenueLabel = computed(() => {
  if (venueFilter.value == null) return "全会場";
  const found = venues.value.find((v) => v.会場番号 === venueFilter.value);
  return found
    ? `${found.会場名} (${found.会場番号})`
    : `会場 ${venueFilter.value}`;
});

const selectedFilterLabel = computed(() => {
  const found = filterChips.find((c) => c.value === filterType.value);
  return found ? found.label : "すべて";
});

const selectedSortLabel = computed(() => {
  const found = sortOptions.find((s) => s.value === sortType.value);
  return found ? found.label : "デフォルト";
});

const selectedCategoryLabel = computed(() => {
  const found = typeOptions.find((t) => t.value === categoryType.value);
  return found ? found.label : "全種別";
});

const totalRaces = computed(() => filteredRaces.value.length);
const currentTotal = computed(() => totalRaces.value);

// 終了済みレース数（着順データあり）
const finishedRacesCount = computed(() => {
  if (!data.value?.races) return 0;
  let races = data.value.races;
  if (venueFilter.value != null) {
    races = races.filter((r: any) => r.会場番号 === venueFilter.value);
  }
  return races.filter((r: any) =>
    r.boats?.some((b: any) => b.実際の着順 != null)
  ).length;
});

// 全レース数（終了・未終了含む）
const maxRaces = computed(() => {
  if (!data.value?.races) return 0;
  let races = data.value.races;
  if (venueFilter.value != null) {
    races = races.filter((r: any) => r.会場番号 === venueFilter.value);
  }
  return races.length;
});

const currentWin1stRate = computed(() => {
  const total = totalRaces.value;
  if (total === 0) return 0;
  const count = filteredRaces.value.filter((race: any) => race.win1st).length;
  return Math.round((count / total) * 1000) / 10;
});

const currentTrifectaRate = computed(() => {
  const total = totalRaces.value;
  if (total === 0) return 0;
  const count = filteredRaces.value.filter(
    (race: any) => race.trifectaHit,
  ).length;
  return Math.round((count / total) * 1000) / 10;
});

const currentTop3PerfectRate = computed(() => {
  const total = totalRaces.value;
  if (total === 0) return 0;
  const count = filteredRaces.value.filter(
    (race: any) => race.top3Perfect,
  ).length;
  return Math.round((count / total) * 1000) / 10;
});

const currentTaikouRate = computed(() => {
  const total = totalRaces.value;
  if (total === 0) return 0;
  const count = filteredRaces.value.filter((race: any) =>
    isTaikouHit(race),
  ).length;
  return Math.round((count / total) * 1000) / 10;
});

const currentAnaRate = computed(() => {
  const total = totalRaces.value;
  if (total === 0) return 0;
  const count = filteredRaces.value.filter((race: any) =>
    isAnaHit(race),
  ).length;
  return Math.round((count / total) * 1000) / 10;
});

const currentCategoryTotal = computed(() => {
  if (!data.value?.races) return 0;
  return filteredRaces.value.filter((race: any) =>
    matchesCategoryType(race, categoryType.value),
  ).length;
});

const selectedCategoryPayoutTotal = computed<number | null>(() => {
  if (categoryType.value === "all" || !data.value?.races) return null;
  const total = filteredRaces.value.reduce((sum: number, race: any) => {
    return (
      sum +
      (race.payouts || [])
        .filter((p: any) => p.種別 === categoryType.value)
        .reduce((inner: number, p: any) => inner + (p.金額 || 0), 0)
    );
  }, 0);
  return total > 0 ? total : null;
});

const filteredRacesCount = computed(() => filteredRaces.value.length);

const hasPayoutType = (race: any, payoutType: string) =>
  !!race.payouts?.some((p: any) => p.種別 === payoutType);

const matchesCategoryType = (race: any, type: CategoryType) => {
  switch (type) {
    case "単勝":
      return hasPayoutType(race, "単勝");
    case "二連単":
      return hasPayoutType(race, "二連単");
    case "二連複":
      return hasPayoutType(race, "二連複");
    case "三連単":
      return hasPayoutType(race, "三連単");
    case "三連複":
      return hasPayoutType(race, "三連複");
    default:
      return true;
  }
};

// 予想順位順にソート
const sortedByPrediction = (boats: any[]) =>
  [...boats].sort((a, b) => a.予想順位 - b.予想順位);

// 対抗用ランキング：1コース-5点、今節点×1.5追加（調子重視）
const taikouSortedFor = (boats: any[]) =>
  [...boats]
    .map((b) => ({
      ...b,
      taikouScore: b.score
        - (b.コース番号 === 1 ? 5 : 0)
        + (b.scoreDetail?.今節点 ?? 0) * 1.5,
    }))
    .sort((a, b) => b.taikouScore - a.taikouScore);

// 大穴買い目（外コース4〜6の中でスコア上位の艇→残り上位2艇）
// 重複しないよう外コース軸を除いた上位2艇を選ぶ
const upsetPickFor = (boats: any[]): number[] => {
  const sorted = sortedByPrediction(boats);
  const outer = boats
    .filter((b: any) => (b.コース番号 ?? 0) >= 4)
    .sort((a: any, b: any) => b.score - a.score);
  if (outer.length === 0 || sorted.length < 2) return [];
  const axisBoatNo = outer[0].艇番;
  // 軸と被らない上位2艇を選ぶ
  const rest = sorted.filter((b: any) => b.艇番 !== axisBoatNo);
  if (rest.length < 2) return [];
  return [axisBoatNo, rest[0].艇番, rest[1].艇番];
};

// 穴と大穴が同じ買い目かどうか判定
const isSameAsAnaFor = (race: any): boolean => {
  const sorted = sortedByPrediction(race.boats);
  if (sorted.length < 4) return false;
  const oozana = upsetPickFor(race.boats);
  return (
    oozana.length === 3 &&
    oozana[0] === sorted[3].艇番 &&
    oozana[1] === sorted[0].艇番 &&
    oozana[2] === sorted[1].艇番
  );
};

// 大穴的中判定（大穴買い目の順番が実際の着順1〜3と一致）
const isOozanaHit = (race: any): boolean => {
  const pick = upsetPickFor(race.boats);
  if (pick.length !== 3) return false;
  const actual = (race.actualBoats ?? [])
    .slice(0, 3)
    .map((b: any) => b.艇番);
  return pick.length === actual.length && pick.every((n: number, i: number) => n === actual[i]);
};

// 行のクラス（的中したかどうか）
const rowClass = (b: any) => {
  if (b.実際の着順 == null) return "";
  if (b.予想順位 <= 3 && b.実際の着順 <= 3) return "row-hit"; // 予想上位3 & 実際3着以内
  if (b.予想順位 <= 3 && b.実際の着順 > 3) return "row-miss"; // 予想上位3 だが外れ
  return "";
};

// 着順の表示テキスト（特殊コード統一）
function fmtRank(v: number | null): string {
  if (v == null) return "-";
  if (v === 9) return "転覆";
  if (v === 10) return "沈没";
  if (v === 11) return "棄権";
  if (v === 12) return "失格";
  if (v === 13) return "L";
  if (v === 14) return "F";
  if (v === 15) return "返還";
  if (v === 16) return "欠場";
  return `${v}着`;
}

// 判定ラベル
const judgeLabel = (b: any) => {
  if (b.実際の着順 == null) return "";
  if (b.予想順位 === 1 && b.実際の着順 === 1) return "◎";
  if (b.予想順位 === 1 && b.実際の着順 <= 3) return "○";
  if (b.予想順位 === 1 && b.実際の着順 > 3) return "✕";
  if (b.予想順位 <= 3 && b.実際の着順 <= 3) return "△";
  if (b.予想順位 <= 3 && b.実際の着順 > 3) return "✕";
  if (b.予想順位 > 3 && b.実際の着順 <= 3) return "▲"; // 穴
  return "";
};

const judgeClass = (b: any) => {
  const label = judgeLabel(b);
  if (label === "◎") return "judge-win";
  if (label === "○") return "judge-place";
  if (label === "△") return "judge-show";
  if (label === "✕") return "judge-miss";
  if (label === "▲") return "judge-upset";
  return "";
};

// 対抗的中判定
const isTaikouHit = (race: any) => {
  if (!race.actualBoats || race.actualBoats.length < 3) return false;
  const actual = race.actualBoats.slice(0, 3).map((b: any) => b.艇番);
  const t = taikouSortedFor(race.boats);
  if (t.length < 3) return false;
  const taikou = [t[0].艇番, t[1].艇番, t[2].艇番];
  return actual.every((a: number, i: number) => a === taikou[i]);
};

// 穴的中判定
const isAnaHit = (race: any) => {
  if (!race.actualBoats || race.actualBoats.length < 3) return false;
  const actual = race.actualBoats.slice(0, 3).map((b: any) => b.艇番);
  const sorted = sortedByPrediction(race.boats);
  if (sorted.length < 4) return false;
  const ana = [sorted[3].艇番, sorted[0].艇番, sorted[1].艇番];
  return actual.every((a, i) => a === ana[i]);
};

async function fetchVenues() {
  try {
    const res = await $fetch<{ 会場番号: number; 会場名: string }[]>(
      `/api/venues?date=${selectedDate.value}`,
    );
    venues.value = res;
    if (res.length > 0) {
      const alreadyInList =
        venueFilter.value != null &&
        res.some((v) => v.会場番号 === venueFilter.value);
      if (venueFilter.value == null) {
        // 全会場のまま
      } else if (!alreadyInList) {
        venueFilter.value = res[0].会場番号;
      }
      await fetchData();
    } else {
      data.value = null;
    }
  } catch (e: any) {
    error.value = e.message;
  }
}

async function fetchData() {
  pending.value = true;
  error.value = "";
  data.value = null;
  try {
    const stadiumQS =
      venueFilter.value == null ? "" : `&stadium=${venueFilter.value}`;
    data.value = await $fetch<any>(
      `/api/predict-history?date=${selectedDate.value}${stadiumQS}`,
    );
  } catch (e: any) {
    error.value = e.message;
  } finally {
    pending.value = false;
  }
}

async function onDateChange() {
  data.value = null;
  venueFilter.value = null;
  await fetchVenues();
}

async function onVenueChange() {
  await fetchData();
}

onMounted(fetchVenues);
</script>

<style scoped lang="scss">
/* サマリーバー */
.summary-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.summary-item {
  flex: 1;
  min-width: 100px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 14px;
  text-align: center;
}
.summary-item.good {
  border-color: var(--color-success);
  background: var(--color-surface-success);
}
.summary-item.total-payout {
  border-color: var(--color-error);
  background: var(--color-surface-light);
}
.summary-num {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-primary);
  line-height: 1;
}
.summary-num .unit {
  font-size: 14px;
  color: var(--color-muted);
}
.summary-label {
  font-size: 11px;
  color: var(--color-muted);
  margin-top: 4px;
}
.summary-item.good .summary-num {
  color: var(--color-success);
}
.summary-item.total-payout .summary-num {
  color: var(--color-error);
}

/* 的中バッジ */
.hit-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 10px;
  margin-left: 4px;
}
.hit-1st {
  background: var(--color-surface-warning);
  color: var(--color-warning-dark);
}
.hit-perfect {
  background: var(--color-surface-error);
  color: var(--color-error);
}
.hit-trifecta {
  background: var(--color-surface-warning-soft);
  color: var(--color-warning);
}
.hit-taikou {
  background: var(--color-surface-info);
  color: var(--color-info);
}
.hit-ana {
  background: var(--color-surface-ana);
  color: var(--color-purple);
}
.hit-oozana {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fca5a5;
  font-weight: 800;
}
.hit-partial2 {
  background: var(--color-surface-success);
  color: var(--color-success);
}
.hit-miss {
  background: var(--color-surface-muted);
  color: var(--color-grey);
}

/* 大穴カードのハイライト */
.card-oozana {
  border-left: 4px solid #ef4444;
}

/* 大穴買い目 */
.bet-item-oozana-h {
  background: rgba(239, 68, 68, 0.06);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 8px;
  padding: 6px 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.bet-item-oozana-hit {
  background: rgba(239, 68, 68, 0.15);
  border-color: #ef4444;
}
.bet-label-oozana-h {
  font-size: 11px;
  color: #dc2626;
  font-weight: 800;
  white-space: nowrap;
}
.oozana-hit-mark {
  font-size: 11px;
  font-weight: 700;
  color: #16a34a;
  margin-left: 4px;
}
.no-preview-badge {
  font-size: 10px;
  color: var(--color-muted);
  background: var(--color-surface-muted);
  border-radius: 8px;
  padding: 1px 8px;
  margin-left: 4px;
}

/* 行の色分け */
.row-hit td {
  background: var(--color-surface-success) !important;
}
.row-miss td {
  background: var(--color-surface-error) !important;
}

/* 級別バッジ */
.grade-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 3px;
}
.grade-A1 {
  background: var(--color-surface-error);
  color: var(--color-error);
}
.grade-A2 {
  background: var(--color-surface-warning);
  color: var(--color-warning-dark);
}
.grade-B1 {
  background: var(--color-surface-success);
  color: var(--color-success);
}
.grade-B2 {
  background: var(--color-surface-secondary);
  color: var(--color-muted);
}

/* スコア */
.score-cell {
  font-weight: 600;
  color: var(--color-primary);
}

/* 実際の着順 */
.actual-place {
  font-weight: 700;
  font-size: 13px;
}
.place-1 {
  color: var(--color-gold);
}
.place-2 {
  color: var(--color-grey-dark);
}
.place-3 {
  color: var(--color-bronze);
}
.place-sp {
  color: #dc2626;
}
.no-result {
  color: var(--color-muted);
}

/* 判定記号 */
.judge {
  font-weight: 700;
  font-size: 14px;
}
.judge-win {
  color: var(--color-error);
} /* ◎ 本命1着 */
.judge-place {
  color: var(--color-warning);
} /* ○ 本命TOP3 */
.judge-show {
  color: var(--color-success);
} /* △ 対抗TOP3 */
.judge-miss {
  color: var(--color-grey);
} /* ✕ 外れ */
.judge-upset {
  color: var(--color-purple);
} /* ▲ 穴 */

.pred-rank {
  font-size: 16px;
}

/* グレードバッジ（大・サマリーカード内） */
.grade-badge-lg {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 4px;
  letter-spacing: 0.05em;
}
.grade-lg-SG {
  background: var(--color-error);
  color: var(--color-white);
}
.grade-lg-G1 {
  background: var(--color-warning);
  color: var(--color-white);
}
.grade-lg-G2 {
  background: var(--color-info);
  color: var(--color-white);
}
.grade-lg-G3 {
  background: var(--color-success);
  color: var(--color-white);
}
.grade-lg-一般 {
  background: var(--color-white-opaque);
  color: var(--color-white);
}

/* レース名バー */
.race-name-bar {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  padding: 4px 0 10px;
  letter-spacing: 0.03em;
}

.summary-scope {
  margin: 8px 0 14px;
  color: var(--color-text);
  font-size: 13px;
  display: flex;
  gap: 12px;
}

.summary-scope span {
  display: inline-block;
}

/* 買い目 */
.bet-section {
  border-top: 1px solid var(--color-border);
  padding-top: 14px;
  padding: 14px;
  background: var(--color-surface-warning);
}
.bet-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 10px;
}
.bet-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}
.bet-item {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 6px 12px;
}
.bet-label {
  font-size: 11px;
  color: var(--color-muted);
  margin-right: 2px;
  white-space: nowrap;
}
.bet-arrow {
  color: var(--color-muted);
  font-size: 12px;
}
</style>