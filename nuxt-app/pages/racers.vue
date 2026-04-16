<template>
  <div class="page">
    <h1 class="page-title">選手検索</h1>

    <div class="filter-bar">
      <div>
        <label>選手名 または 登録番号</label>
        <input
          type="text"
          v-model="query"
          placeholder="例: 西川 または 4016"
          @keyup.enter="search"
          style="width: 200px"
        />
      </div>
      <button class="search-btn" @click="search">検索</button>
    </div>

    <div v-if="pending" class="loading">検索中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="searched && racers.length === 0" class="empty">
      該当する選手が見つかりません
    </div>

    <div v-if="racers.length > 0" class="card">
      <div class="card-header">
        <span>検索結果 {{ racers.length }}件</span>
      </div>
      <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>登録番号</th>
            <th>選手名</th>
            <th>性別</th>
            <th>デビュー年</th>
            <th>級別</th>
            <th>年齢</th>
            <th>体重</th>
            <th>全国勝率</th>
            <th>全国2着率</th>
            <th>当地勝率</th>
            <th>当地2着率</th>
            <th>出走回数</th>
            <th>最終出走日</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in racers"
            :key="r.選手番号"
            @click="selectRacer(r)"
            class="racer-row"
            :class="{ 'row-selected': selectedRacer?.選手番号 === r.選手番号 }"
          >
            <td>{{ r.選手番号 }}</td>
            <td style="text-align: left; font-weight: 700">{{ r.選手名 }}</td>
            <td>
              <span :class="r.性別 === 2 ? 'gender-f' : 'gender-m'">
                {{ r.性別 === 2 ? '女性' : '男性' }}
              </span>
            </td>
            <td>{{ debutYear(r.養成期) }}</td>
            <td>{{ GRADE[r.級別番号] || r.級別番号 }}</td>
            <td>{{ r.年齢 }}</td>
            <td>{{ r.体重 }}</td>
            <td>{{ fmt2(r.全国勝率) }}</td>
            <td>{{ fmt2(r.全国2着率) }}</td>
            <td>{{ fmt2(r.当地勝率) }}</td>
            <td>{{ fmt2(r.当地2着率) }}</td>
            <td>{{ r.出走回数 }}</td>
            <td>{{ r.最終出走日 }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    </div>

    <!-- 選手分析カード -->
    <div v-if="selectedRacer" class="card analysis-card">
      <div class="card-header">
        <span>{{ selectedRacer.選手名 }}（{{ selectedRacer.選手番号 }}）の選手分析</span>
        <div class="year-selector">
          <label>集計期間</label>
          <select v-model="analysisYears" @change="fetchAnalysis">
            <option :value="1">1年</option>
            <option :value="2">2年</option>
            <option :value="3">3年</option>
            <option :value="5">5年</option>
            <option :value="10">10年</option>
          </select>
        </div>
      </div>

      <div v-if="analysisPending" class="loading">分析中...</div>
      <div v-else-if="!analysis || !analysis.found" class="empty">
        CSVデータなし（登録番号: {{ selectedRacer.選手番号 }}）
      </div>
      <template v-else>
        <!-- タイプラベル -->
        <div class="label-row">
          <span
            v-for="label in analysis.profile.labels"
            :key="label"
            class="type-badge"
            :class="badgeClass(label)"
          >{{ label }}</span>
        </div>

        <!-- 強み・弱み -->
        <div class="strength-weakness">
          <div class="sw-col">
            <div class="sw-title strength-title">💪 強み</div>
            <ul v-if="analysis.profile.strengths.length">
              <li v-for="s in analysis.profile.strengths" :key="s">{{ s }}</li>
            </ul>
            <div v-else class="sw-none">特になし</div>
          </div>
          <div class="sw-col">
            <div class="sw-title weakness-title">⚠️ 弱み</div>
            <ul v-if="analysis.profile.weaknesses.length">
              <li v-for="w in analysis.profile.weaknesses" :key="w">{{ w }}</li>
            </ul>
            <div v-else class="sw-none">特になし</div>
          </div>
        </div>

        <!-- コース別成績テーブル（集計値） -->
        <div class="section-title">📊 コース別成績（{{ analysisYears }}年加重平均）</div>
        <div class="table-scroll">
        <table class="data-table course-table">
          <thead>
            <tr>
              <th>コース</th>
              <th>進入回数</th>
              <th>複勝率</th>
              <th>平均ST</th>
              <th>評価</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in analysis.summary.courses"
              :key="c.コース"
              :class="courseRowClass(c.コース)"
            >
              <td class="course-no">{{ c.コース }}C</td>
              <td class="text-right">{{ c.entries }}回</td>
              <td>
                <div class="rate-bar-cell">
                  <span class="rate-num" :style="{ color: rateColor(c.rate) }">{{ c.rate }}%</span>
                  <div class="mini-bar">
                    <div class="mini-fill" :style="{ width: Math.min(c.rate, 100) + '%', background: rateColor(c.rate) }"></div>
                  </div>
                </div>
              </td>
              <td :style="{ color: stColor(c.st) }">{{ c.st > 0 ? c.st.toFixed(3) : '-' }}</td>
              <td>
                <span v-if="analysis.profile.bestCourses.includes(c.コース)" class="eval-badge best">得意</span>
                <span v-else-if="analysis.profile.worstCourses.includes(c.コース)" class="eval-badge worst">苦手</span>
                <span v-else class="eval-badge normal">普通</span>
              </td>
            </tr>
          </tbody>
        </table>
        </div>

        <!-- 年別推移 -->
        <div class="section-title">📈 期別推移（{{ analysisYears }}年分）</div>
        <div class="yearly-scroll">
          <div class="table-scroll">
          <table class="data-table yearly-table">
            <thead>
              <tr>
                <th>期</th>
                <th v-for="c in [1,2,3,4,5,6]" :key="c">{{ c }}C複勝率</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="y in analysis.yearly" :key="y.label">
                <td class="period-label">{{ y.label }}</td>
                <td
                  v-for="cs in y.courses"
                  :key="cs.コース"
                  :style="{ color: rateColor(cs.複勝率) }"
                >
                  {{ cs.進入 >= 3 ? cs.複勝率 + '%' : '-' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        </div>
      </template>
    </div>

    <!-- 選択した選手の直近レース履歴 -->
    <div v-if="selectedRacer" class="card" style="margin-top: 16px">
      <div class="card-header">
        <span
          >{{ selectedRacer.選手名 }}（{{
            selectedRacer.選手番号
          }}）の直近出走</span
        >
      </div>
      <div v-if="historyPending" class="loading">読み込み中...</div>
      <div v-else class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>日付</th>
            <th>会場</th>
            <th>R</th>
            <th>艇番</th>
            <th>着順</th>
            <th>モーター</th>
            <th>M2着率</th>
            <th>ボート</th>
            <th>B2着率</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="h in history"
            :key="`${h.日付}-${h.会場名}-${h.レース番号}`"
          >
            <td>{{ h.日付 }}</td>
            <td>{{ h.会場名 }}</td>
            <td>{{ h.レース番号 }}</td>
            <td>
              <span :class="`boat-badge boat-${h.艇番}`">{{ h.艇番 }}</span>
            </td>
            <td>
              <span :class="rankClass(h.着順)">{{ fmtRank(h.着順) }}</span>
            </td>
            <td>{{ h.モーター番号 }}</td>
            <td>{{ fmt2(h.モーター2着率) }}</td>
            <td>{{ h.ボート番号 }}</td>
            <td>{{ fmt2(h.ボート2着率) }}</td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
const route = useRoute();

const GRADE: Record<number, string> = { 1: "A1", 2: "A2", 3: "B1", 4: "B2" };
const fmt2 = (v: any) => (v != null ? Number(v).toFixed(2) : "-");

// 養成期 → デビュー年の近似式（養成期90≒2002年, 養成期136≒2025年）
function debutYear(period: number | null) {
  if (!period) return '-';
  return `${Math.round(1957 + period / 2)}年 (${period}期)`;
}

// 着順の表示テキスト（特殊コード統一）
function fmtRank(v: number | null): string {
  if (v == null) return '-';
  if (v === 9)  return '転覆';
  if (v === 10) return '沈没';
  if (v === 11) return '棄権';
  if (v === 12) return '失格';
  if (v === 13) return 'L';
  if (v === 14) return 'F';
  if (v === 15) return '返還';
  if (v === 16) return '欠場';
  return `${v}着`;
}

// 着順バッジのCSSクラス
function rankClass(v: number | null): string {
  if (v == null) return 'rank-none';
  if (v >= 7)   return 'rank-badge rank-sp';
  return `rank-badge rank-${v}`;
}

const query = ref("");
const racers = ref<any[]>([]);
const pending = ref(false);
const error = ref("");
const searched = ref(false);
const selectedRacer = ref<any>(null);
const history = ref<any[]>([]);
const historyPending = ref(false);
const analysis = ref<any>(null);
const analysisPending = ref(false);
const analysisYears = ref(5);

// URLパラメータ ?q=選手番号 で直接開いたとき自動検索
onMounted(async () => {
  const q = route.query.q as string;
  if (q) {
    query.value = q;
    await search();
  }
});

async function search() {
  if (!query.value.trim()) return;
  pending.value = true;
  error.value = "";
  searched.value = false;
  selectedRacer.value = null;
  history.value = [];
  analysis.value = null;
  try {
    racers.value = await $fetch<any[]>(
      `/api/racers?q=${encodeURIComponent(query.value)}`,
    );
    searched.value = true;
    // 1件だけのときは自動選択
    if (racers.value.length === 1) {
      await selectRacer(racers.value[0]);
    }
  } catch (e: any) {
    error.value = e.message;
  } finally {
    pending.value = false;
  }
}

async function selectRacer(racer: any) {
  selectedRacer.value = racer;
  analysis.value = null;
  history.value = [];
  // 分析と履歴を並行取得
  await Promise.all([fetchAnalysis(), fetchHistory(racer.選手番号)]);
}

async function fetchAnalysis() {
  if (!selectedRacer.value) return;
  analysisPending.value = true;
  try {
    analysis.value = await $fetch<any>(
      `/api/racer-analysis?id=${selectedRacer.value.選手番号}&years=${analysisYears.value}`
    );
  } catch {
    analysis.value = null;
  } finally {
    analysisPending.value = false;
  }
}

async function fetchHistory(id: number) {
  historyPending.value = true;
  try {
    history.value = await $fetch<any[]>(`/api/racer-history?id=${id}`);
  } catch {
    history.value = [];
  } finally {
    historyPending.value = false;
  }
}

// バッジの色クラス
function badgeClass(label: string) {
  if (label.includes('イン')) return 'badge-in';
  if (label.includes('まくり') || label.includes('アウト')) return 'badge-out';
  if (label.includes('スタート巧者')) return 'badge-st';
  if (label.includes('上昇')) return 'badge-up';
  if (label.includes('下降')) return 'badge-down';
  if (label.includes('万能')) return 'badge-all';
  return 'badge-normal';
}

// コース別複勝率の色
function rateColor(rate: number) {
  if (rate >= 55) return '#22c55e';
  if (rate >= 40) return '#84cc16';
  if (rate >= 25) return '#eab308';
  if (rate >= 10) return '#f97316';
  return '#ef4444';
}

// ST色
function stColor(st: number) {
  if (st <= 0 || st > 0.5) return '#94a3b8';
  if (st <= 0.145) return '#22c55e';
  if (st <= 0.165) return '#84cc16';
  if (st <= 0.185) return '#eab308';
  return '#ef4444';
}

// コース行クラス
function courseRowClass(c: number) {
  if (!analysis.value?.profile) return '';
  if (analysis.value.profile.bestCourses.includes(c)) return 'row-best';
  if (analysis.value.profile.worstCourses.includes(c)) return 'row-worst';
  return '';
}
</script>

<style scoped lang="scss">
.search-btn {
  background: var(--color-accent);
  color: var(--color-white);
  border: none;
  border-radius: 5px;
  padding: 7px 18px;
  font-size: 13px;
  cursor: pointer;
  align-self: flex-end;
  transition: background 0.15s;
}
.search-btn:hover {
  background: var(--color-primary);
}
.racer-row { cursor: pointer; }
.racer-row:hover td { background: var(--color-secondary-soft) !important; }
.row-selected td { background: #dbeafe !important; }
.gender-m { color: #2563eb; font-weight: 700; font-size: 12px; }
.gender-f { color: #db2777; font-weight: 700; font-size: 12px; }

/* 着順バッジ */
.rank-badge {
  display: inline-block; padding: 2px 7px; border-radius: 4px;
  font-size: 12px; font-weight: 700;
}
.rank-1 { background: #fef9c3; color: #854d0e; border: 1px solid #fcd34d; }
.rank-2 { background: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc; }
.rank-3 { background: #fce7f3; color: #9d174d; border: 1px solid #f9a8d4; }
.rank-4, .rank-5, .rank-6 { background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; }
.rank-sp   { background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; }
.rank-none { color: #94a3b8; font-size: 12px; }

/* 分析カード */
.analysis-card .card-header {
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;
}
.year-selector { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.year-selector label { color: #94a3b8; }
.year-selector select {
  padding: 3px 8px; border: 1px solid #cbd5e1; border-radius: 5px;
  font-size: 12px; background: white;
}

/* タイプバッジ */
.label-row { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px; }
.type-badge {
  padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700;
}
.badge-in      { background: #dbeafe; color: #1d4ed8; }
.badge-out     { background: #fce7f3; color: #be185d; }
.badge-st      { background: #dcfce7; color: #15803d; }
.badge-up      { background: #f0fdf4; color: #16a34a; }
.badge-down    { background: #fef2f2; color: #dc2626; }
.badge-all     { background: #f3e8ff; color: #7c3aed; }
.badge-normal  { background: #f1f5f9; color: #475569; }

/* 強み・弱み */
.strength-weakness {
  display: flex; gap: 16px; padding: 10px 12px; flex-wrap: wrap;
  border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;
}
.sw-col { flex: 1; min-width: 200px; }
.sw-title { font-size: 13px; font-weight: 700; margin-bottom: 6px; }
.strength-title { color: #15803d; }
.weakness-title { color: #b45309; }
.sw-col ul { margin: 0; padding-left: 16px; }
.sw-col li { font-size: 12px; color: #334155; margin-bottom: 3px; }
.sw-none { font-size: 12px; color: #94a3b8; }

/* セクションタイトル */
.section-title { font-size: 13px; font-weight: 700; color: #334155; padding: 10px 12px 4px; }

/* コース別テーブル */
.course-table { margin: 0 0 4px; }
.course-no { font-weight: 700; text-align: center; }
.text-right { text-align: right; }
.rate-bar-cell { display: flex; align-items: center; gap: 6px; }
.rate-num { font-weight: 700; font-size: 13px; min-width: 40px; }
.mini-bar { flex: 1; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
.mini-fill { height: 100%; border-radius: 3px; }
.eval-badge {
  padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;
}
.eval-badge.best   { background: #dcfce7; color: #15803d; }
.eval-badge.worst  { background: #fef2f2; color: #dc2626; }
.eval-badge.normal { background: #f1f5f9; color: #64748b; }
.row-best td  { background: #f0fdf4 !important; }
.row-worst td { background: #fef2f2 !important; }

/* 年別推移 */
.yearly-scroll { overflow-x: auto; padding: 0 0 8px; }
.yearly-table  { min-width: 500px; margin: 0; }
.period-label  { white-space: nowrap; font-size: 12px; color: #64748b; }
</style>
