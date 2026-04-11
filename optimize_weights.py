"""
競艇予想スコアの重み最適化スクリプト
3月分の過去データで各要素の重みを最適化し、的中率80%超を目指す

評価指標:
- 1着的中率: スコア1位が実際に1着になった割合
- 3着以内的中率: スコア上位3艇が実際の3着以内にすべて入った割合
- TOP3一致率: スコア上位3艇のうち実際に3着以内に入った艇数の平均
"""
import sqlite3
import itertools
from collections import defaultdict

conn = sqlite3.connect('boatrace.db')
conn.row_factory = sqlite3.Row

# ===== データ読み込み =====
# 結果がある全レースを取得
races_query = """
SELECT DISTINCT r.日付, r.会場番号, r.レース番号
FROM レース結果 r
WHERE r.着順 IS NOT NULL
ORDER BY r.日付, r.会場番号, r.レース番号
"""
race_keys = conn.execute(races_query).fetchall()
print(f"レース数: {len(race_keys)}")

# 全データをメモリに読み込み（高速化）
print("データ読み込み中...")

# 出走表
entry_map = {}
for row in conn.execute("SELECT * FROM 出走表").fetchall():
    key = (row['日付'], row['会場番号'], row['レース番号'], row['艇番'])
    entry_map[key] = dict(row)

# 直前情報
preview_map = {}
for row in conn.execute("SELECT * FROM 直前情報").fetchall():
    key = (row['日付'], row['会場番号'], row['レース番号'], row['艇番'])
    preview_map[key] = dict(row)

# レース結果
result_map = {}
for row in conn.execute("SELECT * FROM レース結果").fetchall():
    key = (row['日付'], row['会場番号'], row['レース番号'], row['艇番'])
    result_map[key] = dict(row)

# レース情報（グレード）
race_info_map = {}
for row in conn.execute("SELECT * FROM レース情報").fetchall():
    key = (row['日付'], row['会場番号'], row['レース番号'])
    race_info_map[key] = dict(row)

# 今節成績（同じ会場の過去3日間の成績）を事前計算
print("今節成績を計算中...")
# 選手 × 会場 × 日付 → その日までの成績
def calc_session_results():
    """同一会場での過去成績を計算"""
    # 選手ごとに会場・日付ベースで成績を集計
    player_venue_results = defaultdict(list)  # (選手番号, 会場番号) -> [(日付, 着順), ...]

    for key, res in result_map.items():
        日付, 会場番号, _, _ = key
        if res['選手番号'] and res['着順']:
            player_venue_results[(res['選手番号'], 会場番号)].append(
                (日付, res['着順'])
            )

    # ソート
    for k in player_venue_results:
        player_venue_results[k].sort()

    return player_venue_results

player_venue_results = calc_session_results()

def get_session_stats(player_no, venue_no, target_date):
    """指定日より前の同一会場での今節成績を取得"""
    results = player_venue_results.get((player_no, venue_no), [])
    recent = [r for d, r in results if d < target_date]
    if not recent:
        return None, None  # 着順平均, レース数
    return sum(recent) / len(recent), len(recent)

print("今節成績計算完了")

# ===== コース別基礎勝率（実データから算出） =====
COURSE_WIN_RATE = {1: 0.559, 2: 0.142, 3: 0.128, 4: 0.098, 5: 0.054, 6: 0.019}
COURSE_TOP3_RATE = {1: 0.812, 2: 0.592, 3: 0.562, 4: 0.460, 5: 0.382, 6: 0.195}

# 級別基礎勝率
GRADE_WIN_RATE = {1: 0.270, 2: 0.179, 3: 0.103, 4: 0.048}
GRADE_TOP3_RATE = {1: 0.632, 2: 0.532, 3: 0.392, 4: 0.189}

def calc_score(entry, preview, result_weather, session_avg, session_count, weights, race_boats_preview):
    """各艇のスコアを算出"""
    w = weights

    # コース番号（直前情報があればそれ、なければ結果のコース番号、なければ艇番）
    course = None
    if preview and preview.get('コース番号'):
        course = preview['コース番号']
    elif result_weather and result_weather.get('コース番号'):
        course = result_weather['コース番号']
    else:
        course = entry['艇番']

    # --- コース補正（最重要: 実データの勝率ベース） ---
    course_score = COURSE_WIN_RATE.get(course, 0.1) * w['course']

    # --- 級別補正 ---
    grade = entry.get('級別番号', 3)
    grade_score = GRADE_WIN_RATE.get(grade, 0.1) * w['grade']

    # --- 全国1着率 ---
    nat_win = (entry.get('全国1着率') or 0) / 100.0
    nat_score = nat_win * w['nat_win']

    # --- 当地1着率 ---
    local_win = (entry.get('当地1着率') or 0) / 100.0
    local_score = local_win * w['local_win']

    # --- モーター2着率（実データでは影響小さい → 軽め） ---
    motor = (entry.get('モーター2着率') or 0) / 100.0
    motor_score = motor * w['motor']

    # --- ボート2着率 ---
    boat = (entry.get('ボート2着率') or 0) / 100.0
    boat_score = boat * w['boat']

    # --- 平均ST（低いほど良い） ---
    avg_st = entry.get('平均ST') or 0.18
    st_score = (0.20 - avg_st) * w['st']  # 0.15 → +0.05 * w

    # --- 展示タイム（レース内での相対順位） ---
    time_score = 0
    if preview and preview.get('展示タイム') and preview['展示タイム'] > 0:
        all_times = [p.get('展示タイム', 0) for p in race_boats_preview if p.get('展示タイム') and p['展示タイム'] > 0]
        if all_times:
            fastest = min(all_times)
            time_score = (fastest - preview['展示タイム']) * w['exhibit_time']  # 遅いほどマイナス

    # --- 展示ST ---
    exhibit_st_score = 0
    if preview and preview.get('スタートST') is not None:
        exhibit_st = preview['スタートST']
        exhibit_st_score = (0.20 - exhibit_st) * w['exhibit_st']

    # --- F数ペナルティ（F持ちはスタート控えめになる） ---
    f_count = entry.get('F数') or 0
    f_penalty = f_count * w['f_penalty']

    # --- 今節成績 ---
    session_score = 0
    if session_avg is not None and session_count and session_count >= 1:
        # 着順平均が低いほど良い（1着平均=1.0、6着平均=6.0）
        session_score = (3.5 - session_avg) * w['session']  # 3.5が基準

    # --- 波高によるコース補正（荒れるとインが弱くなる） ---
    wave_mod = 0
    if result_weather:
        wave = result_weather.get('波高') or 0
        if wave >= 7 and course == 1:
            wave_mod = -w['wave_penalty']  # インの不利
        elif wave >= 7 and course >= 4:
            wave_mod = w['wave_penalty'] * 0.3  # 外の微有利

    total = (course_score + grade_score + nat_score + local_score +
             motor_score + boat_score + st_score + time_score +
             exhibit_st_score - f_penalty + session_score + wave_mod)

    return total

def evaluate_weights(weights, race_keys_subset=None):
    """指定重みでの的中率を評価"""
    keys = race_keys_subset or race_keys

    win_correct = 0   # 1着的中
    top3_match = 0    # 上位3艇完全一致
    top3_partial = 0  # 上位3艇中の一致数合計
    total_races = 0

    for rk in keys:
        日付 = rk['日付']
        会場 = rk['会場番号']
        rno = rk['レース番号']

        race_key = (日付, 会場, rno)

        # 6艇のデータを集める
        boats = []
        for lane in range(1, 7):
            bkey = (日付, 会場, rno, lane)
            entry = entry_map.get(bkey)
            preview = preview_map.get(bkey)
            result = result_map.get(bkey)

            if not entry or not result or result.get('着順') is None:
                break
            boats.append((entry, preview, result))

        if len(boats) != 6:
            continue

        total_races += 1

        # 直前情報をまとめる（展示タイム相対評価用）
        race_previews = [b[1] for b in boats if b[1]]

        # スコア算出
        scores = []
        for entry, preview, result in boats:
            # 今節成績
            session_avg, session_count = get_session_stats(
                entry['選手番号'], 会場, 日付
            )

            score = calc_score(
                entry, preview, result, session_avg, session_count,
                weights, race_previews
            )
            scores.append((entry['艇番'], score, result['着順']))

        # スコア順にソート
        scores.sort(key=lambda x: -x[1])
        predicted_top = [s[0] for s in scores[:3]]

        # 実際の着順
        actual_top = [s[0] for s in sorted(scores, key=lambda x: x[2])[:3]]

        # 1着的中
        if scores[0][0] == actual_top[0]:
            win_correct += 1

        # 3着以内の一致数
        match_count = len(set(predicted_top) & set(actual_top))
        top3_partial += match_count
        if match_count == 3:
            top3_match += 1

    if total_races == 0:
        return {'win_rate': 0, 'top3_perfect': 0, 'top3_avg': 0, 'total': 0}

    return {
        'win_rate': win_correct / total_races,
        'top3_perfect': top3_match / total_races,
        'top3_avg': top3_partial / (total_races * 3),
        'total': total_races,
    }

# ===== グリッドサーチで最適化 =====
print("\n=== 重み最適化開始 ===")

# ベースラインの重み
baseline = {
    'course': 10.0,    # コース
    'grade': 5.0,      # 級別
    'nat_win': 8.0,    # 全国1着率
    'local_win': 4.0,  # 当地1着率
    'motor': 0.5,      # モーター2着率（影響小）
    'boat': 0.3,       # ボート2着率（影響小）
    'st': 30.0,        # 平均ST
    'exhibit_time': 20.0,  # 展示タイム差
    'exhibit_st': 15.0,    # 展示ST
    'f_penalty': 0.5,      # Fペナルティ
    'session': 1.0,        # 今節成績
    'wave_penalty': 1.0,   # 波高補正
}

# ベースライン評価
r = evaluate_weights(baseline)
print(f"\nベースライン: 1着的中{r['win_rate']:.1%} 三連複{r['top3_perfect']:.1%} TOP3平均{r['top3_avg']:.1%} ({r['total']}レース)")

# 各パラメータの感度分析
print("\n=== 感度分析 ===")
for param in baseline:
    original = baseline[param]
    best_val = original
    best_score = r['top3_avg']

    for mult in [0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 5.0]:
        test_w = baseline.copy()
        test_w[param] = original * mult
        result = evaluate_weights(test_w)
        combined = result['win_rate'] * 0.4 + result['top3_avg'] * 0.6  # 加重平均
        if combined > best_score:
            best_score = combined
            best_val = original * mult

    print(f"  {param}: {original} → 最適 {best_val:.2f} (score: {best_score:.4f})")
    baseline[param] = best_val

# 最適化後の評価
r2 = evaluate_weights(baseline)
print(f"\n感度分析後: 1着的中{r2['win_rate']:.1%} 三連複{r2['top3_perfect']:.1%} TOP3平均{r2['top3_avg']:.1%}")

# さらにコースの重みを細かく調整
print("\n=== コース重みの詳細最適化 ===")
best_course = baseline['course']
best_combined = 0
for cv in range(5, 30):
    test_w = baseline.copy()
    test_w['course'] = cv
    result = evaluate_weights(test_w)
    combined = result['win_rate'] * 0.4 + result['top3_avg'] * 0.6
    if combined > best_combined:
        best_combined = combined
        best_course = cv
        print(f"  course={cv}: 1着{result['win_rate']:.1%} TOP3avg{result['top3_avg']:.1%} combined={combined:.4f}")

baseline['course'] = best_course

# 全国1着率の詳細最適化
print("\n=== 全国1着率の詳細最適化 ===")
best_nat = baseline['nat_win']
best_combined = 0
for nv in range(2, 25):
    test_w = baseline.copy()
    test_w['nat_win'] = nv
    result = evaluate_weights(test_w)
    combined = result['win_rate'] * 0.4 + result['top3_avg'] * 0.6
    if combined > best_combined:
        best_combined = combined
        best_nat = nv
        print(f"  nat_win={nv}: 1着{result['win_rate']:.1%} TOP3avg{result['top3_avg']:.1%} combined={combined:.4f}")

baseline['nat_win'] = best_nat

# STの詳細最適化
print("\n=== STの詳細最適化 ===")
best_st = baseline['st']
best_combined = 0
for sv in range(5, 60, 5):
    test_w = baseline.copy()
    test_w['st'] = sv
    result = evaluate_weights(test_w)
    combined = result['win_rate'] * 0.4 + result['top3_avg'] * 0.6
    if combined > best_combined:
        best_combined = combined
        best_st = sv
        print(f"  st={sv}: 1着{result['win_rate']:.1%} TOP3avg{result['top3_avg']:.1%} combined={combined:.4f}")

baseline['st'] = best_st

# 展示タイムの詳細最適化
print("\n=== 展示タイムの詳細最適化 ===")
best_et = baseline['exhibit_time']
best_combined = 0
for ev in range(0, 60, 5):
    test_w = baseline.copy()
    test_w['exhibit_time'] = ev
    result = evaluate_weights(test_w)
    combined = result['win_rate'] * 0.4 + result['top3_avg'] * 0.6
    if combined > best_combined:
        best_combined = combined
        best_et = ev
        print(f"  exhibit_time={ev}: 1着{result['win_rate']:.1%} TOP3avg{result['top3_avg']:.1%} combined={combined:.4f}")

baseline['exhibit_time'] = best_et

# 最終結果
print("\n" + "="*60)
print("最終最適化重み:")
for k, v in baseline.items():
    print(f"  {k}: {v}")

r_final = evaluate_weights(baseline)
print(f"\n最終結果: 1着的中{r_final['win_rate']:.1%} 三連複{r_final['top3_perfect']:.1%} TOP3平均一致率{r_final['top3_avg']:.1%} ({r_final['total']}レース)")

# TOP3の着順ごとの的中詳細
print("\n=== 着順ごとの詳細的中率 ===")
win_correct = 0
place2_correct = 0
place3_correct = 0
top3_in_actual_top3 = [0, 0, 0]  # スコア1位/2位/3位が実際のTOP3に入った率
total = 0

for rk in race_keys:
    日付 = rk['日付']
    会場 = rk['会場番号']
    rno = rk['レース番号']

    boats = []
    for lane in range(1, 7):
        bkey = (日付, 会場, rno, lane)
        entry = entry_map.get(bkey)
        preview = preview_map.get(bkey)
        result = result_map.get(bkey)
        if not entry or not result or result.get('着順') is None:
            break
        boats.append((entry, preview, result))

    if len(boats) != 6:
        continue
    total += 1

    race_previews = [b[1] for b in boats if b[1]]
    scores = []
    for entry, preview, result in boats:
        session_avg, session_count = get_session_stats(entry['選手番号'], 会場, 日付)
        score = calc_score(entry, preview, result, session_avg, session_count, baseline, race_previews)
        scores.append((entry['艇番'], score, result['着順']))

    scores.sort(key=lambda x: -x[1])
    actual_top3 = set(s[0] for s in sorted(scores, key=lambda x: x[2])[:3])

    if scores[0][2] == 1: win_correct += 1
    if scores[1][2] <= 2: place2_correct += 1
    if scores[2][2] <= 3: place3_correct += 1

    for i in range(3):
        if scores[i][0] in actual_top3:
            top3_in_actual_top3[i] += 1

print(f"スコア1位 → 実際1着: {win_correct/total:.1%}")
print(f"スコア2位 → 実際2着以内: {place2_correct/total:.1%}")
print(f"スコア3位 → 実際3着以内: {place3_correct/total:.1%}")
print(f"スコア1位がTOP3入り: {top3_in_actual_top3[0]/total:.1%}")
print(f"スコア2位がTOP3入り: {top3_in_actual_top3[1]/total:.1%}")
print(f"スコア3位がTOP3入り: {top3_in_actual_top3[2]/total:.1%}")

conn.close()
