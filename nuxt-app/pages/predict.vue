<template>
  <div class="page">
    <h1 class="page-title">🎯 AI予想</h1>

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
        <select v-model="selectedStadium" @change="onStadiumChange">
          <option v-for="v in venues" :key="v.会場番号" :value="v.会場番号">
            {{ v.会場番号 }}. {{ v.会場名 }}
          </option>
        </select>
      </div>
      <div>
        <label>レース</label>
        <select v-model="selectedRace" @change="fetchPredict">
          <option v-for="n in 12" :key="n" :value="n">{{ n }}R</option>
        </select>
      </div>

      <!-- Note操作セクション（右寄せ） -->
      <div class="filter-bar-note-section">
        <div>
          <label>予想会場</label>
          <select v-model="noteStadium">
            <option v-for="v in venues" :key="v.会場番号" :value="v.会場番号">
              {{ v.会場番号 }}. {{ v.会場名 }}
            </option>
          </select>
        </div>
        <div class="filter-bar-note-buttons">
          <button
            class="note-btn"
            :disabled="noteAllGenerating"
            @click="doGenerateNoteAll"
          >
            {{
              noteAllGenerating ? "⏳ 生成中…" : "📝 全レース予想をNoteに記載"
            }}
          </button>
          <button
            v-if="hasSavedAllNote && !noteAllGenerating"
            class="note-view-btn"
            @click="
              isAllNote = true;
              noteModalOpen = true;
            "
          >
            📄 記載内容を確認
          </button>
        </div>
      </div>
    </div>

    <div v-if="pending" class="loading">予想計算中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="boats.length === 0" class="empty">データがありません</div>

    <template v-if="boats.length > 0">
      <!-- 予想サマリー -->
      <div
        class="summary-card"
        :class="isFinished ? 'card-finished' : ''"
        style="position: relative"
      >
        <!-- 終了マーク -->
        <div v-if="isFinished" class="finished-stamp">終</div>

        <div class="summary-header">
          <span class="summary-title">🏆 予想オーダー</span>
          <span
            v-if="raceInfo.グレード名"
            :class="['grade-badge-lg', `grade-lg-${raceInfo.グレード名}`]"
          >
            {{ raceInfo.グレード名 }}
          </span>
          <span
            v-if="raceInfo.締切時刻"
            class="deadline-badge"
            :class="isFinished ? 'deadline-past' : ''"
          >
            🕐 締切 {{ raceInfo.締切時刻?.slice(11, 16) }}
          </span>
          <span v-if="weather.気温" class="weather-badge">
            🌡{{ weather.気温 }}℃ 💧{{ weather.水温 }}℃ 🌊{{ weather.波高 }}cm
            💨{{ weather.風速 }}m
          </span>
        </div>
        <div v-if="raceInfo.レース名" class="race-name-bar">
          <a
            class="race-title race-title-link"
            :href="`https://boatrace.jp/owpc/pc/race/beforeinfo?hd=${selectedDate.replace(/-/g, '')}&jcd=${String(selectedStadium).padStart(2, '0')}&rno=${selectedRace}`"
            target="_blank"
            rel="noopener noreferrer"
            >{{ raceInfo.レース名 }} 🔗</a
          >
          <span v-if="raceInfo.サブタイトル" class="race-subtitle">{{
            raceInfo.サブタイトル
          }}</span>
        </div>
        <div class="predict-order">
          <div
            v-for="(b, i) in sortedBoats"
            :key="b.艇番"
            class="predict-chip"
            :class="`chip-rank-${b.rank}`"
          >
            <span class="chip-rank-label">{{ i + 1 }}位</span>
            <span :class="`boat-badge boat-${b.艇番}`">{{ b.艇番 }}</span>
            <span class="chip-name">{{ shortName(b.選手名) }}</span>
            <span class="chip-info">{{ b.級別 }} / {{ b.コース番号 }}C</span>
            <span class="chip-score">{{ b.score.toFixed(1) }}pt</span>
          </div>
        </div>

        <!-- 買い目提案 -->
        <div class="bet-section">
          <div class="bet-title">💡 注目買い目</div>
          <div class="bet-list">
            <div
              class="bet-item"
              :class="{ 'bet-hit': raceResult && hitTansho }"
            >
              <span class="bet-item-label">単勝</span>
              <span :class="`boat-badge boat-${sortedBoats[0]?.艇番}`">{{
                sortedBoats[0]?.艇番
              }}</span>
              <span v-if="raceResult && hitTansho" class="hit-badge"
                >🎯 的中</span
              >
            </div>
            <div
              class="bet-item"
              :class="{ 'bet-hit': raceResult && hit2Rentan }"
            >
              <span class="bet-item-label">2連単</span>
              <span :class="`boat-badge boat-${sortedBoats[0]?.艇番}`">{{
                sortedBoats[0]?.艇番
              }}</span>
              <span class="bet-arrow">→</span>
              <span :class="`boat-badge boat-${sortedBoats[1]?.艇番}`">{{
                sortedBoats[1]?.艇番
              }}</span>
              <span v-if="raceResult && hit2Rentan" class="hit-badge"
                >🎯 的中</span
              >
            </div>
            <div
              class="bet-item"
              :class="{ 'bet-hit': raceResult && hit3RentanHonmei }"
            >
              <span class="bet-item-label">3連単（本命）</span>
              <span :class="`boat-badge boat-${sortedBoats[0]?.艇番}`">{{
                sortedBoats[0]?.艇番
              }}</span>
              <span class="bet-arrow">→</span>
              <span :class="`boat-badge boat-${sortedBoats[1]?.艇番}`">{{
                sortedBoats[1]?.艇番
              }}</span>
              <span class="bet-arrow">→</span>
              <span :class="`boat-badge boat-${sortedBoats[2]?.艇番}`">{{
                sortedBoats[2]?.艇番
              }}</span>
              <span v-if="raceResult && hit3RentanHonmei" class="hit-badge"
                >🎯 的中</span
              >
            </div>
            <div
              class="bet-item"
              :class="{ 'bet-hit': raceResult && hit3RentanTaikou }"
            >
              <span class="bet-item-label">3連単（対抗）</span>
              <span :class="`boat-badge boat-${taikouComboBoats[0]?.艇番}`">{{
                taikouComboBoats[0]?.艇番
              }}</span>
              <span class="bet-arrow">→</span>
              <span :class="`boat-badge boat-${taikouComboBoats[1]?.艇番}`">{{
                taikouComboBoats[1]?.艇番
              }}</span>
              <span class="bet-arrow">→</span>
              <span :class="`boat-badge boat-${taikouComboBoats[2]?.艇番}`">{{
                taikouComboBoats[2]?.艇番
              }}</span>
              <span v-if="raceResult && hit3RentanTaikou" class="hit-badge"
                >🎯 的中</span
              >
            </div>
            <div
              v-if="sortedBoats.length >= 4"
              class="bet-item"
              :class="{ 'bet-hit': raceResult && hit3RentanAna }"
            >
              <span class="bet-item-label">3連単（穴）</span>
              <span :class="`boat-badge boat-${sortedBoats[3]?.艇番}`">{{
                sortedBoats[3]?.艇番
              }}</span>
              <span class="bet-arrow">→</span>
              <span :class="`boat-badge boat-${sortedBoats[0]?.艇番}`">{{
                sortedBoats[0]?.艇番
              }}</span>
              <span class="bet-arrow">→</span>
              <span :class="`boat-badge boat-${sortedBoats[1]?.艇番}`">{{
                sortedBoats[1]?.艇番
              }}</span>
              <span v-if="raceResult && hit3RentanAna" class="hit-badge"
                >🎯 的中</span
              >
            </div>
            <div
              v-if="upsetPickBoats.length === 3 && !isSameAsAna"
              class="bet-item bet-item-oozana"
              :class="{ 'bet-hit': raceResult && hit3RentanOozana }"
            >
              <span class="bet-item-label bet-item-label-oozana">💥 3連単（大穴）</span>
              <span :class="`boat-badge boat-${upsetPickBoats[0]}`">{{
                upsetPickBoats[0]
              }}</span>
              <span class="bet-arrow">→</span>
              <span :class="`boat-badge boat-${upsetPickBoats[1]}`">{{
                upsetPickBoats[1]
              }}</span>
              <span class="bet-arrow">→</span>
              <span :class="`boat-badge boat-${upsetPickBoats[2]}`">{{
                upsetPickBoats[2]
              }}</span>
              <span v-if="raceResult && hit3RentanOozana" class="hit-badge"
                >🎯 的中</span
              >
            </div>
          </div>
          <!-- 信頼度コメント -->
          <div class="confidence-note">
            <template v-if="sortedBoats.length >= 2">
              <template v-if="scoreDiff >= 5">
                ✅ 1位と2位の差が大きく（{{
                  scoreDiff.toFixed(1)
                }}pt差）、本命堅い展開が予想されます
              </template>
              <template v-else-if="scoreDiff >= 2">
                ⚠️ 1位と2位が接戦（{{
                  scoreDiff.toFixed(1)
                }}pt差）、2-3着の入れ替わりに注意
              </template>
              <template v-else>
                🔥 上位が僅差（{{
                  scoreDiff.toFixed(1)
                }}pt差）、荒れる可能性あり！
              </template>
            </template>
          </div>

          <!-- ツイート＆Noteボタン -->
          <div class="tweet-section">
            <button class="tweet-btn" @click="doTweet">𝕏 ポストする</button>
            <span
              class="tweet-preview-toggle"
              @click="tweetPreviewOpen = !tweetPreviewOpen"
            >
              {{ tweetPreviewOpen ? "▲ 内容を隠す" : "▼ 投稿内容を確認" }}
            </span>
            <button
              class="note-btn"
              :disabled="noteGenerating"
              @click="doGenerateNote"
            >
              {{ noteGenerating ? "⏳ 生成中…" : "📝 Note に記載" }}
            </button>
            <button
              v-if="hasSavedNote"
              class="note-view-btn"
              @click="openSavedNote"
            >
              📄 記載内容を確認
              <span v-if="savedNoteAt" class="note-saved-at">{{
                savedNoteAt
              }}</span>
            </button>
          </div>
          <div v-if="tweetPreviewOpen" class="tweet-preview">
            <div
              class="tweet-char-count"
              :class="tweetText.length > 140 ? 'over' : 'ok'"
            >
              {{ tweetText.length }} / 140文字
            </div>
            <pre>{{ tweetText }}</pre>
          </div>
        </div>
      </div>

      <!-- レース結果 -->
      <div v-if="isFinished && raceResult" class="card result-card">
        <div class="card-header">🏁 レース結果</div>
        <div class="result-body">
          <!-- 的中した買い目 -->
          <div class="result-hits">
            <template v-if="hitBets.length > 0">
              <div class="result-hits-title">🎯 的中</div>
              <div v-for="h in hitBets" :key="h.label" class="result-hit-item">
                <span class="result-hit-label">{{ h.label }}</span>
                <span class="result-hit-combo">{{ h.combo }}</span>
              </div>
            </template>
            <template v-else>
              <div class="result-hits-title result-miss-title">😢 不的中</div>
            </template>
          </div>
          <!-- 着順 -->
          <ol class="result-order">
            <li
              v-for="b in raceResult.boats"
              :key="b.着順"
              class="result-row"
              :class="`result-rank-${b.着順}`"
            >
              <span class="result-rank-label">{{ b.着順 }}着</span>
              <span :class="`boat-badge boat-${b.艇番}`">{{ b.艇番 }}</span>
              <span class="result-name">{{ shortName(b.選手名) }}</span>
              <span class="result-course">{{ b.コース番号 }}C</span>
              <span
                v-if="b.スタートST != null"
                :class="
                  b.スタートST < 0
                    ? 'st-flying'
                    : b.スタートST <= 0.1
                      ? 'st-fast'
                      : 'result-st'
                "
                >ST {{ b.スタートST.toFixed(2) }}</span
              >
            </li>
          </ol>
          <!-- 配当 -->
          <div v-if="raceResult.payouts.length > 0" class="result-payouts">
            <div
              v-for="p in raceResult.payouts"
              :key="`${p.種別}-${p.組み合わせ}`"
              class="payout-row"
            >
              <span class="payout-type">{{ p.種別 }}</span>
              <span class="payout-combo">{{ p.組み合わせ }}</span>
              <span class="payout-amount">¥{{ p.金額.toLocaleString() }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 大穴警戒パネル -->
      <div
        v-if="upsetAnalysis"
        class="card upset-card"
        :class="`upset-${upsetAnalysis.level}`"
      >
        <div class="upset-header">
          <span class="upset-icon">
            {{
              upsetAnalysis.level === "大穴警戒"
                ? "🚨"
                : upsetAnalysis.level === "波乱含み"
                  ? "⚠️"
                  : upsetAnalysis.level === "やや荒れ"
                    ? "🌊"
                    : "✅"
            }}
          </span>
          <span class="upset-title">大穴分析：{{ upsetAnalysis.level }}</span>
          <div class="upset-meter-wrap">
            <div class="upset-meter-track">
              <div
                class="upset-meter-fill"
                :style="`width:${upsetAnalysis.score}%`"
                :class="`upset-fill-${upsetAnalysis.level}`"
              ></div>
            </div>
            <span class="upset-score-label"
              >{{ upsetAnalysis.score }}pt / 100</span
            >
          </div>
        </div>
        <div v-if="upsetAnalysis.factors.length > 0" class="upset-factors">
          <span
            v-for="f in upsetAnalysis.factors"
            :key="f"
            class="upset-factor-tag"
            >{{ f }}</span
          >
        </div>
        <div v-if="upsetAnalysis.pick" class="upset-pick">
          <span class="upset-pick-label">💥 大穴推奨買い目</span>
          <span class="upset-pick-combo">{{ upsetAnalysis.pick }}</span>
        </div>
        <div v-else-if="upsetAnalysis.score < 30" class="upset-pick">
          <span class="upset-safe-msg">📌 本命から手堅く攻めるレースです</span>
        </div>
      </div>

      <!-- コース別複勝率グラフ -->
      <div
        v-if="hasChartData"
        class="card course-chart-card"
        ref="chartCardRef"
      >
        <div class="card-header">
          📊 今回コース別 複勝率
          <span class="header-sub"
            >※ 複勝率 =
            2・3着以内率。棒グラフは過去5年加重平均、折れ線は各年の担当コース成績</span
          >
          <button class="copy-btn --course" @click="copyChartData">
            {{ copiedChart ? "✅" : "📋" }}
          </button>
        </div>

        <!-- 選手一覧（中央上） -->
        <div class="chart-racer-legend">
          <div v-for="d in barData" :key="d.艇番" class="chart-racer-item">
            <span :class="`boat-badge boat-${d.艇番}`">{{ d.艇番 }}</span>
            <span class="chart-racer-name">{{ d.名前 }}</span>
            <span
              class="chart-racer-meta"
              :style="{ color: boatColor(d.艇番) }"
            >
              {{ d.コース }}C｜{{ d.rate ?? "-" }}%
            </span>
          </div>
        </div>

        <!-- 3列グラフ -->
        <div class="chart-three-col">
          <!-- 左：棒グラフ -->
          <div class="chart-col-item">
            <div class="chart-section-label">
              現在の複勝率（今回担当コース）
            </div>
            <svg
              viewBox="0 0 300 200"
              class="course-svg"
              preserveAspectRatio="xMidYMid meet"
            >
              <rect
                x="44"
                y="10"
                width="246"
                height="164"
                fill="#f8fafc"
                rx="3"
              />
              <line
                v-for="t in [0, 20, 40, 60, 80, 100]"
                :key="t"
                :x1="44"
                :y1="chartY(t)"
                :x2="290"
                :y2="chartY(t)"
                :stroke="t === 0 ? '#94a3b8' : '#e2e8f0'"
                stroke-width="1"
              />
              <text
                v-for="t in [0, 20, 40, 60, 80, 100]"
                :key="'y' + t"
                :x="39"
                :y="chartY(t) + 4"
                text-anchor="end"
                font-size="9"
                fill="#94a3b8"
              >
                {{ t }}%
              </text>
              <g v-for="(d, i) in barData" :key="d.艇番">
                <rect
                  :x="barBX2(i, barData.length) - barBW2(barData.length) / 2"
                  :y="chartY(d.rate ?? 0)"
                  :width="barBW2(barData.length)"
                  :height="chartY(0) - chartY(d.rate ?? 0)"
                  :fill="d.rate ? boatColor(d.艇番) : '#e2e8f0'"
                  rx="3"
                />
                <text
                  v-if="d.rate"
                  :x="barBX2(i, barData.length)"
                  :y="chartY(d.rate) - 4"
                  text-anchor="middle"
                  font-size="10"
                  :fill="boatColor(d.艇番)"
                  font-weight="bold"
                >
                  {{ d.rate }}%
                </text>
                <text
                  :x="barBX2(i, barData.length)"
                  :y="190"
                  text-anchor="middle"
                  font-size="9"
                  fill="#475569"
                >
                  {{ d.艇番 }}({{ d.コース }}C)
                </text>
              </g>
            </svg>
          </div>

          <!-- 中：7年折れ線グラフ -->
          <div class="chart-col-item">
            <div class="chart-section-label">過去7年トレンド（担当コース）</div>
            <svg
              viewBox="0 0 300 200"
              class="course-svg"
              preserveAspectRatio="xMidYMid meet"
            >
              <rect
                x="44"
                y="10"
                width="246"
                height="164"
                fill="#f8fafc"
                rx="3"
              />
              <line
                v-for="t in [0, 20, 40, 60, 80, 100]"
                :key="t"
                x1="44"
                :y1="chartY(t)"
                x2="290"
                :y2="chartY(t)"
                :stroke="t === 0 ? '#94a3b8' : '#e2e8f0'"
                stroke-width="1"
              />
              <text
                v-for="t in [0, 20, 40, 60, 80, 100]"
                :key="'y' + t"
                x="39"
                :y="chartY(t) + 4"
                text-anchor="end"
                font-size="9"
                fill="#94a3b8"
              >
                {{ t }}%
              </text>
              <line
                v-for="(yr, i) in allYearLabels"
                :key="'vg' + i"
                :x1="lineX(i, allYearLabels.length)"
                y1="10"
                :x2="lineX(i, allYearLabels.length)"
                y2="174"
                stroke="#e2e8f0"
                stroke-width="0.5"
                stroke-dasharray="3,3"
              />
              <text
                v-for="(yr, i) in allYearLabels"
                :key="'x' + i"
                :x="lineX(i, allYearLabels.length)"
                y="192"
                text-anchor="middle"
                font-size="9"
                fill="#64748b"
              >
                {{ yr }}
              </text>
              <g v-for="d in chartData" :key="d.艇番">
                <polyline
                  :points="d.points"
                  :stroke="boatColor(d.艇番)"
                  stroke-width="2.5"
                  fill="none"
                  stroke-linejoin="round"
                  stroke-linecap="round"
                />
                <template v-for="(p, i) in d.raw" :key="i">
                  <circle
                    v-if="p !== null"
                    :cx="lineX(i, allYearLabels.length)"
                    :cy="chartY(p)"
                    r="4"
                    :fill="boatColor(d.艇番)"
                    stroke="white"
                    stroke-width="1.5"
                  />
                </template>
              </g>
            </svg>
          </div>

          <!-- 右：大穴要因レーダー -->
          <div class="chart-col-item">
            <div class="chart-section-label">大穴要因レーダー</div>
            <svg
              viewBox="0 0 300 200"
              class="course-svg"
              preserveAspectRatio="xMidYMid meet"
            >
              <polygon
                v-for="(pts, i) in radarGridPolygons"
                :key="'grid' + i"
                :points="pts"
                fill="none"
                :stroke="i === 3 ? '#94a3b8' : '#e2e8f0'"
                stroke-width="1"
              />
              <line
                v-for="ax in radarAxes"
                :key="'ax' + ax.label"
                :x1="radarCx"
                :y1="radarCy"
                :x2="ax.x2"
                :y2="ax.y2"
                stroke="#e2e8f0"
                stroke-width="1"
              />
              <polygon
                :points="radarPolygon"
                fill="rgba(239,68,68,0.2)"
                stroke="#ef4444"
                stroke-width="2"
              />
              <text
                v-for="ax in radarAxes"
                :key="'lbl' + ax.label"
                :x="ax.labelX"
                :y="ax.labelY + 4"
                text-anchor="middle"
                font-size="9"
                fill="#475569"
                font-weight="600"
              >
                {{ ax.label }}
              </text>
              <text
                v-for="ax in radarAxes"
                :key="'val' + ax.label"
                :x="ax.dotX"
                :y="ax.dotY + 3"
                text-anchor="middle"
                font-size="8"
                :fill="ax.score > 0 ? '#ef4444' : '#cbd5e1'"
              >
                {{ ax.score }}
              </text>
            </svg>
          </div>
        </div>
      </div>

      <!-- 艇別スコア詳細 -->
      <div class="card" ref="tableCardRef">
        <div class="card-header">
          <span>艇別スコア詳細</span>
          <span class="header-sub">
            独自のスコアを算出し、予想順位をつけています。
          </span>
          <div class="table-header-actions">
            <button
              class="fetch-preview-btn"
              :disabled="fetchingPreview"
              @click="autoFetchPreview"
            >
              {{ fetchingPreview ? "⏳ 取得中…" : "🌐 直前情報を取得" }}
            </button>
            <span v-if="fetchPreviewMsg" class="fetch-preview-msg">{{
              fetchPreviewMsg
            }}</span>
            <button class="copy-btn" @click="copyTableData">
              {{ copiedTable ? "✅" : "📋" }}
            </button>
          </div>
        </div>

        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>予想順位</th>
                <th>艇</th>
                <th>選手名</th>
                <th>級別</th>
                <th>コース</th>
                <th>全国率</th>
                <th>当地率</th>
                <th>平均ST</th>
                <th>展示T</th>
                <th>展示ST</th>
                <th>体重</th>
                <th>増減</th>
                <th>チルト</th>
                <th>今節</th>
                <th>F</th>
                <th style="min-width: 80px">スコア</th>
                <th style="min-width: 200px">スコア内訳</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="b in courseOrderBoats"
                :key="b.艇番"
                :class="`rank-row rank-${b.rank}`"
              >
                <td>
                  <span
                    class="rank-badge"
                    :class="b.rank <= 3 ? 'rank-mark' : ''"
                  >
                    {{
                      b.rank === 1
                        ? "🥇"
                        : b.rank === 2
                          ? "🥈"
                          : b.rank === 3
                            ? "🥉"
                            : b.rank
                    }}
                  </span>
                </td>
                <td>
                  <span :class="`boat-badge boat-${b.艇番}`">{{ b.艇番 }}</span>
                </td>
                <td
                  style="
                    text-align: left;
                    font-weight: 700;
                    white-space: nowrap;
                  "
                >
                  <NuxtLink
                    :to="`/racers?q=${b.選手番号}`"
                    class="racer-link"
                    >{{ b.選手名 }}</NuxtLink
                  >
                </td>
                <td>
                  <span :class="`grade-badge grade-${b.級別}`">{{
                    b.級別
                  }}</span>
                </td>
                <td>
                  <strong>{{ b.コース番号 }}</strong>
                </td>
                <td>{{ fmt2(b.全国勝率) }}</td>
                <td>{{ fmt2(b.当地勝率) }}</td>
                <td
                  :class="b.平均ST != null && b.平均ST <= 0.14 ? 'st-fast' : ''"
                >
                  {{ b.平均ST != null ? b.平均ST.toFixed(2) : "-" }}
                </td>
                <td :class="b.展示タイム === fastestTime ? 'fastest' : ''">
                  <template v-if="b.展示タイム != null">
                    {{ b.展示タイム.toFixed(2) }}
                  </template>
                  <template v-else>
                    <input
                      class="manual-input"
                      type="text"
                      inputmode="decimal"
                      placeholder="例: 6.78"
                      :tabindex="courseOrderBoats.indexOf(b) * 2 + 1"
                      :value="manualInputs[b.艇番]?.展示タイム ?? ''"
                      @focus="initManualInput(b.艇番)"
                      @keydown.tab="onManualInputTab"
                      @input="(e) => autoFormatManualInput(e, '展示タイム', b.艇番)"
                    />
                  </template>
                </td>
                <td
                  :class="
                    b.スタートST != null && b.スタートST <= 0.1
                      ? 'st-fast'
                      : b.スタートST != null && b.スタートST < 0
                        ? 'st-flying'
                        : ''
                  "
                >
                  <template v-if="b.スタートST != null">
                    {{ b.スタートST.toFixed(2) }}
                  </template>
                  <template v-else>
                    <input
                      class="manual-input"
                      type="text"
                      inputmode="decimal"
                      placeholder="例: 0.15"
                      :tabindex="courseOrderBoats.indexOf(b) * 2 + 2"
                      :value="manualInputs[b.艇番]?.スタートST ?? ''"
                      @focus="initManualInput(b.艇番)"
                      @keydown.tab="onManualInputTab"
                      @input="(e) => autoFormatManualInput(e, 'スタートST', b.艇番)"
                    />
                  </template>
                </td>
                <td>{{ b.体重 != null ? b.体重 + "kg" : "-" }}</td>
                <td
                  :class="
                    b.体重調整 != null && b.体重調整 > 0 ? 'weight-plus' : ''
                  "
                >
                  {{
                    b.体重調整 != null && b.体重調整 !== 0
                      ? (b.体重調整 > 0 ? "+" : "") + b.体重調整
                      : "-"
                  }}
                </td>
                <td>
                  {{ b.チルト調整 != null ? b.チルト調整.toFixed(1) : "-" }}
                </td>
                <td>
                  <template v-if="b.今節レース数 > 0">
                    {{ b.今節成績?.toFixed(1) }}
                    <span class="session-count">({{ b.今節レース数 }}走)</span>
                  </template>
                  <template v-else>-</template>
                </td>
                <td :class="b.F数 > 0 ? 'foul' : ''">{{ b.F数 ?? 0 }}</td>
                <td>
                  <span class="score-value" :class="`score-rank-${b.rank}`">
                    {{ b.score.toFixed(1) }}
                  </span>
                </td>
                <td>
                  <div class="score-bar-wrap">
                    <div
                      class="score-bar"
                      :style="`width:${scoreBarWidth(b.score)}%`"
                      :class="`score-bar-rank-${b.rank}`"
                    ></div>
                  </div>
                  <div class="score-detail-text" v-if="b.scoreDetail">
                    <span class="sd-item sd-course" title="コース点"
                      >C:{{ b.scoreDetail.コース点 }}</span
                    >
                    <span class="sd-item sd-grade" title="級別点"
                      >G:{{ b.scoreDetail.級別点 }}</span
                    >
                    <span class="sd-item" title="全国勝率点"
                      >W:{{ b.scoreDetail.全国勝率点 }}</span
                    >
                    <span class="sd-item" title="当地勝率点"
                      >L:{{ b.scoreDetail.当地勝率点 }}</span
                    >
                    <span class="sd-item" title="ST点"
                      >ST:{{ b.scoreDetail.ST点 }}</span
                    >
                    <span
                      class="sd-item"
                      :class="b.scoreDetail.展示点 < 0 ? 'neg' : ''"
                      title="展示点"
                      >T:{{ b.scoreDetail.展示点 }}</span
                    >
                    <span
                      class="sd-item"
                      v-if="b.scoreDetail.今節点 !== 0"
                      title="今節点"
                      >S:{{ b.scoreDetail.今節点 }}</span
                    >
                    <span
                      class="sd-item neg"
                      v-if="b.scoreDetail.Fペナルティ < 0"
                      title="Fペナルティ"
                      >F:{{ b.scoreDetail.Fペナルティ }}</span
                    >
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- 手動入力がある場合のみ保存ボタンを表示 -->
        <div
          v-if="
            Object.values(manualInputs).some(
              (m) => m.展示タイム !== '' || m.スタートST !== '',
            )
          "
          class="manual-save-bar"
        >
          <span class="manual-save-note"
            >📝 未取得の展示T・展示STを入力しました</span
          >
          <button
            class="manual-save-btn"
            :disabled="manualSaving"
            @click="saveManualAndReload"
          >
            {{ manualSaving ? "⏳ 保存中…" : "💾 保存して再計算" }}
          </button>
        </div>
      </div>

      <!-- 予想の見方ガイド -->
      <div class="guide-card">
        <div class="guide-title">📖 予想の見方</div>
        <span class="guide-title-sub">
          コース(32) + 級別(20) + 展示T(20) + 全国率(14) + ST(30) + 当地率(6)
        </span>
        <div class="guide-body">
          <div class="guide-item">
            <span class="guide-tag tag-c">C</span>
            コース（1コース=55.9%で最重要）
          </div>
          <div class="guide-item">
            <span class="guide-tag tag-g">G</span> 級別（A1≫B2）
          </div>
          <div class="guide-item">
            <span class="guide-tag">W</span> 全国1着率
          </div>
          <div class="guide-item">
            <span class="guide-tag">L</span> 当地1着率
          </div>
          <div class="guide-item">
            <span class="guide-tag">ST</span> 平均スタートタイミング
          </div>
          <div class="guide-item">
            <span class="guide-tag">T</span> 展示タイム（最速との差）
          </div>
          <div class="guide-item">
            <span class="guide-tag">S</span> 今節成績
          </div>
        </div>
      </div>

      <!-- 注意書き -->
      <div class="disclaimer">
        ※ 過去1,518レースでバックテスト済み: 1着的中55.7% / TOP3的中81.4%。
        スコアは参考値であり、実際のレース結果を保証するものではありません。
      </div>
    </template>
  </div>

  <!-- Note記事モーダル -->
  <Teleport to="body">
    <div
      v-if="noteModalOpen"
      class="note-modal-overlay"
      @click.self="noteModalOpen = false"
    >
      <div class="note-modal">
        <div class="note-modal-header">
          <span class="note-modal-title">📝 Claude が書いた Note 記事</span>
          <span
            v-if="allNoteCostJpy !== null && isAllNote"
            class="note-cost-badge"
          >
            💰 約{{ allNoteCostJpy }}円
          </span>
          <div class="note-modal-actions">
            <button
              class="note-copy-btn"
              @click="copyNoteText"
              :disabled="!generatedMarkdown"
            >
              {{ noteCopied ? "✅ コピー済み！" : "📋 全文コピー" }}
            </button>
            <button
              class="note-img-copy-btn"
              @click="copyNoteBodyAsImage"
              :disabled="!generatedMarkdown && allNoteCards.length === 0"
            >
              {{ noteImageCopied ? "✅ 画像コピー済み！" : "🖼 画像コピー" }}
            </button>
            <button
              class="note-close-btn"
              @click="
                noteModalOpen = false;
                isAllNote = false;
              "
            >
              ✕
            </button>
          </div>
        </div>
        <div v-if="!isAllNote" class="note-modal-hint">
          ↑ コピーして Note のエディタにペースト。📸
          の箇所にスクショを挿入してください。
        </div>
        <!-- 生成中 -->
        <div v-if="noteGenerating || noteAllGenerating" class="note-generating">
          <div class="note-spinner"></div>
          <p>Claudeが記事を考えています…</p>
        </div>
        <!-- エラー -->
        <div v-else-if="noteError" class="note-error">⚠️ {{ noteError }}</div>
        <!-- 全レースまとめカード表示 -->
        <div
          v-else-if="isAllNote && allNoteCards.length > 0"
          class="note-modal-body"
        >
          <div class="all-note-header">
            <p class="all-note-title">## 【{{ allNoteDateLabel }}】競艇予想・{{ allNoteVenueName }}レースまとめ</p>
            <p class="all-note-lead">{{ allNoteLead }}</p>
            <p class="all-note-criteria">★評価の基準：★1（波乱含み）、★3（標準）、★5（鉄板・勝負レース）</p>
          </div>
          <div class="race-card-grid">
            <div
              v-for="card in allNoteCards"
              :key="card.raceNo"
              class="race-card"
              :class="card.hitLabel ? 'race-card--hit' : ''"
            >
              <div v-if="card.hitLabel" class="race-card-hit-badge">{{ card.hitLabel }}</div>
              <div class="race-card-header">
                <span class="race-card-num">
                  ●{{ card.raceNo }}R
                  <span v-if="card.gradeName" class="race-card-grade">{{ card.gradeName }}</span>
                </span>
                <span v-if="card.raceName" class="race-card-name">{{ card.raceName }}</span>
              </div>
              <div v-if="card.result" class="race-card-result">{{ card.result }}</div>
              <ul class="race-card-body">
                <li>
                  <span class="bet-label">本命 (◎)</span
                  ><span class="bet-val">{{ card.honmei }}</span>
                </li>
                <li>
                  <span class="bet-label">対抗 (○)</span
                  ><span class="bet-val">{{ card.taikou }}</span>
                </li>
                <li v-if="card.ana">
                  <span class="bet-label">穴　 (▲)</span
                  ><span class="bet-val">{{ card.ana }}</span>
                </li>
                <li v-if="card.oozana">
                  <span class="bet-label">大穴 (×)</span
                  ><span class="bet-val">{{ card.oozana }}</span>
                </li>
                <li>
                  <span class="bet-label">自信度</span
                  ><span class="bet-val stars">{{ card.stars }}</span>
                </li>
              </ul>
              <p class="race-card-comment">{{ card.comment }}</p>
            </div>
          </div>
        </div>
        <!-- 単レース生成済み -->
        <div v-else class="note-modal-body">
          <div class="note-rendered" v-html="renderedMarkdown"></div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, type Ref } from "vue";
import { marked } from "marked";

const { selectedDate, dayOfWeek, isWeekend, isSunday } = useSharedDate();
const { selectedStadium, selectedRace } = useSharedVenue();
const route = useRoute();
const venues = ref<{ 会場番号: number; 会場名: string }[]>([]);
const noteStadium = ref<number>(selectedStadium.value);
const boats = ref<any[]>([]);
const weather = ref<any>({});
const raceInfo = ref<any>({});
const raceResult = ref<{ boats: any[]; payouts: any[] } | null>(null);

// ---- 展示T / 展示ST 手動入力 ----
// { 艇番: { 展示タイム: string, スタートST: string } }
const manualInputs = ref<
  Record<number, { 展示タイム: string; スタートST: string }>
>({});
const manualSaving = ref(false);

// boatsが変わったら入力フィールドをリセット
watch(boats, () => {
  manualInputs.value = {};
});

function initManualInput(艇番: number) {
  if (!manualInputs.value[艇番]) {
    manualInputs.value[艇番] = { 展示タイム: "", スタートST: "" };
  }
}

// 展示T・展示ST 入力欄間のTab循環
function onManualInputTab(e: KeyboardEvent) {
  e.preventDefault();
  const inputs = Array.from(
    document.querySelectorAll<HTMLElement>('.manual-input[tabindex]')
  ).sort((a, b) => Number(a.getAttribute('tabindex')) - Number(b.getAttribute('tabindex')));
  if (inputs.length === 0) return;
  const current = document.activeElement as HTMLElement;
  const idx = inputs.indexOf(current);
  const next = inputs[(idx + 1) % inputs.length];
  next?.focus();
}

// 3桁入力で自動ピリオド挿入（例: "678" → "6.78", "015" → "0.15", "-001" → "-0.01"）
function autoFormatManualInput(
  e: Event,
  field: '展示タイム' | 'スタートST',
  艇番: number
) {
  const input = e.target as HTMLInputElement;
  let val = input.value;
  const isNegative = val.startsWith('-');
  const digits = val.replace(/[^0-9]/g, '');
  if (digits.length === 3) {
    const formatted = (isNegative ? '-' : '') + digits[0] + '.' + digits[1] + digits[2];
    input.value = formatted;
    val = formatted;
  }
  initManualInput(艇番);
  manualInputs.value[艇番][field] = val;
}

// 直前情報をAPIから自動取得してDBに保存→再計算
const fetchingPreview = ref(false);
const fetchPreviewMsg = ref("");

async function autoFetchPreview() {
  fetchingPreview.value = true;
  fetchPreviewMsg.value = "";
  try {
    const res = await $fetch<{
      found: boolean;
      message?: string;
      count?: number;
    }>("/api/fetch-preview", {
      method: "POST",
      body: {
        date: selectedDate.value,
        stadium: selectedStadium.value,
        raceNo: selectedRace.value,
      },
    });
    if (!res.found) {
      fetchPreviewMsg.value = res.message ?? "データなし";
    } else {
      fetchPreviewMsg.value = `✅ ${res.count}艇分の直前情報を取得しました`;
      manualInputs.value = {};
      await fetchPredict();
      setTimeout(() => (fetchPreviewMsg.value = ""), 3000);
    }
  } catch (e: any) {
    fetchPreviewMsg.value = `❌ ${e.data?.message ?? e.message}`;
  } finally {
    fetchingPreview.value = false;
  }
}

async function saveManualAndReload() {
  const entries = boats.value
    .filter((b) => {
      const m = manualInputs.value[b.艇番];
      return m && (m.展示タイム !== "" || m.スタートST !== "");
    })
    .map((b) => {
      const m = manualInputs.value[b.艇番];
      return {
        艇番: b.艇番,
        展示タイム: m?.展示タイム !== "" ? parseFloat(m.展示タイム) : null,
        スタートST: m?.スタートST !== "" ? parseFloat(m.スタートST) : null,
      };
    });
  if (entries.length === 0) return;
  manualSaving.value = true;
  try {
    await $fetch("/api/preview-manual", {
      method: "POST",
      body: {
        date: selectedDate.value,
        stadium: selectedStadium.value,
        raceNo: selectedRace.value,
        boats: entries,
      },
    });
    manualInputs.value = {};
    await fetchPredict();
  } finally {
    manualSaving.value = false;
  }
}
const upsetAnalysis = ref<{
  score: number;
  level: string;
  factors: string[];
  pick: string;
  factorScores?: Record<string, number>;
} | null>(null);
const pending = ref(false);
const error = ref("");

const fmt2 = (v: any) => (v != null ? Number(v).toFixed(2) : "-");
const shortName = (name: string | null) => name?.split(/\s+/)[0] ?? "";

// ---- 締め切り判定 ----
// 締切時刻は "2026-04-01T15:30:00" のフル日時文字列
const isFinished = computed(() => {
  const t = raceInfo.value.締切時刻;
  if (!t) return false;
  return Date.now() > new Date(t).getTime();
});

// ---- Note記事生成（Claude API） ----
const noteModalOpen = ref(false);
const noteCopied = ref(false);
const noteImageCopied = ref(false);
const noteGenerating = ref(false);
const noteAllGenerating = ref(false);
const noteError = ref("");
// 全レースまとめカード用
const isAllNote = ref(false);
const allNoteCards = ref<
  {
    raceNo: number;
    gradeName: string;
    raceName: string;
    honmei: string;
    taikou: string;
    ana: string;
    oozana: string;
    stars: string;
    comment: string;
    hitLabel: string;
    result: string;
  }[]
>([]);
const allNoteLead = ref("");
const allNoteVenueName = ref("");
const allNoteDateLabel = ref("");
const allNoteCostJpy = ref<number | null>(null);
const hasSavedAllNote = ref(false);
const generatedMarkdown = ref("");
const renderedMarkdown = computed(() =>
  generatedMarkdown.value ? marked(generatedMarkdown.value) : "",
);

// 現在のレースに保存済み記事があるか
const hasSavedNote = ref(false);
const savedNoteAt = ref<string | null>(null);

// レース切り替え時にDBから保存済みフラグを確認
watch(
  [selectedDate, selectedStadium, selectedRace],
  async () => {
    if (!selectedStadium.value || !selectedRace.value) return;
    try {
      const res = await $fetch<{ found: boolean; savedAt?: string }>(
        `/api/note-article?date=${selectedDate.value}&stadium=${selectedStadium.value}&raceNo=${selectedRace.value}`,
      );
      hasSavedNote.value = res.found;
      savedNoteAt.value = res.found ? (res.savedAt ?? null) : null;
    } catch {
      hasSavedNote.value = false;
    }
  },
  { immediate: true },
);

// 全レースまとめ保存確認（日付・予想会場が変わるたびに実行）
async function checkSavedAllNote() {
  if (!noteStadium.value) return;
  try {
    const res = await $fetch<{ found: boolean }>(
      `/api/note-article?date=${selectedDate.value}&stadium=${noteStadium.value}&raceNo=0`,
    );
    hasSavedAllNote.value = res.found;
  } catch {
    hasSavedAllNote.value = false;
  }
}
watch([selectedDate, noteStadium], checkSavedAllNote, { immediate: true });

async function saveNoteToStorage(markdown: string) {
  await $fetch("/api/note-article", {
    method: "POST",
    body: {
      date: selectedDate.value,
      stadium: selectedStadium.value,
      raceNo: selectedRace.value,
      markdown,
    },
  });
  hasSavedNote.value = true;
}

async function openSavedNote() {
  try {
    const res = await $fetch<{
      found: boolean;
      markdown?: string;
      savedAt?: string;
    }>(
      `/api/note-article?date=${selectedDate.value}&stadium=${selectedStadium.value}&raceNo=${selectedRace.value}`,
    );
    if (!res.found || !res.markdown) return;
    generatedMarkdown.value = res.markdown;
    savedNoteAt.value = res.savedAt ?? null;
    noteError.value = "";
    noteModalOpen.value = true;
  } catch {}
}

// noteText は generate-note API に移行したため削除

async function doGenerateNote() {
  if (sortedBoats.value.length === 0) return;
  noteGenerating.value = true;
  noteError.value = "";
  generatedMarkdown.value = "";
  isAllNote.value = false;
  allNoteCards.value = [];
  noteModalOpen.value = true;

  const venue =
    venues.value.find((v) => v.会場番号 === noteStadium.value)?.会場名 ?? "";
  const b1 = sortedBoats.value[0],
    b2 = sortedBoats.value[1],
    b3 = sortedBoats.value[2],
    b4 = sortedBoats.value[3];

  try {
    const res = await $fetch<{ markdown: string }>("/api/generate-note", {
      method: "POST",
      body: {
        date: selectedDate.value,
        venue,
        raceNo: selectedRace.value,
        gradeName: raceInfo.value.グレード名 ?? "",
        raceName: raceInfo.value.レース名 ?? "",
        weather: weather.value,
        boats: sortedBoats.value,
        scoreDiff: scoreDiff.value,
        honmei: `${b1.艇番}→${b2.艇番}→${b3?.艇番 ?? "?"}`,
        taikou: (() => {
          const t = taikouComboBoats.value;
          return `${t[0]?.艇番}→${t[1]?.艇番 ?? "?"}→${t[2]?.艇番 ?? "?"}`;
        })(),
        ana: b4 ? `${b4.艇番}→${b1.艇番}→${b2.艇番}` : null,
        oozana:
          !isSameAsAna.value && upsetPickBoats.value.length === 3
            ? upsetPickBoats.value.join("→")
            : null,
        upsetAnalysis: upsetAnalysis.value,
      },
    });
    generatedMarkdown.value = res.markdown;
    await saveNoteToStorage(res.markdown);
  } catch (e: any) {
    noteError.value = e.data?.message ?? e.message ?? "生成に失敗しました";
  } finally {
    noteGenerating.value = false;
  }
}

// ---- 全レースまとめNote生成 ----
async function doGenerateNoteAll() {
  if (!noteStadium.value || !venues.value.length) return;
  const venueName =
    venues.value.find((v) => v.会場番号 === noteStadium.value)?.会場名 ?? "";

  noteAllGenerating.value = true;
  noteError.value = "";
  generatedMarkdown.value = "";
  allNoteCards.value = [];
  isAllNote.value = true;
  noteModalOpen.value = true;

  try {
    // ① レース結果とレースデータを並列取得（どちらもDBのみ・AIなし）
    const [raceResultsRaw, predictResults] = await Promise.all([
      $fetch<any[]>(
        `/api/results?date=${selectedDate.value}&stadium=${noteStadium.value}`
      ).catch(() => [] as any[]),
      Promise.allSettled(
        Array.from({ length: 12 }, (_, i) => i + 1).map((raceNo) =>
          $fetch<{
            weather: any;
            boats: any[];
            raceInfo: any;
            upsetAnalysis: any;
          }>(
            `/api/predict?date=${selectedDate.value}&stadium=${noteStadium.value}&raceNo=${raceNo}`,
          ).then((res) => ({ raceNo, ...res })),
        ),
      ),
    ]);

    const races = predictResults
      .filter(
        (r): r is PromiseFulfilledResult<any> =>
          r.status === "fulfilled" && r.value.boats?.length > 0,
      )
      .map((r) => ({
        raceNo: r.value.raceNo,
        boats: r.value.boats,
        raceInfo: r.value.raceInfo ?? {},
        weather: r.value.weather ?? {},
        upsetAnalysis: r.value.upsetAnalysis ?? null,
      }));

    if (races.length === 0) {
      noteError.value = "取得できたレースデータがありません";
      return;
    }

    // ② 結果マップを作成
    const resultMap: Record<number, number[]> = {};
    for (const r of raceResultsRaw) {
      resultMap[r.raceNo] = r.boats
        .sort((a: any, b: any) => a.着順 - b.着順)
        .map((b: any) => b.艇番);
    }

    // ③ 全レースの結果が揃っているか確認（AIトークン不使用の分岐）
    const allDone = races.length > 0 && races.every(
      (r) => resultMap[r.raceNo]?.length >= 3
    );

    if (allDone) {
      // 全レース終了済み → predict-history からスナップショット予想を取得して的中判定
      const historyData = await $fetch<{ races: any[] }>(
        `/api/predict-history?date=${selectedDate.value}&stadium=${noteStadium.value}`
      ).catch(() => ({ races: [] as any[] }));

      allNoteVenueName.value = venueName;
      allNoteDateLabel.value = selectedDate.value.replace(/-/g, "/");
      allNoteLead.value = "全レース終了！レース結果と的中結果をまとめました。";
      allNoteCostJpy.value = null;

      allNoteCards.value = races.map((race) => {
        const actual = resultMap[race.raceNo];
        const result = actual?.slice(0, 3).join("→") ?? "";

        // スナップショット予想を取得（個別予想ページで表示済みの買い目）
        const histRace = historyData.races?.find((r: any) => r.raceNo === race.raceNo);
        const snap = histRace?.snapshotBets ?? null;
        const honmei = snap?.本命 ?? "";
        const taikou = snap?.対抗 ?? "";
        const ana    = snap?.穴   ?? "";
        const oozana = snap?.大穴 ?? "";

        // 的中判定
        let hitLabel = "";
        if (actual && actual.length >= 3 && snap) {
          const match3 = (bet: string) => {
            const bets = bet ? bet.split("→").map(Number) : [];
            return bets.length >= 3 &&
              bets[0] === actual[0] && bets[1] === actual[1] && bets[2] === actual[2];
          };
          if      (match3(honmei))  hitLabel = "🎯 本命的中！";
          else if (match3(taikou))  hitLabel = "🎯 対抗的中！";
          else if (match3(ana))     hitLabel = "🎯 穴的中！";
          else if (match3(oozana))  hitLabel = "🎯 大穴的中！";
        }

        return {
          raceNo: race.raceNo,
          gradeName: race.raceInfo?.グレード名 ?? "",
          raceName:  race.raceInfo?.レース名 ?? "",
          honmei,
          taikou,
          ana,
          oozana,
          stars:   "",
          comment: snap ? "" : "（予想スナップショットなし）",
          hitLabel,
          result,
        };
      });
      return;
    }

    // ④ レース中または未開催 → 従来どおりAIで予想を生成
    const res = await $fetch<{
      markdown: string;
      cards: any[];
      lead: string;
      venueName: string;
      dateLabel: string;
      costJpy: number;
    }>("/api/generate-note-all", {
      method: "POST",
      body: { date: selectedDate.value, venueName, races },
    });

    generatedMarkdown.value = res.markdown;
    allNoteLead.value = res.lead ?? "";
    allNoteVenueName.value = res.venueName ?? venueName;
    allNoteDateLabel.value = res.dateLabel ?? "";
    allNoteCostJpy.value = res.costJpy ?? null;

    // 的中判定（結果が既に一部出ている場合も対応）
    const cards = res.cards ?? [];
    allNoteCards.value = cards.map((card: any) => {
      const actual = resultMap[card.raceNo];
      let hitLabel = "";
      let result = "";
      if (actual && actual.length >= 3) {
        result = actual.slice(0, 3).join("→");
        const match3 = (bet: string) => {
          const bets = bet ? bet.split("→").map(Number) : [];
          return bets.length >= 3 &&
            bets[0] === actual[0] && bets[1] === actual[1] && bets[2] === actual[2];
        };
        if      (match3(card.honmei))  hitLabel = "🎯 本命的中！";
        else if (match3(card.taikou))  hitLabel = "🎯 対抗的中！";
        else if (match3(card.ana))     hitLabel = "🎯 穴的中！";
        else if (match3(card.oozana))  hitLabel = "🎯 大穴的中！";
      }
      return { ...card, hitLabel, result };
    });

    // DBに保存（raceNo=0 を全レースまとめの識別子として使用）
    await $fetch("/api/note-article", {
      method: "POST",
      body: {
        date: selectedDate.value,
        stadium: noteStadium.value,
        raceNo: 0,
        markdown: res.markdown,
      },
    });
    hasSavedAllNote.value = true;
  } catch (e: any) {
    noteError.value = e.data?.message ?? e.message ?? "生成に失敗しました";
  } finally {
    noteAllGenerating.value = false;
  }
}

// ---- note-modal-body を画像としてクリップボードにコピー ----
async function copyNoteBodyAsImage() {
  const el = (document.querySelector(".race-card-grid") ?? document.querySelector(".note-modal-body")) as HTMLElement | null;
  if (!el) return;
  try {
    const html2canvas = (await import("html2canvas")).default;
    const PAD = 20;        // 上左右の余白px
    const PAD_BOTTOM = 40; // 下の余白px

    // 余白付きラッパーを一時的に生成してキャプチャ
    const wrapper = document.createElement("div");
    wrapper.style.cssText = `
      position: fixed; top: -99999px; left: -99999px;
      padding: ${PAD}px ${PAD}px ${PAD_BOTTOM}px ${PAD}px;
      background: #1e2235;
      width: ${el.scrollWidth + PAD * 2}px;
    `;
    const clone = el.cloneNode(true) as HTMLElement;
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    const fullHeight = wrapper.scrollHeight;
    const canvas = await html2canvas(wrapper, {
      backgroundColor: "#1e2235",
      scale: 2,
      scrollY: 0,
      height: fullHeight,
      windowHeight: fullHeight,
    });

    document.body.removeChild(wrapper);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      noteImageCopied.value = true;
      setTimeout(() => {
        noteImageCopied.value = false;
      }, 2500);
    });
  } catch (e) {
    console.error("画像コピー失敗:", e);
  }
}

async function copyNoteText() {
  const text = generatedMarkdown.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    noteCopied.value = true;
    setTimeout(() => {
      noteCopied.value = false;
    }, 2500);
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    noteCopied.value = true;
    setTimeout(() => {
      noteCopied.value = false;
    }, 2500);
  }
}

// ---- ツイート ----
const tweetPreviewOpen = ref(false);

const DAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

const tweetText = computed(() => {
  if (sortedBoats.value.length === 0) return "";
  const top3 = sortedBoats.value.slice(0, 3);
  const b1 = top3[0],
    b2 = top3[1],
    b3 = top3[2];

  const d = new Date(selectedDate.value + "T00:00:00");
  const dateStr = `${d.getMonth() + 1}/${d.getDate()}(${DAY_JA[d.getDay()]})`;
  const venue =
    venues.value.find((v) => v.会場番号 === selectedStadium.value)?.会場名 ??
    "";
  const raceStr = `${selectedRace.value}R`;

  // 選手チップ（名前のみ・コンパクト）
  const chip = (b: any, medal: string) =>
    `${medal}${b.艇番}号${shortName(b.選手名)}`;

  // 信頼度
  const conf =
    scoreDiff.value >= 5
      ? "本命堅い"
      : scoreDiff.value >= 2
        ? "接戦注意"
        : "波乱含み";

  const b4 = sortedBoats.value[3]; // 穴候補（4位）

  // 買い目
  const honmei = `${b1.艇番}→${b2.艇番}→${b3?.艇番 ?? "?"}`; // ◎本命
  const tb1 = taikouComboBoats.value[0],
    tb2 = taikouComboBoats.value[1],
    tb3 = taikouComboBoats.value[2];
  const taikou = `${tb1?.艇番}→${tb2?.艇番 ?? "?"}→${tb3?.艇番 ?? "?"}`; // ○対抗（調子重視）
  const ana = b4 ? `${b4.艇番}→${b1.艇番}→${b2.艇番}` : ""; // △穴（4位が1着）

  const gradeStr = raceInfo.value.グレード名
    ? `[${raceInfo.value.グレード名}]`
    : "";

  const lines = [
    `競艇おじさんAI予想🤖`,
    `${dateStr}${venue}${raceStr}${gradeStr}`,
    `${chip(b1, "🥇")} ${chip(b2, "🥈")} ${b3 ? chip(b3, "🥉") : ""}`,
    `◎${honmei} ○${taikou}${ana ? ` △${ana}` : ""} `,
    `#競艇予想 #ボートレース${venue}`,
  ];

  return lines.join("\n");
});

function doTweet() {
  const url =
    "https://twitter.com/intent/tweet?text=" +
    encodeURIComponent(tweetText.value);
  window.open(url, "_blank", "noopener,noreferrer");
}

const sortedBoats = computed(() =>
  [...boats.value].sort((a, b) => b.score - a.score),
);

// 艇別スコア詳細テーブル用：コース順
const courseOrderBoats = computed(() =>
  [...boats.value].sort((a, b) => a.コース番号 - b.コース番号),
);

// 大穴買い目（常に表示：APIのpickがあればそれを使用、なければ外コース上位軸で計算）
const upsetPickBoats = computed(() => {
  const pick = upsetAnalysis.value?.pick;
  if (pick) return pick.split("→").map(Number);
  // upsetScore < 50 でpickが空の場合も外コース軸で計算して表示
  const outer = [...boats.value]
    .filter((b) => (b.コース番号 ?? 0) >= 4)
    .sort((a, b) => b.score - a.score);
  if (outer.length === 0) return [];
  const axisNo: number = outer[0].艇番;
  const rest = sortedBoats.value.filter((b) => b.艇番 !== axisNo);
  if (rest.length < 2) return [];
  return [axisNo, rest[0].艇番, rest[1].艇番];
});

// 対抗用スコア：1コースを少し減点し、今節調子を重視したランキング
// 対抗スコア計算（コース差なだらか、今節調子・級別・展示を重視）
const TAIKOU_COURSE_SCORE: Record<number, number> = {
  1: 4,
  2: 3.5,
  3: 3,
  4: 2.5,
  5: 2,
  6: 2,
};
const TAIKOU_GRADE_SCORE: Record<string, number> = {
  A1: 8,
  A2: 5,
  B1: 2,
  B2: 0,
};
const taikouSortedBoats = computed(() => {
  const active = boats.value.filter(
    (b) => b.展示タイム != null && b.展示タイム > 0,
  );
  const fastestTime =
    active.length > 0 ? Math.min(...active.map((b) => b.展示タイム)) : null;
  return [...boats.value]
    .map((b) => {
      const courseScore = TAIKOU_COURSE_SCORE[b.コース番号 ?? 6] ?? 2; // C1=4〜C6=2
      const sessionScore = (b.scoreDetail?.今節点 ?? 0) * 3; // 今節調子重視
      const gradeScore = TAIKOU_GRADE_SCORE[b.級別] ?? 0; // 級別
      const exhibitScore =
        fastestTime != null && b.展示タイム > 0
          ? (fastestTime - b.展示タイム) * 15
          : 0; // 展示タイム
      return {
        ...b,
        taikouScore: courseScore + sessionScore + gradeScore + exhibitScore,
      };
    })
    .sort((a, b) => b.taikouScore - a.taikouScore);
});

// 対抗買い目：本命と同じ組み合わせなら4位差し替え
const taikouComboBoats = computed(() => {
  const tb = taikouSortedBoats.value;
  const sb = sortedBoats.value;
  if (tb.length < 3 || sb.length < 3) return tb.slice(0, 3);
  const honmeiKey = `${sb[0]?.艇番}→${sb[1]?.艇番}→${sb[2]?.艇番}`;
  const taikouKey = `${tb[0]?.艇番}→${tb[1]?.艇番}→${tb[2]?.艇番}`;
  if (taikouKey === honmeiKey && tb.length >= 4) {
    return [tb[0], tb[1], tb[3]];
  }
  return tb.slice(0, 3);
});

// 穴と大穴が同じ買い目かどうか判定
const isSameAsAna = computed(() => {
  if (sortedBoats.value.length < 4 || upsetPickBoats.value.length !== 3)
    return false;
  const [o1, o2, o3] = upsetPickBoats.value;
  return (
    o1 === sortedBoats.value[3].艇番 &&
    o2 === sortedBoats.value[0].艇番 &&
    o3 === sortedBoats.value[1].艇番
  );
});

// ---- 的中判定 ----
// raceResult.boats は着順昇順で並んでいる前提
const resultOrder = computed(
  () =>
    raceResult.value?.boats
      .slice()
      .sort((a, b) => a.着順 - b.着順)
      .map((b) => b.艇番) ?? [],
);
const hitTansho = computed(
  () =>
    resultOrder.value.length >= 1 &&
    sortedBoats.value[0]?.艇番 === resultOrder.value[0],
);
const hit2Rentan = computed(
  () =>
    resultOrder.value.length >= 2 &&
    sortedBoats.value[0]?.艇番 === resultOrder.value[0] &&
    sortedBoats.value[1]?.艇番 === resultOrder.value[1],
);
const hit3RentanHonmei = computed(
  () =>
    resultOrder.value.length >= 3 &&
    sortedBoats.value[0]?.艇番 === resultOrder.value[0] &&
    sortedBoats.value[1]?.艇番 === resultOrder.value[1] &&
    sortedBoats.value[2]?.艇番 === resultOrder.value[2],
);
const hit3RentanTaikou = computed(
  () =>
    resultOrder.value.length >= 3 &&
    taikouComboBoats.value[0]?.艇番 === resultOrder.value[0] &&
    taikouComboBoats.value[1]?.艇番 === resultOrder.value[1] &&
    taikouComboBoats.value[2]?.艇番 === resultOrder.value[2],
);
const hit3RentanAna = computed(
  () =>
    resultOrder.value.length >= 3 &&
    sortedBoats.value[3]?.艇番 === resultOrder.value[0] &&
    sortedBoats.value[0]?.艇番 === resultOrder.value[1] &&
    sortedBoats.value[1]?.艇番 === resultOrder.value[2],
);
const hit3RentanOozana = computed(
  () =>
    resultOrder.value.length >= 3 &&
    upsetPickBoats.value.length === 3 &&
    upsetPickBoats.value[0] === resultOrder.value[0] &&
    upsetPickBoats.value[1] === resultOrder.value[1] &&
    upsetPickBoats.value[2] === resultOrder.value[2],
);

// 的中した買い目の一覧
const hitBets = computed(() => {
  if (!raceResult.value) return [];
  const list: { label: string; combo: string }[] = [];
  if (hitTansho.value)
    list.push({ label: "単勝", combo: `${sortedBoats.value[0]?.艇番}` });
  if (hit2Rentan.value)
    list.push({
      label: "2連単",
      combo: `${sortedBoats.value[0]?.艇番}→${sortedBoats.value[1]?.艇番}`,
    });
  if (hit3RentanHonmei.value)
    list.push({
      label: "3連単（本命）",
      combo: `${sortedBoats.value[0]?.艇番}→${sortedBoats.value[1]?.艇番}→${sortedBoats.value[2]?.艇番}`,
    });
  if (hit3RentanTaikou.value)
    list.push({
      label: "3連単（対抗）",
      combo: `${taikouComboBoats.value[0]?.艇番}→${taikouComboBoats.value[1]?.艇番}→${taikouComboBoats.value[2]?.艇番}`,
    });
  if (hit3RentanAna.value)
    list.push({
      label: "3連単（穴）",
      combo: `${sortedBoats.value[3]?.艇番}→${sortedBoats.value[0]?.艇番}→${sortedBoats.value[1]?.艇番}`,
    });
  if (hit3RentanOozana.value)
    list.push({
      label: "3連単（大穴）",
      combo: `${upsetPickBoats.value[0]}→${upsetPickBoats.value[1]}→${upsetPickBoats.value[2]}`,
    });
  return list;
});

const fastestTime = computed(() => {
  const times = boats.value
    .filter((b) => b.展示タイム != null && b.展示タイム > 0)
    .map((b) => b.展示タイム as number);
  return times.length > 0 ? Math.min(...times) : null;
});

// 1位と2位のスコア差
const scoreDiff = computed(() => {
  const s = sortedBoats.value;
  if (s.length < 2) return 0;
  return s[0].score - s[1].score;
});

const maxScore = computed(() =>
  Math.max(...boats.value.map((b) => b.score), 1),
);
const minScore = computed(() =>
  Math.min(...boats.value.map((b) => b.score), 0),
);
const scoreBarWidth = (score: number) => {
  const range = maxScore.value - minScore.value;
  if (range === 0) return 50;
  return Math.round(((score - minScore.value) / range) * 90 + 10);
};

// ---- コース別複勝率グラフ ----
const racerAnalyses = ref<Record<number, any>>({});

// 共通Y軸（両グラフ共有・viewBox 300×210）
const chartY = (r: number) => 10 + (1 - r / 100) * 164;

// 折れ線グラフ用X軸
const lineX = (idx: number, total: number) =>
  total <= 1 ? 167 : 44 + (idx / (total - 1)) * 246;

// 棒グラフ用
const barBW2 = (n: number) => Math.min(38, (246 / Math.max(n, 1)) * 0.65);
const barBX2 = (i: number, n: number) =>
  44 + (i + 0.5) * (246 / Math.max(n, 1));

const BOAT_COLORS: Record<number, string> = {
  1: "#7c8fa0",
  2: "#1e293b",
  3: "#ef4444",
  4: "#3b82f6",
  5: "#ca8a04",
  6: "#16a34a",
};
const boatColor = (n: number) => BOAT_COLORS[n] ?? "#94a3b8";

const hasChartData = computed(
  () => Object.keys(racerAnalyses.value).length > 0,
);

// 全選手の「年」を収集（ソート済み）
const allYearLabels = computed(() => {
  const years = new Set<number>();
  Object.values(racerAnalyses.value).forEach((a: any) => {
    a.yearly?.forEach((y: any) => years.add(y.年));
  });
  return [...years].sort();
});

// 折れ線グラフ用：今回担当コースの複勝率を年別に追う
const chartData = computed(() =>
  sortedBoats.value.map((b) => {
    const a = racerAnalyses.value[b.艇番];
    const yearly: any[] = a?.yearly ?? [];
    const courseNo = b.コース番号 ?? b.艇番;
    const yearMap = new Map<number, { sum: number; count: number }>();
    for (const y of yearly) {
      const c = y.courses.find((x: any) => x.コース === courseNo);
      if (!c || c.進入 < 1) continue;
      const prev = yearMap.get(y.年) ?? { sum: 0, count: 0 };
      yearMap.set(y.年, { sum: prev.sum + c.複勝率, count: prev.count + 1 });
    }
    const labels = allYearLabels.value;
    const raw = labels.map((yr) => {
      const v = yearMap.get(yr);
      return v ? Math.round((v.sum / v.count) * 10) / 10 : null;
    });
    const points = raw
      .map((r, i) =>
        r !== null
          ? `${lineX(i, labels.length).toFixed(1)},${chartY(r).toFixed(1)}`
          : null,
      )
      .filter(Boolean)
      .join(" ");
    return { 艇番: b.艇番, raw, points };
  }),
);

// ===== 大穴要因レーダーチャート =====
const RADAR_FACTORS = [
  { key: "風速", max: 25, label: "風速" },
  { key: "1C級別", max: 25, label: "1C級別" },
  { key: "外A1", max: 18, label: "外A1" },
  { key: "Fペナ", max: 15, label: "Fペナ" },
  { key: "本命不調", max: 10, label: "本命不調" },
  { key: "展示逆転", max: 12, label: "展示逆転" },
  { key: "接戦度", max: 20, label: "接戦度" },
  { key: "波高", max: 20, label: "波高" },
] as const;

const radarCx = 150,
  radarCy = 96,
  radarR = 65;

const radarAxes = computed(() =>
  RADAR_FACTORS.map((f, i) => {
    const angle = -Math.PI / 2 + (i / RADAR_FACTORS.length) * 2 * Math.PI;
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    const score = upsetAnalysis.value?.factorScores?.[f.key] ?? 0;
    const v = Math.min(score / f.max, 1);
    return {
      label: f.label,
      score,
      x2: +(radarCx + radarR * cos).toFixed(1),
      y2: +(radarCy + radarR * sin).toFixed(1),
      labelX: +(radarCx + (radarR + 22) * cos).toFixed(1),
      labelY: +(radarCy + (radarR + 22) * sin).toFixed(1),
      dotX: +(radarCx + (radarR * v + (v > 0 ? 8 : 0)) * cos).toFixed(1),
      dotY: +(radarCy + (radarR * v + (v > 0 ? 8 : 0)) * sin).toFixed(1),
    };
  }),
);

const radarPolygon = computed(() => {
  if (!upsetAnalysis.value?.factorScores) return "";
  return RADAR_FACTORS.map((f, i) => {
    const angle = -Math.PI / 2 + (i / RADAR_FACTORS.length) * 2 * Math.PI;
    const v = Math.min(
      (upsetAnalysis.value!.factorScores![f.key] ?? 0) / f.max,
      1,
    );
    return `${(radarCx + radarR * v * Math.cos(angle)).toFixed(1)},${(radarCy + radarR * v * Math.sin(angle)).toFixed(1)}`;
  }).join(" ");
});

const radarGridPolygons = computed(() =>
  [0.25, 0.5, 0.75, 1.0].map((scale) =>
    RADAR_FACTORS.map((_, i) => {
      const angle = -Math.PI / 2 + (i / RADAR_FACTORS.length) * 2 * Math.PI;
      return `${(radarCx + radarR * scale * Math.cos(angle)).toFixed(1)},${(radarCy + radarR * scale * Math.sin(angle)).toFixed(1)}`;
    }).join(" "),
  ),
);

// 棒グラフ用：今回のコースでの複勝率（過去5年加重平均）
const barData = computed(() =>
  [...boats.value]
    .sort((a, b) => a.コース番号 - b.コース番号)
    .map((b) => {
      const a = racerAnalyses.value[b.艇番];
      const courseNo = b.コース番号 ?? b.艇番;
      const co = a?.summary?.courses?.find((x: any) => x.コース === courseNo);
      return {
        艇番: b.艇番,
        名前: shortName(b.選手名),
        コース: courseNo,
        rate: co && co.entries >= 5 ? co.rate : null,
      };
    }),
);

// 今日の日付かどうか判定（ローカル時刻で比較）
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// 選択中の会場の最初の未終了レースを自動選択
async function autoSelectCurrentRace() {
  try {
    const programs = await $fetch<any[]>(
      `/api/programs?date=${selectedDate.value}&stadium=${selectedStadium.value}`,
    );
    if (!programs || programs.length === 0) return;
    const now = Date.now();
    const unfinished = programs
      .sort((a, b) => a.レース番号 - b.レース番号)
      .find((r) => !r.締切時刻 || new Date(r.締切時刻).getTime() > now);
    if (unfinished) {
      selectedRace.value = unfinished.レース番号;
    } else {
      // 全レース終了済みなら最終レース
      selectedRace.value = programs[programs.length - 1].レース番号;
    }
  } catch {}
}

async function fetchVenues() {
  try {
    const data = await $fetch<{ 会場番号: number; 会場名: string }[]>(
      `/api/venues?date=${selectedDate.value}`,
    );
    venues.value = data;
    if (data.length > 0) {
      // すでに選択済みの会場がリストにあればそのまま維持、なければ先頭を選択
      const alreadyInList = data.some(
        (v) => v.会場番号 === selectedStadium.value,
      );
      if (!alreadyInList) {
        selectedStadium.value = data[0].会場番号;
      }
      // クエリでレース番号が指定されていればそれを優先、なければ未終了レースを自動選択
      const queryRaceNo = route.query.raceNo
        ? Number(route.query.raceNo)
        : null;
      if (queryRaceNo) {
        selectedRace.value = queryRaceNo;
      } else if (selectedDate.value === todayStr()) {
        await autoSelectCurrentRace();
      }
      await fetchPredict();
    } else {
      boats.value = [];
    }
  } catch (e: any) {
    error.value = e.message;
  }
}

async function fetchPredict() {
  if (!selectedStadium.value) return;
  pending.value = true;
  error.value = "";
  racerAnalyses.value = {};
  upsetAnalysis.value = null;
  raceResult.value = null;
  try {
    const res = await $fetch<{
      weather: any;
      boats: any[];
      raceInfo: any;
      upsetAnalysis: any;
    }>(
      `/api/predict?date=${selectedDate.value}&stadium=${selectedStadium.value}&raceNo=${selectedRace.value}`,
    );
    boats.value = res.boats ?? [];
    weather.value = res.weather ?? {};
    raceInfo.value = res.raceInfo ?? {};
    upsetAnalysis.value = res.upsetAnalysis ?? null;

    // 締切済みならレース結果を取得
    const deadline = raceInfo.value.締切時刻;
    if (deadline && new Date(deadline).getTime() < Date.now()) {
      try {
        const results = await $fetch<any[]>(
          `/api/results?date=${selectedDate.value}&stadium=${selectedStadium.value}`,
        );
        const found = results.find((r) => r.raceNo === selectedRace.value);
        raceResult.value = found ?? null;
      } catch {}
    }

    // 選手コース成績を並列取得してグラフに反映
    await Promise.all(
      boats.value.map(async (b) => {
        try {
          const a = await $fetch<any>(
            `/api/racer-analysis?id=${b.選手番号}&years=7`,
          );
          if (a?.found) {
            racerAnalyses.value = { ...racerAnalyses.value, [b.艇番]: a };
          }
        } catch {}
      }),
    );

    // ---- 予想スナップショットを自動保存 ----
    // computed は fetchPredict 完了後に同期的に評価できないため、ここで直接計算する
    if (boats.value.length > 0) {
      try {
        const sb = [...boats.value].sort((a, b) => b.score - a.score);
        const b1 = sb[0],
          b2 = sb[1],
          b3 = sb[2],
          b4 = sb[3];

        const _taikouActive = boats.value.filter(
          (b) => b.展示タイム != null && b.展示タイム > 0,
        );
        const _taikouFastest =
          _taikouActive.length > 0
            ? Math.min(..._taikouActive.map((b) => b.展示タイム))
            : null;
        const _gradeScore: Record<string, number> = {
          A1: 8,
          A2: 5,
          B1: 2,
          B2: 0,
        };
        const _courseScore: Record<number, number> = {
          1: 4,
          2: 3.5,
          3: 3,
          4: 2.5,
          5: 2,
          6: 2,
        };
        const tbFull = [...boats.value]
          .map((b) => ({
            ...b,
            taikouScore:
              (_courseScore[b.コース番号 ?? 6] ?? 2) +
              (b.scoreDetail?.今節点 ?? 0) * 3 +
              (_gradeScore[b.級別] ?? 0) +
              (_taikouFastest != null && b.展示タイム > 0
                ? (_taikouFastest - b.展示タイム) * 15
                : 0),
          }))
          .sort((a, b) => b.taikouScore - a.taikouScore);
        const _honmeiKey =
          b1 && b2 && b3 ? `${b1.艇番}→${b2.艇番}→${b3.艇番}` : "";
        const _taikouKey =
          tbFull[0] && tbFull[1] && tbFull[2]
            ? `${tbFull[0].艇番}→${tbFull[1].艇番}→${tbFull[2].艇番}`
            : "";
        const tb =
          _taikouKey === _honmeiKey && tbFull.length >= 4
            ? [tbFull[0], tbFull[1], tbFull[3]]
            : tbFull.slice(0, 3);

        const outer = [...boats.value]
          .filter((b) => (b.コース番号 ?? 0) >= 4)
          .sort((a, b) => b.score - a.score);
        const upsetPick = upsetAnalysis.value?.pick;
        let oozanaCombo: string | null = null;
        if (upsetPick) {
          oozanaCombo = upsetPick;
        } else if (outer.length > 0) {
          const axisNo = outer[0].艇番;
          const rest = sb.filter((b) => b.艇番 !== axisNo);
          if (rest.length >= 2)
            oozanaCombo = `${axisNo}→${rest[0].艇番}→${rest[1].艇番}`;
        }

        const anaCombo = b4 ? `${b4.艇番}→${b1.艇番}→${b2.艇番}` : null;
        const isSameOozana =
          oozanaCombo &&
          anaCombo &&
          oozanaCombo ===
            `${anaCombo.split("→")[0]}→${anaCombo.split("→")[1]}→${anaCombo.split("→")[2]}`;

        await $fetch("/api/predict-snapshot", {
          method: "POST",
          body: {
            date: selectedDate.value,
            stadium: selectedStadium.value,
            raceNo: selectedRace.value,
            honmei: b1 && b2 && b3 ? `${b1.艇番}→${b2.艇番}→${b3.艇番}` : null,
            taikou:
              tb[0] && tb[1] && tb[2]
                ? `${tb[0].艇番}→${tb[1].艇番}→${tb[2].艇番}`
                : null,
            ana: anaCombo,
            oozana: isSameOozana ? null : oozanaCombo,
            boats: boats.value,
            upsetAnalysis: upsetAnalysis.value,
          },
        });
      } catch {} // スナップショット保存失敗は無視
    }
  } catch (e: any) {
    error.value = e.message;
  } finally {
    pending.value = false;
  }
}

async function onDateChange() {
  boats.value = [];
  selectedStadium.value = null;
  await fetchVenues();
}

async function onStadiumChange() {
  // 今日の日付のときは会場切り替え時も未終了レースを自動選択
  if (selectedDate.value === todayStr()) {
    await autoSelectCurrentRace();
  }
  await fetchPredict();
}

onMounted(fetchVenues);

// ---- クリップボードコピー（スクリーンショット） ----
const chartCardRef = ref<HTMLElement | null>(null);
const tableCardRef = ref<HTMLElement | null>(null);
const copiedChart = ref(false);
const copiedTable = ref(false);

async function captureAndCopy(el: HTMLElement | null, flag: Ref<boolean>) {
  if (!el) return;
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: null,
  });
  canvas.toBlob(async (blob) => {
    if (!blob) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      flag.value = true;
      setTimeout(() => (flag.value = false), 1500);
    } catch {
      // フォールバック：png をダウンロード
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "capture.png";
      a.click();
    }
  }, "image/png");
}

const copyChartData = () => captureAndCopy(chartCardRef.value, copiedChart);
const copyTableData = () => captureAndCopy(tableCardRef.value, copiedTable);
</script>


<style scoped lang="scss">
/* 予想サマリーカード */
.summary-card {
  background: linear-gradient(
    135deg,
    var(--color-primary) 0%,
    var(--color-accent) 100%
  );
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 16px;
  color: var(--color-white);
  box-shadow: 0 4px 16px var(--color-shadow-deep);
}
.summary-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.summary-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.05em;
}
.accuracy-badge {
  font-size: 10px;
  background: var(--color-white-opaque);
  border-radius: 12px;
  padding: 2px 10px;
  border: 1px solid var(--color-white-opaque-strong);
}

/* 締め切りバッジ */
.deadline-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--color-white-opaque-weak);
  border: 1px solid var(--color-white-opaque-strong);
  white-space: nowrap;
}
.deadline-past {
  background: var(--color-error-opaque);
  border-color: var(--color-error);
  text-decoration: line-through;
  opacity: 0.8;
}

/* 終了スタンプ */
.finished-stamp {
  position: absolute;
  top: 14px;
  right: 18px;
  font-size: 30px;
  font-weight: 900;
  color: rgba(231, 76, 60, 0.9);
  border: 3px solid rgba(231, 76, 60, 0.9);
  border-radius: 6px;
  padding: 0 6px;
  line-height: 1.3;
  letter-spacing: 0.05em;
  transform: rotate(8deg);
  pointer-events: none;
}

/* 終了後のカードを少し暗く */
.card-finished {
  opacity: 0.8;
}

.predict-order {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.predict-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  padding: 5px 12px 5px 8px;
  border: 1.5px solid var(--color-white-opaque);
}
.chip-rank-1 {
  background: var(--color-warning-opaque);
  border-color: var(--color-warning);
}
.chip-rank-2 {
  background: rgba(180, 180, 180, 0.25);
  border-color: var(--color-border-soft);
}
.chip-rank-3 {
  background: rgba(160, 82, 45, 0.3);
  border-color: var(--color-bronze);
}
.chip-rank-label {
  font-size: 10px;
  opacity: 0.7;
}
.chip-name {
  font-size: 12px;
  font-weight: 700;
}
.chip-info {
  font-size: 10px;
  opacity: 0.7;
}
.chip-score {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
  font-weight: 700;
}

/* 買い目 */
.bet-section {
  border-top: 1px solid var(--color-white-opaque);
  padding-top: 14px;
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
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 6px 12px;
}
.bet-item-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.75);
  margin-right: 2px;
  white-space: nowrap;
}
.bet-arrow {
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
}
.bet-item-oozana {
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.4);
}
.bet-item-label-oozana {
  color: #fca5a5;
  font-weight: 800;
}

/* 信頼度コメント */
.confidence-note {
  font-size: 11px;
  opacity: 0.85;
  padding-top: 6px;
}

/* ===== 的中マーク ===== */
.bet-hit {
  background: rgba(34, 197, 94, 0.12);
  border-radius: 6px;
  outline: 2px solid #16a34a;
}
.hit-badge {
  margin-left: auto;
  font-size: 12px;
  font-weight: 700;
  color: #16a34a;
  white-space: nowrap;
  animation: hit-pop 0.4s ease;
}
@keyframes hit-pop {
  0%   { transform: scale(0.7); opacity: 0; }
  60%  { transform: scale(1.2); }
  100% { transform: scale(1);   opacity: 1; }
}

/* ===== レース結果 ===== */
.result-card {
  margin-bottom: 16px;
}
.result-body {
  padding: 12px 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
}
.result-hits {
  flex: 0 0 auto;
  min-width: 140px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid #bbf7d0;
  background: #f0fdf4;
  &:has(.result-miss-title) {
    background: #f8fafc;
    border-color: var(--color-border);
  }
}
.result-hits-title {
  font-size: 13px;
  font-weight: 700;
  color: #16a34a;
  margin-bottom: 2px;
}
.result-miss-title {
  color: #94a3b8;
  background: none;
}
.result-hit-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.result-hit-label {
  font-size: 10px;
  color: #64748b;
}
.result-hit-combo {
  font-size: 15px;
  font-weight: 800;
  color: #15803d;
  letter-spacing: 0.05em;
}
.result-order {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 0 0 auto;
}
.result-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  border-radius: 6px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-border);
  font-size: 13px;
  &.result-rank-1 { border-left-color: #f59e0b; }
  &.result-rank-2 { border-left-color: #94a3b8; }
  &.result-rank-3 { border-left-color: #b45309; }
}
.result-rank-label {
  font-weight: 700;
  font-size: 12px;
  color: var(--color-text-muted);
  min-width: 28px;
}
.result-name {
  font-weight: 600;
  min-width: 60px;
}
.result-course {
  font-size: 11px;
  color: var(--color-text-muted);
}
.result-st {
  font-size: 11px;
  color: var(--color-text-muted);
}
.result-payouts {
  display: grid;
  grid-template-columns: auto auto 1fr;
  gap: 4px 12px;
  align-content: start;
  flex: 1 1 260px;
}
.payout-row {
  display: contents;
}
.payout-type {
  font-size: 11px;
  font-weight: 700;
  background: var(--color-primary);
  color: #fff;
  padding: 1px 6px;
  border-radius: 4px;
  text-align: center;
  white-space: nowrap;
  align-self: center;
}
.payout-combo {
  font-size: 13px;
  font-weight: 600;
  align-self: center;
}
.payout-amount {
  font-size: 14px;
  font-weight: 700;
  color: #dc2626;
  align-self: center;
}

/* クリップボードコピーボタン */

.table-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

/* ===== 直前情報 自動取得ボタン ===== */
.fetch-preview-btn {
  padding: 2px 10px;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.15);
  color: inherit;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.25);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
.fetch-preview-msg {
  font-size: 11px;
  font-weight: normal;
  opacity: 0.9;
  white-space: nowrap;
}

/* ===== 展示T・展示ST 手動入力 ===== */
.manual-input {
  width: 72px;
  padding: 2px 4px;
  font-size: 12px;
  border: 1px dashed #f59e0b;
  border-radius: 4px;
  background: #fffbeb;
  color: #92400e;
  text-align: center;
  outline: none;
  &:focus {
    border-color: #d97706;
    background: #fef3c7;
  }
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
  }
}
.manual-save-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: #fffbeb;
  border-top: 1px solid #fde68a;
}
.manual-save-note {
  font-size: 12px;
  color: #92400e;
  flex: 1;
}
.manual-save-btn {
  padding: 5px 16px;
  background: #f59e0b;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  &:hover:not(:disabled) {
    background: #d97706;
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

/* ===== weather / weight / ST ===== */
.weather-badge {
  font-size: 11px;
  background: var(--color-surface-secondary);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 1px 6px;
  white-space: nowrap;
}
.weight-plus {
  color: var(--color-warning-dark);
  font-weight: 700;
}
.st-flying {
  color: var(--color-error);
  font-weight: 700;
}

.copy-btn {
  margin-left: auto;
  padding: 2px 10px;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.15);
  color: inherit;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  &:hover {
    background: rgba(255, 255, 255, 0.25);
  }
}

/* カードヘッダー補足 */
.header-sub {
  font-size: 10px;
  font-weight: normal;
  opacity: 0.7;
  margin-left: 8px;
}

/* ランク行 */
.rank-row.rank-1 td {
  background: var(--color-rank-bg-1);
}
.rank-row.rank-2 td {
  background: var(--color-rank-bg-2);
}
.rank-row.rank-3 td {
  background: var(--color-rank-bg-3);
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
.score-value {
  font-weight: 700;
  font-size: 14px;
}
.score-rank-1 {
  color: var(--color-gold);
}
.score-rank-2 {
  color: var(--color-grey-dark);
}
.score-rank-3 {
  color: var(--color-bronze);
}
.score-bar-wrap {
  background: var(--color-surface-secondary);
  border-radius: 3px;
  height: 6px;
  margin-bottom: 4px;
}
.score-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--color-accent);
  transition: width 0.4s;
}
.score-bar-rank-1 {
  background: var(--color-gold);
}
.score-bar-rank-2 {
  background: var(--color-grey);
}
.score-bar-rank-3 {
  background: var(--color-bronze);
}

/* スコア内訳テキスト */
.score-detail-text {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.sd-item {
  font-size: 10px;
  color: var(--color-muted);
  white-space: nowrap;
  padding: 0 2px;
}
.sd-item.neg {
  color: var(--color-error);
}
.sd-course {
  color: var(--color-primary);
  font-weight: 700;
}
.sd-grade {
  color: var(--color-warning-dark);
  font-weight: 600;
}

/* 今節成績 */
.session-count {
  font-size: 10px;
  color: var(--color-muted);
}

/* 最速展示タイム / ST / F */
.fastest {
  color: var(--color-error);
  font-weight: 700;
}
.st-fast {
  color: var(--color-boat-4);
  font-weight: 700;
}
.foul {
  color: var(--color-error);
  font-weight: 700;
}

.rank-badge {
  font-size: 16px;
}
.rank-mark {
  font-size: 26px;
}

/* 予想の見方ガイド */
.guide-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 14px 16px;
  margin-top: 12px;
}
.guide-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--color-primary);
}
.guide-title-sub {
  font-size: 14px;
  font-weight: normal;
  opacity: 0.8;
  margin: 5px 0;
  display: block;
}
.guide-body {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.guide-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--color-muted);
}
.guide-tag {
  font-size: 10px;
  font-weight: 700;
  background: var(--color-surface-secondary);
  color: var(--color-muted);
  padding: 1px 5px;
  border-radius: 3px;
}
.tag-c {
  background: var(--color-primary);
  color: var(--color-white);
}
.tag-g {
  background: var(--color-surface-warning);
  color: var(--color-warning-dark);
}

/* ツイートボタン */
.tweet-section {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--color-white-opaque);
}
.tweet-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--color-black);
  color: var(--color-white);
  border: none;
  border-radius: 20px;
  padding: 7px 18px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s;
}
.tweet-btn:hover {
  background: rgba(34, 34, 34, 1);
}
.note-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #41c9a0;
  color: #fff;
  border: none;
  border-radius: 20px;
  padding: 7px 18px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s;
}
.note-btn:hover {
  background: #2db389;
}
.note-view-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  color: #41c9a0;
  border: 2px solid #41c9a0;
  border-radius: 20px;
  padding: 5px 16px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  flex-direction: column;
  line-height: 1.2;
  &:hover {
    background: #41c9a0;
    color: #fff;
  }
}
.note-saved-at {
  font-size: 9px;
  font-weight: 400;
  opacity: 0.8;
}

/* Note モーダル */
.note-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.note-modal {
  background: #1e2235;
  border-radius: 14px;
  width: 100%;
  max-width: 680px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}
.note-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}
.note-modal-title {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
}
.note-modal-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.note-copy-btn {
  background: #41c9a0;
  color: #fff;
  border: none;
  border-radius: 16px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}
.note-copy-btn:hover {
  background: #2db389;
}
.note-close-btn {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.note-close-btn:hover {
  background: rgba(255, 255, 255, 0.22);
}
.note-modal-hint {
  font-size: 11px;
  color: #41c9a0;
  padding: 8px 18px;
  background: rgba(65, 201, 160, 0.08);
  flex-shrink: 0;
}
.note-modal-body {
  overflow-y: auto;
  padding: 16px 20px;
  flex: 1;
}
.note-rendered {
  font-size: 13px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.9);
  font-family: "Helvetica Neue", sans-serif;
}
.note-rendered :deep(h1) {
  font-size: 17px;
  font-weight: 800;
  margin: 0 0 14px;
  color: #fff;
  border-bottom: 2px solid #41c9a0;
  padding-bottom: 6px;
}
.note-rendered :deep(h2) {
  font-size: 14px;
  font-weight: 700;
  margin: 18px 0 8px;
  color: #41c9a0;
}
.note-rendered :deep(p) {
  margin: 0 0 10px;
}
.note-rendered :deep(blockquote) {
  border-left: 3px solid #41c9a0;
  padding: 6px 12px;
  margin: 10px 0;
  background: rgba(65, 201, 160, 0.08);
  border-radius: 0 6px 6px 0;
  color: rgba(255, 255, 255, 0.8);
}
.note-rendered :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 10px 0;
  font-size: 12px;
}
.note-rendered :deep(th) {
  background: rgba(65, 201, 160, 0.2);
  color: #41c9a0;
  padding: 6px 10px;
  text-align: left;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.note-rendered :deep(td) {
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.85);
}
.note-rendered :deep(tr:nth-child(even) td) {
  background: rgba(255, 255, 255, 0.04);
}
.note-rendered :deep(ul),
.note-rendered :deep(ol) {
  padding-left: 20px;
  margin: 6px 0 10px;
}
.note-rendered :deep(li) {
  margin-bottom: 4px;
}
.note-rendered :deep(input[type="checkbox"]) {
  margin-right: 6px;
}
.note-rendered :deep(hr) {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  margin: 14px 0;
}
.note-rendered :deep(strong) {
  color: #fff;
  font-weight: 700;
}
.note-rendered :deep(em) {
  color: #94a3b8;
}
.note-generating {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 40px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
}
.note-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(65, 201, 160, 0.3);
  border-top-color: #41c9a0;
  border-radius: 50%;
  animation: note-spin 0.8s linear infinite;
}
@keyframes note-spin {
  to {
    transform: rotate(360deg);
  }
}
.note-error {
  flex: 1;
  padding: 24px 18px;
  color: #f87171;
  font-size: 13px;
  line-height: 1.7;
}
.note-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.tweet-preview-toggle {
  font-size: 11px;
  opacity: 0.7;
  cursor: pointer;
  text-decoration: underline;
}
.tweet-preview {
  background: rgba(0, 0, 0, 0.25);
  border-radius: 8px;
  padding: 12px 14px;
  margin-top: 8px;
}
.tweet-char-count {
  font-size: 11px;
  font-weight: 700;
  text-align: right;
  margin-bottom: 6px;
}
.tweet-char-count.ok {
  color: rgba(255, 255, 255, 0.7);
}
.tweet-char-count.over {
  color: var(--color-danger-soft);
  font-weight: 800;
}
.tweet-preview pre {
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  color: rgba(255, 255, 255, 0.9);
  margin: 0;
  font-family: inherit;
}

/* グレードバッジ（大・サマリーカード内） */
.grade-badge-lg {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: 0.05em;
}
.grade-lg-SG {
  background: #f59e0b;
  color: #1e293b;
}
.grade-lg-G1 {
  background: #ef4444;
  color: white;
}
.grade-lg-G2 {
  background: #3b82f6;
  color: white;
}
.grade-lg-G3 {
  background: #22c55e;
  color: white;
}
.grade-lg-一般 {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

/* レース名バー */
.race-name-bar {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  padding: 4px 0 10px;
  letter-spacing: 0.03em;
}
.race-title {
  font-weight: 700;
  margin-right: 6px;
}
.race-title-link { color: inherit; text-decoration: none; }
.race-title-link:hover { text-decoration: underline; }
.race-subtitle {
  font-size: 11px;
  opacity: 0.75;
}

.racer-link {
  color: inherit;
  text-decoration: none;
}
.racer-link:hover {
  color: #2563eb;
  text-decoration: underline;
}

/* ===== 大穴警戒パネル ===== */
.upset-card {
  margin-bottom: 16px;
  border-left: 6px solid #94a3b8;
  border-radius: 0 8px 8px 0;
  padding: 10px;
}
.upset-大穴警戒 {
  border-left-color: #ef4444;
  background: #fff5f5;
}
.upset-波乱含み {
  border-left-color: #f97316;
  background: #fff7ed;
}
.upset-やや荒れ {
  border-left-color: #eab308;
  background: #fefce8;
}
.upset-本命堅い {
  border-left-color: #22c55e;
  background: #f0fdf4;
}

.upset-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.upset-icon {
  font-size: 20px;
}
.upset-title {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
  min-width: 120px;
}
.upset-meter-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 160px;
}
.upset-meter-track {
  flex: 1;
  height: 10px;
  background: #e2e8f0;
  border-radius: 5px;
  overflow: hidden;
}
.upset-meter-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.5s ease;
}
.upset-fill-大穴警戒 {
  background: #ef4444;
}
.upset-fill-波乱含み {
  background: #f97316;
}
.upset-fill-やや荒れ {
  background: #eab308;
}
.upset-fill-本命堅い {
  background: #22c55e;
}
.upset-score-label {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  white-space: nowrap;
}

.upset-factors {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.upset-factor-tag {
  font-size: 11px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 12px;
  padding: 3px 10px;
  color: #334155;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.upset-pick {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.08);
  border-radius: 8px;
  margin-top: 4px;
}
.upset-pick-label {
  font-size: 12px;
  font-weight: 700;
  color: #dc2626;
  white-space: nowrap;
}
.upset-pick-combo {
  font-size: 18px;
  font-weight: 900;
  color: #dc2626;
  letter-spacing: 0.08em;
}
.upset-safe-msg {
  font-size: 12px;
  color: #16a34a;
  font-weight: 600;
}

/* コース別複勝率グラフ */
.course-chart-card {
  margin-bottom: 16px;
}
.chart-racer-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px 16px;
  margin-bottom: 14px;
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 8px;
}
.chart-racer-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
}
.chart-racer-name {
  color: #334155;
  font-weight: 600;
}
.chart-racer-meta {
  font-size: 11px;
  font-weight: 700;
}
.chart-two-col {
  display: flex;
  gap: 12px;
}
.chart-three-col {
  display: flex;
  gap: 10px;
}
.chart-col-item {
  flex: 1;
  min-width: 0;
}
.chart-section-label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 4px;
  text-align: center;
}
.course-svg {
  width: 100%;
  height: auto;
  display: block;
}
.radar-card {
  margin-bottom: 16px;
}
.radar-svg {
  width: 100%;
  max-width: 300px;
  height: auto;
  display: block;
  margin: 0 auto;
}
.course-chart-note {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid #f1f5f9;
}

.disclaimer {
  font-size: 10px;
  color: #94a3b8;
  text-align: center;
  margin-top: 12px;
}
/* ---- 全レースまとめ Note ---- */
/* コストバッジ */
.note-cost-badge {
  font-size: 11px;
  color: rgba(255,255,255,0.5);
  background: rgba(255,255,255,0.07);
  border-radius: 10px;
  padding: 2px 8px;
}
/* 画像コピーボタン */
.note-img-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: #5b8dee;
  color: #fff;
  border: none;
  border-radius: 16px;
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s;
  &:hover { background: #3a6fd8; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}
/* filter-bar Note セクション */
.filter-bar-note-section {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.filter-bar-note-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
/* 全レースまとめヘッダー */
.all-note-header {
  margin-bottom: 12px;
  padding: 10px 14px;
  background: rgba(65,201,160,0.08);
  border-left: 3px solid #41c9a0;
  border-radius: 4px;
}
.all-note-title {
  font-size: 14px;
  font-weight: 800;
  color: #fff;
  margin: 0 0 4px;
}
.all-note-lead {
  font-size: 12px;
  color: rgba(255,255,255,0.75);
  margin: 0 0 4px;
  line-height: 1.6;
}
.all-note-criteria {
  font-size: 11px;
  color: rgba(255,255,255,0.45);
  margin: 0;
}
/* カードグリッド 4列 */
.race-card-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.race-card {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
  overflow: hidden;
}
.race-card--hit {
  border-color: #f5c542;
  box-shadow: 0 0 8px rgba(245,197,66,0.4);
}
.race-card-hit-badge {
  position: absolute;
  bottom: 6px;
  right: 6px;
  background: #f5c542;
  color: #1e2235;
  font-size: 10px;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 10px;
  white-space: nowrap;
  z-index: 1;
}
.race-card-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  padding-bottom: 6px;
}
.race-card-num  { font-size: 14px; font-weight: 800; color: #41c9a0; display: flex; align-items: center; gap: 4px; }
.race-card-name { font-size: 10px; color: rgba(255,255,255,0.7); }
.race-card-grade { font-size: 9px; background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); border-radius: 4px; padding: 1px 5px; font-weight: 400; }
.race-card-result {
  text-align: center;
  font-size: 13px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 1px;
  padding: 4px 0;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.race-card-body {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.race-card-body li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  gap: 4px;
}
.bet-label { color: rgba(255,255,255,0.5); white-space: nowrap; font-size: 10px; }
.bet-val   { font-weight: 700; color: #fff; font-size: 12px; }
.bet-val.stars { color: #f5c542; letter-spacing: 1px; }
.race-card-comment {
  font-size: 10px;
  color: rgba(255,255,255,0.6);
  line-height: 1.5;
  margin: 0;
  padding-top: 5px;
  border-top: 1px solid rgba(255,255,255,0.08);
  padding-bottom: 20px;
}

</style>
