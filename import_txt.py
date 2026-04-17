#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extracted_txt/ フォルダの K*.TXT ファイルを SQLite DB にインポートするスクリプト
対象テーブル: レース情報, 出走表, レース結果, 払い戻し
"""

import re
import sqlite3
import os
import sys
import glob
from datetime import datetime

# ─── 設定 ───────────────────────────────────────────────────
TXT_DIR = os.path.join(os.path.dirname(__file__), 'extracted_txt')
DB_PATH = os.path.join(os.path.dirname(__file__), 'boatrace.db')

# 会場コード → 会場番号（整数）マッピング
VENUE_CODE_TO_NUM = {
    '01': 1, '02': 2, '03': 3, '04': 4, '05': 5, '06': 6,
    '07': 7, '08': 8, '09': 9, '10': 10, '11': 11, '12': 12,
    '13': 13, '14': 14, '15': 15, '16': 16, '17': 17, '18': 18,
    '19': 19, '20': 20, '21': 21, '22': 22, '23': 23, '24': 24,
}

# 天候テキスト → 番号
WEATHER_MAP = {'晴': 1, '曇': 2, '雨': 3, '雪': 4, '霧': 5}

# 風向きテキスト → 番号（16方位 + 無風）
WIND_DIR_MAP = {
    '無風': 0, '北': 1, '北北東': 2, '北東': 3, '東北東': 4,
    '東': 5, '東南東': 6, '南東': 7, '南南東': 8,
    '南': 9, '南南西': 10, '南西': 11, '西南西': 12,
    '西': 13, '西北西': 14, '北西': 15, '北北西': 16,
}

# 払い戻し種別テキスト → DB保存名
PAYOUT_TYPE_MAP = {
    '単勝': '単勝', '複勝': '複勝',
    '２連単': '2連単', '２連複': '2連複',
    '拡連複': '拡連複',
    '３連単': '3連単', '３連複': '3連複',
}

# ─── DB初期化 ────────────────────────────────────────────────
def init_db(conn):
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS レース情報 (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            日付          TEXT NOT NULL,
            会場番号      INTEGER NOT NULL,
            会場名        TEXT,
            レース番号    INTEGER NOT NULL,
            締切時刻      TEXT,
            日目          TEXT,
            グレード名    TEXT,
            グレード番号  INTEGER,
            レース名      TEXT,
            サブタイトル  TEXT,
            距離          INTEGER,
            取得日時      TEXT DEFAULT (datetime('now','localtime')),
            UNIQUE(日付, 会場番号, レース番号)
        );

        CREATE TABLE IF NOT EXISTS 出走表 (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            日付                TEXT NOT NULL,
            会場番号            INTEGER NOT NULL,
            会場名              TEXT,
            レース番号          INTEGER NOT NULL,
            艇番                INTEGER NOT NULL,
            選手名              TEXT,
            選手番号            INTEGER,
            級別番号            INTEGER,
            支部番号            INTEGER,
            出身地番号          INTEGER,
            年齢                INTEGER,
            体重                REAL,
            F数                 INTEGER,
            L数                 INTEGER,
            平均ST              REAL,
            全国1着率           REAL,
            全国2着率           REAL,
            全国3着率           REAL,
            当地1着率           REAL,
            当地2着率           REAL,
            当地3着率           REAL,
            モーター番号        INTEGER,
            モーター2着率       REAL,
            モーター3着率       REAL,
            ボート番号          INTEGER,
            ボート2着率         REAL,
            ボート3着率         REAL,
            取得日時            TEXT DEFAULT (datetime('now','localtime')),
            UNIQUE(日付, 会場番号, レース番号, 艇番)
        );

        CREATE TABLE IF NOT EXISTS 直前情報 (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            日付                TEXT NOT NULL,
            会場番号            INTEGER NOT NULL,
            会場名              TEXT,
            レース番号          INTEGER NOT NULL,
            風速                INTEGER,
            風向き番号          INTEGER,
            波高                INTEGER,
            天候番号            INTEGER,
            気温                INTEGER,
            水温                INTEGER,
            艇番                INTEGER NOT NULL,
            コース番号          INTEGER,
            スタートST          REAL,
            体重                REAL,
            体重調整            REAL,
            展示タイム          REAL,
            チルト調整          REAL,
            取得日時            TEXT DEFAULT (datetime('now','localtime')),
            UNIQUE(日付, 会場番号, レース番号, 艇番)
        );

        CREATE TABLE IF NOT EXISTS レース結果 (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            日付                TEXT NOT NULL,
            会場番号            INTEGER NOT NULL,
            会場名              TEXT,
            レース番号          INTEGER NOT NULL,
            風速                INTEGER,
            風向き番号          INTEGER,
            波高                INTEGER,
            天候番号            INTEGER,
            気温                INTEGER,
            水温                INTEGER,
            決まり手番号        INTEGER,
            艇番                INTEGER NOT NULL,
            コース番号          INTEGER,
            スタートST          REAL,
            着順                INTEGER,
            選手番号            INTEGER,
            選手名              TEXT,
            取得日時            TEXT DEFAULT (datetime('now','localtime')),
            UNIQUE(日付, 会場番号, レース番号, 艇番)
        );

        CREATE TABLE IF NOT EXISTS 払い戻し (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            日付          TEXT NOT NULL,
            会場番号      INTEGER NOT NULL,
            会場名        TEXT,
            レース番号    INTEGER NOT NULL,
            種別          TEXT NOT NULL,
            組み合わせ    TEXT NOT NULL,
            金額          INTEGER,
            取得日時      TEXT DEFAULT (datetime('now','localtime')),
            UNIQUE(日付, 会場番号, レース番号, 種別, 組み合わせ)
        );
    ''')
    conn.commit()


# ─── TXTパーサー ─────────────────────────────────────────────
def parse_race_header(line):
    """
    '   1R       予　選　　　                 H1800m  晴　  風  北　　 7m  波　  6cm'
    → (race_no, race_name, dist, weather_no, wind_dir_no, wind_speed, wave_height)
    """
    m = re.match(r'\s+(\d{1,2})R\s+(.*?)\s+H(\d+)m\s+(\S+)\s+風\s+([\S\s]{1,6}?)\s+(\d+)m\s+波\s+(\d+)cm', line)
    if not m:
        return None
    race_no   = int(m.group(1))
    race_name = m.group(2).replace('\u3000', '').strip()
    dist      = int(m.group(3))
    weather   = m.group(4).replace('\u3000', '').strip()
    wind_dir  = m.group(5).replace('\u3000', '').strip()
    wind_spd  = int(m.group(6))
    wave      = int(m.group(7))
    weather_no  = WEATHER_MAP.get(weather, None)
    wind_dir_no = WIND_DIR_MAP.get(wind_dir, None)
    return race_no, race_name, dist, weather_no, wind_dir_no, wind_spd, wave


def parse_result_row(line):
    """
    '  01  3 2778 河　内　正　一　 21   15  6.68   2    0.08     1.49.3'
    → (rank_int, teiban, toban, name, motor, boat, tenji, course, st_float, rank_raw)
    rank_raw: 着順の文字列（'01','F','L'等）
    """
    # 行頭パターン: 着順(2) 艇番(1) 登番(4) 選手名 モーター ボート 展示 進入 ST タイム
    m = re.match(
        r'  ([\dFfLlKk妨失]{1,2})\s{1,3}(\d)\s(\d{4})\s(.{8,16}?)\s{1,3}(\d{1,3})\s{1,4}(\d{1,3})\s{1,3}([\d.]+)\s{1,4}(\d)\s+(F?L?[\d.]+)\s',
        line
    )
    if not m:
        return None

    rank_raw = m.group(1).strip()
    teiban   = int(m.group(2))
    toban    = int(m.group(3))
    name     = m.group(4).replace('\u3000', '').strip()
    motor    = int(m.group(5))
    boat     = int(m.group(6))
    tenji    = float(m.group(7))
    course   = int(m.group(8))
    st_str   = m.group(9).strip()

    # 着順を整数に変換（F/L/失格は99）
    if rank_raw.isdigit():
        rank_int = int(rank_raw)
    else:
        rank_int = 99  # F/L/失格等

    # ST を浮動小数点に
    st_clean = re.sub(r'^[FfLl]', '', st_str)
    try:
        st_float = float(st_clean)
    except ValueError:
        st_float = None

    return rank_int, teiban, toban, name, motor, boat, tenji, course, st_float, rank_raw


def parse_payout_line(line, race_no, last_type):
    """
    '        ２連単   3-4        760  人気     1 '
    '                 1-3        370  人気     8 '   ← 前の種別が継続
    '        単勝     '                             ← 未発売
    '        複勝        特払い   70          '      ← 特払い
    → list of (race_no, payout_type, combo, amount)
    """
    results = []

    # 種別付きの行
    type_match = re.match(r'\s+(２連単|２連複|３連単|３連複|単勝|複勝|拡連複)\s+(.*)', line)
    if type_match:
        ptype_raw = type_match.group(1)
        rest      = type_match.group(2)
        ptype     = PAYOUT_TYPE_MAP.get(ptype_raw, ptype_raw)
    elif last_type and re.match(r'\s{17}(\S)', line):
        # 継続行（前の種別）
        ptype = last_type
        rest  = line.strip()
    else:
        return results, last_type

    # 特払い
    special = re.search(r'特払い\s+(\d+)', rest)
    if special:
        results.append((race_no, ptype, '特払い', int(special.group(1))))
        return results, ptype

    # 通常払い: 組み合わせ  金額  人気  X
    pays = re.findall(r'([\d-]+)\s+(\d+)\s+人気', rest)
    for combo, amount in pays:
        results.append((race_no, ptype, combo, int(amount)))

    # 単勝だけ金額が「人気」なしのケースもある
    if not pays:
        m = re.search(r'([\d-]+)\s+(\d+)', rest)
        if m:
            results.append((race_no, ptype, m.group(1), int(m.group(2))))

    return results, ptype


def parse_date_line(line):
    """
    '   第 4日          2005/ 1/ 1                             大　村　競艇場'
    → (date_str '20050101', day_text '第4日', venue_name '大村')
    """
    m = re.search(r'第\s*(\d+)日\s+(\d{4})/\s*(\d{1,2})/\s*(\d{1,2})', line)
    if not m:
        return None, None, None
    day_no    = m.group(1)
    yyyy, mm, dd = m.group(2), m.group(3).zfill(2), m.group(4).zfill(2)
    date_str  = f'{yyyy}{mm}{dd}'
    day_text  = f'第{day_no}日'
    # 会場名を抽出（2つのフォーマットに対応）
    # 旧形式: 「大　村　競艇場」→「大村」
    # 新形式: 「ボートレース大　村」→「大村」
    vm = re.search(r'([^\x00-\x7F\s][\S\u3000]*?)\u3000*競艇場', line)
    if vm:
        venue_name = vm.group(1).replace('\u3000', '').strip()
    else:
        # ボートレースXX形式
        vm2 = re.search(r'ボートレース([^\x00-\x7F\s][\S\u3000]*)', line)
        if vm2:
            venue_name = vm2.group(1).replace('\u3000', '').strip()
        else:
            venue_name = None
    return date_str, day_text, venue_name


def parse_txt_file(filepath):
    """
    1つのTXTファイルを解析して、以下のリストを返す:
    - race_info_rows
    - shutsuba_rows
    - result_rows
    - payout_rows
    """
    with open(filepath, 'rb') as f:
        text = f.read().decode('cp932', errors='replace')

    lines = text.split('\n')

    race_info_rows = []
    shutsuba_rows  = []
    result_rows    = []
    payout_rows    = []

    venue_no   = None
    venue_name = None
    date_str   = None
    day_text   = None
    race_no    = None
    race_name  = None
    dist       = None
    weather_no = None
    wind_dir_no = None
    wind_speed  = None
    wave_height = None

    state = 'SEEK_VENUE'  # SEEK_VENUE / IN_VENUE / IN_RACE / IN_PAYOUT
    last_payout_type = None
    in_result_section = False

    for line in lines:
        line_stripped = line.rstrip('\r\n')

        # ── 会場開始 ─────────────────────────────
        m_bgn = re.match(r'^(\d{2})KBGN', line_stripped)
        if m_bgn:
            venue_code = m_bgn.group(1)
            venue_no   = VENUE_CODE_TO_NUM.get(venue_code)
            state      = 'IN_VENUE'
            date_str   = None
            race_no    = None
            in_result_section = False
            continue

        # ── 会場終了 ─────────────────────────────
        if re.match(r'^\d{2}KEND', line_stripped):
            state = 'SEEK_VENUE'
            continue

        if state not in ('IN_VENUE', 'IN_RACE', 'IN_PAYOUT'):
            continue

        # ── 日付・会場名行 ───────────────────────
        # 旧形式: 「大村競艇場」/ 新形式: 「ボートレース大村」
        if date_str is None and ('競艇場' in line_stripped or 'ボートレース' in line_stripped) and re.search(r'\d{4}/', line_stripped):
            date_str, day_text, vname = parse_date_line(line_stripped)
            if vname:
                venue_name = vname
            continue

        # ── レースヘッダー行 ─────────────────────
        m_race = re.match(r'\s+(\d{1,2})R\s', line_stripped)
        if m_race and 'H' in line_stripped and 'm' in line_stripped:
            parsed = parse_race_header(line_stripped)
            if parsed and date_str and venue_no:
                race_no, race_name, dist, weather_no, wind_dir_no, wind_speed, wave_height = parsed
                in_result_section = False
                last_payout_type  = None
                state             = 'IN_RACE'
                # レース情報を追加
                race_info_rows.append((
                    date_str, venue_no, venue_name, race_no,
                    None,  # 締切時刻
                    day_text, None, None,  # グレード名, グレード番号
                    race_name, None, dist,  # サブタイトル
                ))
            continue

        # ── 区切り線（結果行開始の合図） ─────────
        if re.match(r'^-{30,}', line_stripped):
            in_result_section = True
            continue

        # ── 結果行 ───────────────────────────────
        if in_result_section and state == 'IN_RACE' and race_no and date_str and venue_no:
            parsed_r = parse_result_row(line_stripped)
            if parsed_r:
                rank_int, teiban, toban, name, motor, boat, tenji, course, st_float, rank_raw = parsed_r
                result_rows.append((
                    date_str, venue_no, venue_name, race_no,
                    wind_speed, wind_dir_no, wave_height, weather_no,
                    None, None,  # 気温, 水温 （TXTには含まれない）
                    None,        # 決まり手番号
                    teiban, course, st_float, rank_int, toban, name,
                ))
                # 出走表（モーター・ボート・展示タイムも格納）
                shutsuba_rows.append((
                    date_str, venue_no, venue_name, race_no, teiban, name, toban,
                    None, None, None, None, None,  # 級別, 支部, 出身地, 年齢, 体重
                    None, None, None,               # F数, L数, 平均ST
                    None, None, None, None, None, None,  # 全国率, 当地率
                    motor, None, None,              # モーター番号, モーター率
                    boat, None, None,               # ボート番号, ボート率
                ))
                continue

        # ── 空行で結果セクション終了 → 払い戻しへ ─
        if in_result_section and line_stripped.strip() == '':
            in_result_section = False
            state = 'IN_PAYOUT'
            continue

        # ── 払い戻し行 ───────────────────────────
        if state == 'IN_PAYOUT' and race_no and date_str and venue_no:
            if re.match(r'\s+(単勝|複勝|２連単|２連複|拡連複|３連単|３連複)', line_stripped) or \
               (last_payout_type and re.match(r'\s{17}\S', line_stripped)):
                pays, last_payout_type = parse_payout_line(line_stripped, race_no, last_payout_type)
                for _, ptype, combo, amount in pays:
                    payout_rows.append((date_str, venue_no, venue_name, race_no, ptype, combo, amount))
            # 2つ連続した空行でレース払い戻しが終了（次レース or 会場終了）
            elif line_stripped.strip() == '':
                state = 'IN_VENUE'
                last_payout_type = None

    return race_info_rows, shutsuba_rows, result_rows, payout_rows


# ─── DB挿入 ──────────────────────────────────────────────────
def insert_data(conn, race_info_rows, shutsuba_rows, result_rows, payout_rows):
    cur = conn.cursor()

    cur.executemany('''
        INSERT OR IGNORE INTO レース情報
        (日付, 会場番号, 会場名, レース番号, 締切時刻, 日目, グレード名, グレード番号, レース名, サブタイトル, 距離)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ''', race_info_rows)

    cur.executemany('''
        INSERT OR IGNORE INTO 出走表
        (日付, 会場番号, 会場名, レース番号, 艇番, 選手名, 選手番号,
         級別番号, 支部番号, 出身地番号, 年齢, 体重, F数, L数, 平均ST,
         全国1着率, 全国2着率, 全国3着率, 当地1着率, 当地2着率, 当地3着率,
         モーター番号, モーター2着率, モーター3着率, ボート番号, ボート2着率, ボート3着率)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ''', shutsuba_rows)

    cur.executemany('''
        INSERT OR IGNORE INTO レース結果
        (日付, 会場番号, 会場名, レース番号, 風速, 風向き番号, 波高, 天候番号,
         気温, 水温, 決まり手番号, 艇番, コース番号, スタートST, 着順, 選手番号, 選手名)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ''', result_rows)

    cur.executemany('''
        INSERT OR IGNORE INTO 払い戻し
        (日付, 会場番号, 会場名, レース番号, 種別, 組み合わせ, 金額)
        VALUES (?,?,?,?,?,?,?)
    ''', payout_rows)

    conn.commit()
    return len(race_info_rows), len(shutsuba_rows), len(result_rows), len(payout_rows)


# ─── メイン ──────────────────────────────────────────────────
def main():
    conn = sqlite3.connect(DB_PATH)
    init_db(conn)

    txt_files = sorted(glob.glob(os.path.join(TXT_DIR, 'K*.TXT')))
    total = len(txt_files)
    print(f'対象ファイル: {total}件')

    total_ri = total_sh = total_rs = total_py = 0
    errors = []

    for i, fpath in enumerate(txt_files, 1):
        try:
            ri, sh, rs, py = parse_txt_file(fpath)
            n_ri, n_sh, n_rs, n_py = insert_data(conn, ri, sh, rs, py)
            total_ri += n_ri
            total_sh += n_sh
            total_rs += n_rs
            total_py += n_py
        except Exception as e:
            errors.append((fpath, str(e)))

        if i % 500 == 0 or i == total:
            print(f'  [{i}/{total}] レース情報:{total_ri} 出走表:{total_sh} 結果:{total_rs} 払戻:{total_py}')

    conn.close()

    print('\n=== 完了 ===')
    print(f'レース情報  : {total_ri:,}件')
    print(f'出走表      : {total_sh:,}件')
    print(f'レース結果  : {total_rs:,}件')
    print(f'払い戻し    : {total_py:,}件')
    if errors:
        print(f'\nエラー ({len(errors)}件):')
        for f, e in errors[:10]:
            print(f'  {os.path.basename(f)}: {e}')


if __name__ == '__main__':
    main()
