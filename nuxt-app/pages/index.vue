<template>
  <div class="page">
    <h1 class="page-title">出走表</h1>

    <!-- フィルターバー -->
    <div class="filter-bar">
      <div>
        <label>日付</label>
        <div class="date-input-group">
          <input type="date" v-model="selectedDate" @change="onDateChange" />
          <span
            class="day-badge"
            :class="isSunday ? 'sunday' : isWeekend ? 'saturday' : ''"
          >{{ dayOfWeek }}</span>
        </div>
      </div>
      <div>
        <label>会場</label>
        <select v-model="selectedStadium" @change="fetchPrograms">
          <option v-for="v in venues" :key="v.会場番号" :value="v.会場番号">
            {{ v.会場番号 }}. {{ v.会場名 }}
          </option>
        </select>
      </div>
    </div>

    <!-- ローディング / エラー -->
    <div v-if="pending" class="loading">読み込み中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="races.length === 0" class="empty">データがありません</div>

    <!-- レース一覧 -->
    <div v-for="race in races" :key="race.レース番号" class="card">
      <div class="card-header">
        <span class="race-badge">{{ race.レース番号 }}R</span>
        <span>{{ race.レース名 || "" }}</span>
        <span v-if="race.グレード名" class="grade-label">{{
          race.グレード名
        }}</span>
        <span class="ml-auto" style="font-weight: normal; font-size: 12px">
          距離 {{ race.距離 }}m　締切 {{ formatTime(race.締切時刻) }}
        </span>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>艇番</th>
            <th>選手名</th>
            <th>登番</th>
            <th>級</th>
            <th>年齢</th>
            <th>体重</th>
            <th>F/L</th>
            <th>平均ST</th>
            <th>全国勝率</th>
            <th>全国2着</th>
            <th>当地勝率</th>
            <th>当地2着</th>
            <th>M番号</th>
            <th>M2着率</th>
            <th>B番号</th>
            <th>B2着率</th>
            <th>単勝</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="boat in race.boats" :key="boat.艇番">
            <td>
              <span :class="`boat-badge boat-${boat.艇番}`">{{
                boat.艇番
              }}</span>
            </td>
            <td style="text-align: left; font-weight: 600">
              <NuxtLink :to="`/racers?q=${boat.選手番号}`" class="racer-link">{{ boat.選手名 }}</NuxtLink>
            </td>
            <td>{{ boat.選手番号 }}</td>
            <td>{{ GRADE[boat.級別番号] || boat.級別番号 }}</td>
            <td>{{ boat.年齢 }}</td>
            <td>{{ boat.体重 }}</td>
            <td>{{ boat.F数 }}F{{ boat.L数 }}L</td>
            <td>{{ fmt2(boat.平均ST) }}</td>
            <td>{{ fmt2(boat.全国1着率) }}</td>
            <td>{{ fmt2(boat.全国2着率) }}</td>
            <td>{{ fmt2(boat.当地1着率) }}</td>
            <td>{{ fmt2(boat.当地2着率) }}</td>
            <td>{{ boat.モーター番号 }}</td>
            <td>{{ fmt2(boat.モーター2着率) }}</td>
            <td>{{ boat.ボート番号 }}</td>
            <td>{{ fmt2(boat.ボート2着率) }}</td>
            <td>
              <span v-if="boat.単勝払い戻し != null" class="odds-win">
                ¥{{ boat.単勝払い戻し.toLocaleString() }}
              </span>
              <span v-else class="odds-none">-</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

const GRADE: Record<number, string> = { 1: "A1", 2: "A2", 3: "B1", 4: "B2" };

const { selectedDate, dayOfWeek, isWeekend, isSunday } = useSharedDate();
const { selectedStadium } = useSharedVenue();
const venues = ref<{ 会場番号: number; 会場名: string }[]>([]);
const races = ref<any[]>([]);
const pending = ref(false);
const error = ref("");

const fmt2 = (v: any) => (v != null ? Number(v).toFixed(2) : "-");
const formatTime = (s: string) => (s ? s.slice(11, 16) : "");

async function fetchVenues() {
  try {
    const data = await $fetch<{ 会場番号: number; 会場名: string }[]>(
      `/api/venues?date=${selectedDate.value}`,
    );
    venues.value = data;
    if (data.length > 0) {
      const alreadyInList = data.some(
        (v) => v.会場番号 === selectedStadium.value,
      );
      if (!alreadyInList) {
        selectedStadium.value = data[0].会場番号;
      }
      await fetchPrograms();
    } else {
      races.value = [];
    }
  } catch (e: any) {
    error.value = e.message;
  }
}

async function fetchPrograms() {
  if (!selectedStadium.value) return;
  pending.value = true;
  error.value = "";
  try {
    races.value = await $fetch<any[]>(
      `/api/programs?date=${selectedDate.value}&stadium=${selectedStadium.value}`,
    );
  } catch (e: any) {
    error.value = e.message;
  } finally {
    pending.value = false;
  }
}

async function onDateChange() {
  races.value = [];
  selectedStadium.value = null;
  await fetchVenues();
}

onMounted(fetchVenues);
</script>

<style scoped>
.odds-win {
  font-weight: 700;
  color: #c0392b;
  white-space: nowrap;
}
.odds-none {
  color: var(--color-muted);
}
.racer-link {
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}
.racer-link:hover {
  color: #2563eb;
  text-decoration: underline;
}
</style>
