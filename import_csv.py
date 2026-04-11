#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
csv/ フォルダのファン手帳CSVを SQLite の 選手コース成績・選手プロフィール テーブルに取り込む

使い方:
  python import_csv.py

ファイル名の規則: fan{YY}{MM}.csv
  YY = 西暦年の下2桁（02=2002, 25=2025）
  MM = 算出期間の終了月（04=4月, 10=10月）
"""

import csv
import sqlite3
import os
import re

DB_PATH  = os.path.join(os.path.dirname(__file__), 'boatrace.db')
CSV_DIR  = os.path.join(os.path.dirname(__file__), 'csv')

# ─────────────────────────────────────────
# テーブル初期化
# ─────────────────────────────────────────
def init_table(conn):
    conn.execute('''
        CREATE TABLE IF NOT EXISTS 選手コース成績 (
            選手番号    INTEGER NOT NULL,
            年          INTEGER NOT NULL,
            期終了月    INTEGER NOT NULL,   -- 4=4月期, 10=10月期
            算出期間_自 TEXT,               -- YYYYMMDD
            算出期間_至 TEXT,               -- YYYYMMDD
            -- コース1～6 の成績
            c1進入 INTEGER, c1複勝率 REAL, c1ST REAL,
            c2進入 INTEGER, c2複勝率 REAL, c2ST REAL,
            c3進入 INTEGER, c3複勝率 REAL, c3ST REAL,
            c4進入 INTEGER, c4複勝率 REAL, c4ST REAL,
            c5進入 INTEGER, c5複勝率 REAL, c5ST REAL,
            c6進入 INTEGER, c6複勝率 REAL, c6ST REAL,
            PRIMARY KEY (選手番号, 年, 期終了月)
        )
    ''')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_選手コース成績_番号 ON 選手コース成績 (選手番号)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_選手コース成績_期間 ON 選手コース成績 (算出期間_至)')

    # 選手プロフィール（性別・養成期）
    conn.execute('''
        CREATE TABLE IF NOT EXISTS 選手プロフィール (
            選手番号 INTEGER PRIMARY KEY,
            性別     INTEGER NOT NULL,  -- 1=男性, 2=女性
            養成期   INTEGER NOT NULL   -- XX期生
        )
    ''')
    conn.commit()
    print('テーブル初期化完了')

# ─────────────────────────────────────────
# CSV 1ファイル読み込み
# ─────────────────────────────────────────
def load_csv(conn, filepath, year_2digit, end_month):
    inserted = 0
    skipped  = 0
    with open(filepath, encoding='cp932', newline='') as f:
        reader = csv.DictReader(f)
        rows = []
        for row in reader:
            try:
                def fi(key): return int(row.get(key) or 0)
                def ff(key): return float(row.get(key) or 0)

                rows.append((
                    int(row['登番']),
                    int(row['年']),
                    end_month,
                    row.get('算出期間_自', ''),
                    row.get('算出期間_至', ''),
                    fi('1コース進入回数'), ff('1コース複勝率'), ff('1コース平均ST'),
                    fi('2コース進入回数'), ff('2コース複勝率'), ff('2コース平均ST'),
                    fi('3コース進入回数'), ff('3コース複勝率'), ff('3コース平均ST'),
                    fi('4コース進入回数'), ff('4コース複勝率'), ff('4コース平均ST'),
                    fi('5コース進入回数'), ff('5コース複勝率'), ff('5コース平均ST'),
                    fi('6コース進入回数'), ff('6コース複勝率'), ff('6コース平均ST'),
                ))
                inserted += 1
            except Exception as e:
                skipped += 1

        conn.executemany('''
            INSERT OR REPLACE INTO 選手コース成績 VALUES
            (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ''', rows)

    # 選手プロフィール（同CSVから最新情報で上書き）
    with open(filepath, encoding='cp932', newline='') as f:
        reader = csv.DictReader(f)
        prof_rows = []
        for row in reader:
            try:
                prof_rows.append((
                    int(row['登番']),
                    int(row['性別']),
                    int(row['養成期'] or 0),
                ))
            except Exception:
                pass
        conn.executemany('''
            INSERT OR REPLACE INTO 選手プロフィール VALUES (?,?,?)
        ''', prof_rows)

    return inserted, skipped

# ─────────────────────────────────────────
# メイン
# ─────────────────────────────────────────
def main():
    conn = sqlite3.connect(DB_PATH)
    init_table(conn)

    files = sorted(f for f in os.listdir(CSV_DIR) if re.match(r'fan\d{4}\.csv', f))
    if not files:
        print(f'CSVファイルが見つからんばい: {CSV_DIR}')
        return

    total_in = total_sk = 0
    for fname in files:
        m = re.match(r'fan(\d{2})(\d{2})\.csv', fname)
        if not m:
            continue
        yy        = int(m.group(1))
        end_month = int(m.group(2))
        year      = 2000 + yy  # 02 → 2002, 25 → 2025

        filepath = os.path.join(CSV_DIR, fname)
        n_in, n_sk = load_csv(conn, filepath, year, end_month)
        total_in += n_in
        total_sk += n_sk
        print(f'  {fname} (年={year}, 期終了月={end_month:02d}): {n_in}件 取込 / {n_sk}件 スキップ')

    conn.commit()
    conn.close()
    print(f'\n===完了=== 合計 {total_in} 件取込, {total_sk} 件スキップ')

if __name__ == '__main__':
    main()
