<template>
  <div class="page">
    <h1 class="page-title">🎯 会場別 予想的中率</h1>

    <div class="filter-bar">
      <div>
        <label>集計期間</label>
        <select v-model="selectedYears" @change="fetchData">
          <option :value="1">直近 1年</option>
          <option :value="2">直近 2年</option>
        </select>
      </div>
      <div>
        <label>並べ替え</label>
        <select v-model="sortKey">
          <option value="三連複">三連複一致率</option>
          <option value="TOP3部分的中">TOP3部分的中率</option>
          <option value="TOP1的中率">1着的中率</option>
          <option value="三連単的中率">三連単的中率</option>
          <option value="総レース数">総レース数</option>
          <option value="会場番号">会場番号順</option>
        </select>
      </div>
      <div v-if="stats" class="summary-pill">
        集計 {{ stats.result.length }} 会場 ／ 総レース
        {{ totalRaces.toLocaleString() }} R
        <span class="date-range">
          （実データ: {{ stats.actualMinDate ?? "?" }} 〜
          {{ stats.actualMaxDate ?? "?" }}）
        </span>
      </div>
      <div
        v-if="
          stats && stats.actualMinDate && stats.actualMinDate > stats.startDate
        "
        class="data-warn"
      >
        ⚠️ DBのデータは
        {{ stats.actualMinDate }}
        からしかないばい。期間を絞っても結果は変わらんとよ。
      </div>
    </div>

    <!-- 過去データ一括取得 -->
    <div class="bulk-fetch-bar">
      <div class="bulk-info">
        📥 OpenAPIの過去データを一括取得してDBに追加できるばい
      </div>
      <div class="bulk-controls">
        <div>
          <label>取得開始日</label>
          <input type="date" v-model="bulkStartDate" :disabled="bulkLoading" />
        </div>
        <div>
          <label>取得終了日</label>
          <input type="date" v-model="bulkEndDate" :disabled="bulkLoading" />
        </div>
        <button class="bulk-btn" :disabled="bulkLoading" @click="doBulkFetch">
          {{ bulkLoading ? "⏳ 取得中..." : "📥 一括取得" }}
        </button>
      </div>
      <div
        v-if="bulkResult"
        class="bulk-result"
        :class="bulkResult.ok ? 'ok' : 'err'"
      >
        {{ bulkResult.msg }}
      </div>
    </div>

    <div v-if="loading" class="loading">⏳ 集計中... しばらく待ってね</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="!stats || stats.result.length === 0" class="empty">
      データがないばい
    </div>

    <template v-else>
      <!-- 全体平均バー -->
      <div class="avg-row">
        <div class="avg-item">
          <div class="avg-label">全会場平均 三連複</div>
          <div class="avg-value" :style="{ color: rateColor(avgTop3Perfect) }">
            {{ avgTop3Perfect.toFixed(1) }}%
          </div>
        </div>
        <div class="avg-item">
          <div class="avg-label">全会場平均 TOP3部分</div>
          <div class="avg-value" :style="{ color: rateColor(avgTop3Partial) }">
            {{ avgTop3Partial.toFixed(1) }}%
          </div>
        </div>
        <div class="avg-item">
          <div class="avg-label">全会場平均 1着</div>
          <div class="avg-value" :style="{ color: rateColor(avgTop1) }">
            {{ avgTop1.toFixed(1) }}%
          </div>
        </div>
        <div class="avg-item">
          <div class="avg-label">全会場平均 三連単</div>
          <div class="avg-value" :style="{ color: rateColor(avgTrifecta) }">
            {{ avgTrifecta.toFixed(1) }}%
          </div>
        </div>
      </div>

      <!-- 会場別テーブル -->
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>順位</th>
              <th>会場</th>
              <th>レース数</th>
              <th
                class="sortable"
                :class="{ active: sortKey === 'TOP1的中率' }"
                @click="sortKey = 'TOP1的中率'"
              >
                1着的中 ▲
              </th>
              <th
                class="sortable"
                :class="{ active: sortKey === 'TOP3部分的中' }"
                @click="sortKey = 'TOP3部分的中'"
              >
                TOP3部分 ▲
              </th>
              <th
                class="sortable"
                :class="{ active: sortKey === '三連複' }"
                @click="sortKey = '三連複'"
              >
                三連複 ▲
              </th>
              <th
                class="sortable"
                :class="{ active: sortKey === '三連単的中率' }"
                @click="sortKey = '三連単的中率'"
              >
                三連単 ▲
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(v, i) in sorted" :key="v.会場番号" :class="rowClass(v)">
              <td class="rank">{{ i + 1 }}</td>
              <td class="venue-name">
                <span class="venue-no">{{ v.会場番号 }}</span>
                {{ v.会場名 }}
              </td>
              <td class="race-count">{{ v.総レース数.toLocaleString() }}</td>
              <td>
                <div class="rate-cell">
                  <span
                    class="rate-val"
                    :style="{ color: rateColor(v.TOP1的中率) }"
                  >
                    {{ v.TOP1的中率 }}%
                  </span>
                  <div class="rate-bar">
                    <div
                      class="rate-fill top1"
                      :style="{ width: barWidth(v.TOP1的中率, 50) }"
                    ></div>
                  </div>
                </div>
              </td>
              <td>
                <div class="rate-cell">
                  <span
                    class="rate-val"
                    :style="{ color: rateColor(v.TOP3部分的中) }"
                  >
                    {{ v.TOP3部分的中 }}%
                  </span>
                  <div class="rate-bar">
                    <div
                      class="rate-fill partial"
                      :style="{ width: barWidth(v.TOP3部分的中, 90) }"
                    ></div>
                  </div>
                </div>
              </td>
              <td>
                <div class="rate-cell">
                  <span
                    class="rate-val"
                    :style="{ color: rateColor(v.三連複) }"
                  >
                    {{ v.三連複 }}%
                  </span>
                  <div class="rate-bar">
                    <div
                      class="rate-fill perfect"
                      :style="{ width: barWidth(v.三連複, 30) }"
                    ></div>
                  </div>
                </div>
              </td>
              <td>
                <div class="rate-cell">
                  <span
                    class="rate-val"
                    :style="{ color: rateColor(v.三連単的中率) }"
                  >
                    {{ v.三連単的中率 }}%
                  </span>
                  <div class="rate-bar">
                    <div
                      class="rate-fill trifecta"
                      :style="{ width: barWidth(v.三連単的中率, 10) }"
                    ></div>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 説明 -->
      <div class="legend">
        <div class="legend-item">
          <span class="dot top1"></span>1着的中：予想1位が実際に1着
        </div>
        <div class="legend-item">
          <span class="dot partial"></span>TOP3部分：予想TOP3に1艇以上的中
        </div>
        <div class="legend-item">
          <span class="dot perfect"></span>三連複：予想TOP3と実際TOP3が3艇全一致
        </div>
        <div class="legend-item">
          <span class="dot trifecta"></span>三連単：予想TOP3と着順まで完全一致
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
const selectedYears = ref(1);
const sortKey = ref<string>("三連複");
const loading = ref(false);
const error = ref<string | null>(null);

// 過去データ一括取得
const todayStr = () => new Date().toISOString().slice(0, 10);
const bulkStartDate = ref("2026-01-01");
const bulkEndDate = ref(todayStr());
const bulkLoading = ref(false);
const bulkResult = ref<{ ok: boolean; msg: string } | null>(null);

const doBulkFetch = async () => {
  if (!bulkStartDate.value || !bulkEndDate.value) return;
  bulkLoading.value = true;
  bulkResult.value = null;
  const s = bulkStartDate.value.replace(/-/g, "");
  const e = bulkEndDate.value.replace(/-/g, "");
  try {
    const res = await $fetch<any>("/api/refresh", {
      method: "POST",
      body: { startDate: s, endDate: e },
    });
    if (res.success) {
      bulkResult.value = { ok: true, msg: `✅ 完了！ ${res.summary ?? ""}` };
      await fetchData(); // 的中率を再集計
    } else {
      bulkResult.value = { ok: false, msg: `❌ エラー: ${res.error}` };
    }
  } catch (e: any) {
    bulkResult.value = { ok: false, msg: `❌ 接続エラー: ${e.message}` };
  } finally {
    bulkLoading.value = false;
  }
};
const stats = ref<{
  years: number;
  startDate: string;
  actualMinDate: string | null;
  actualMaxDate: string | null;
  result: any[];
} | null>(null);

const fetchData = async () => {
  loading.value = true;
  error.value = null;
  try {
    const data = await $fetch<{
      years: number;
      startDate: string;
      result: any[];
    }>(`/api/accuracy?years=${selectedYears.value}`);
    stats.value = data;
  } catch (e: any) {
    error.value = e?.message ?? "取得エラー";
  } finally {
    loading.value = false;
  }
};

onMounted(fetchData);

const sorted = computed(() => {
  if (!stats.value) return [];
  const key = sortKey.value as keyof (typeof stats.value.result)[0];
  return [...stats.value.result].sort((a, b) => {
    if (key === "会場番号") return a.会場番号 - b.会場番号;
    return (b[key] as number) - (a[key] as number);
  });
});

const totalRaces = computed(
  () => stats.value?.result.reduce((s, v) => s + v.総レース数, 0) ?? 0,
);

// 全体平均
const avg = (key: string) => {
  if (!stats.value || stats.value.result.length === 0) return 0;
  const total = stats.value.result.reduce((s, v) => s + v.総レース数, 0);
  const weighted = stats.value.result.reduce(
    (s, v) => s + (v[key] / 100) * v.総レース数,
    0,
  );
  return total > 0 ? (weighted / total) * 100 : 0;
};
const avgTop1 = computed(() => avg("TOP1的中率"));
const avgTop3Partial = computed(() => avg("TOP3部分的中"));
const avgTop3Perfect = computed(() => avg("三連複"));
const avgTrifecta = computed(() => avg("三連単的中率"));

// 色付け
const rateColor = (rate: number) => {
  if (rate >= 40) return "#22c55e";
  if (rate >= 30) return "#84cc16";
  if (rate >= 20) return "#eab308";
  if (rate >= 10) return "#f97316";
  return "#ef4444";
};

// バー幅（maxRate に対する割合）
const barWidth = (rate: number, maxRate: number) => {
  return Math.min((rate / maxRate) * 100, 100) + "%";
};

// 行の色クラス（三連複が高い会場をハイライト）
const rowClass = (v: any) => {
  if (v.三連複 >= 25) return "row-high";
  if (v.三連複 >= 18) return "row-mid";
  return "";
};
</script>

<style scoped>
.page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 16px;
  color: #1e293b;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
}
.filter-bar label {
  font-size: 11px;
  color: #64748b;
  display: block;
  margin-bottom: 2px;
}
.filter-bar select {
  padding: 4px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
  background: white;
}
.summary-pill {
  margin-left: auto;
  font-size: 12px;
  color: #475569;
  background: #e2e8f0;
  border-radius: 999px;
  padding: 4px 12px;
}
.date-range {
  color: #94a3b8;
  font-size: 11px;
}
/* 過去データ一括取得 */
.bulk-fetch-bar {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 10px;
  padding: 12px 16px;
  margin-bottom: 16px;
}
.bulk-info {
  font-size: 13px;
  color: #0369a1;
  margin-bottom: 8px;
  font-weight: 600;
}
.bulk-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
}
.bulk-controls label {
  font-size: 11px;
  color: #64748b;
  display: block;
  margin-bottom: 2px;
}
.bulk-controls input[type="date"] {
  padding: 5px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
  background: white;
}
.bulk-btn {
  padding: 6px 18px;
  background: #0284c7;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.bulk-btn:hover:not(:disabled) {
  background: #0369a1;
}
.bulk-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.bulk-result {
  margin-top: 8px;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 6px;
}
.bulk-result.ok {
  background: #dcfce7;
  color: #166534;
}
.bulk-result.err {
  background: #fee2e2;
  color: #991b1b;
}

.data-warn {
  background: #fef9c3;
  border: 1px solid #fde047;
  color: #854d0e;
  border-radius: 6px;
  padding: 8px 14px;
  font-size: 12px;
  margin-bottom: 12px;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #64748b;
  font-size: 15px;
}
.error {
  text-align: center;
  padding: 24px;
  color: #ef4444;
}
.empty {
  text-align: center;
  padding: 24px;
  color: #94a3b8;
}

/* 全体平均 */
.avg-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  background: #f1f5f9;
  border-radius: 10px;
  padding: 12px 16px;
  margin-bottom: 16px;
}
.avg-item {
  text-align: center;
  flex: 1;
  min-width: 120px;
}
.avg-label {
  font-size: 11px;
  color: #64748b;
  margin-bottom: 2px;
}
.avg-value {
  font-size: 22px;
  font-weight: bold;
}

/* テーブル */
.table-wrap {
  overflow-x: auto;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.data-table th {
  background: #1e293b;
  color: white;
  padding: 8px 10px;
  text-align: center;
  white-space: nowrap;
}
.data-table th.sortable {
  cursor: pointer;
}
.data-table th.sortable:hover {
  background: #334155;
}
.data-table th.active {
  background: #0ea5e9;
}
.data-table td {
  padding: 7px 10px;
  border-bottom: 1px solid #e2e8f0;
  vertical-align: middle;
}
.data-table tbody tr:hover {
  background: #f8fafc;
}

.row-high {
  background: #f0fdf4 !important;
}
.row-high:hover {
  background: #dcfce7 !important;
}
.row-mid {
  background: #fefce8 !important;
}
.row-mid:hover {
  background: #fef9c3 !important;
}

.rank {
  text-align: center;
  font-weight: bold;
  color: #64748b;
  width: 40px;
}
.venue-name {
  font-weight: bold;
  white-space: nowrap;
}
.venue-no {
  display: inline-block;
  width: 24px;
  height: 24px;
  line-height: 24px;
  text-align: center;
  background: #334155;
  color: white;
  border-radius: 4px;
  font-size: 11px;
  margin-right: 4px;
}
.race-count {
  text-align: right;
  font-size: 12px;
  color: #475569;
}

.rate-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 80px;
}
.rate-val {
  font-weight: bold;
  font-size: 13px;
  min-width: 42px;
  text-align: right;
}
.rate-bar {
  flex: 1;
  height: 6px;
  background: #e2e8f0;
  border-radius: 3px;
  overflow: hidden;
  min-width: 40px;
}
.rate-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}
.rate-fill.top1 { background: #3b82f6; }
.rate-fill.partial { background: #8b5cf6; }
.rate-fill.perfect { background: #22c55e; }
.rate-fill.trifecta { background: #f59e0b; }

/* 凡例 */
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
  padding: 10px 14px;
  background: #f8fafc;
  border-radius: 8px;
  font-size: 12px;
  color: #475569;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.dot.top1 { background: #3b82f6; }
.dot.partial { background: #8b5cf6; }
.dot.perfect { background: #22c55e; }
.dot.trifecta { background: #f59e0b; }
</style>