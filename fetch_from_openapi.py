#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Boatrace Open API から全データを取得して SQLite に保存する

使い方:
  python fetch_from_openapi.py              # 今日のデータ
  python fetch_from_openapi.py 20260331     # 指定日
  python fetch_from_openapi.py 20260301 20260331  # 日付範囲（一括取得）

データソース:
  Hub      : https://boatraceopenapi.github.io/hub/v3/YYYY/YYYYMMDD.json
  Programs : https://boatraceopenapi.github.io/programs/v3/YYYY/YYYYMMDD.json
  Previews : https://boatraceopenapi.github.io/previews/v3/YYYY/YYYYMMDD.json
  Results  : https://boatraceopenapi.github.io/results/v3/YYYY/YYYYMMDD.json
"""

import requests
import sqlite3
import time
import sys
import os
import logging
from datetime import datetime, date, timedelta

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 設定
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DB_PATH   = os.path.join(os.path.dirname(__file__), 'boatrace.db')
SLEEP_SEC = 0.5   # APIへのアクセス間隔

BASE_URLS = {
    'hub':      'https://boatraceopenapi.github.io/hub/v3',
    'programs': 'https://boatraceopenapi.github.io/programs/v3',
    'previews': 'https://boatraceopenapi.github.io/previews/v3',
    'results':  'https://boatraceopenapi.github.io/results/v3',
}

# 会場番号 → 会場名
VENUES = {
    1:'桐生', 2:'戸田',  3:'江戸川', 4:'平和島',  5:'多摩川', 6:'浜名湖',
    7:'蒲郡', 8:'常滑',  9:'津',    10:'三国',   11:'びわこ',12:'住之江',
   13:'尼崎',14:'鳴門', 15:'丸亀', 16:'児島',   17:'宮島',  18:'徳山',
   19:'下関',20:'若松', 21:'芦屋', 22:'福岡',   23:'唐津',  24:'大村',
}

# ログ設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('fetch_openapi.log', encoding='utf-8'),
    ]
)
logger = logging.getLogger(__name__)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DB 初期化
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def init_db(conn):
    cur = conn.cursor()

    # ── 旧スキーマ（scrape_races.py製）との互換処理 ──────────
    # 旧テーブルは「会場コード TEXT」を持つ。新テーブルは「会場番号 INTEGER」。
    # 旧スキーマが残っていたら DROP して新スキーマで作り直す。
    for tbl in ('出走表', '直前情報'):
        cur.execute(f"PRAGMA table_info({tbl})")
        cols = [row[1] for row in cur.fetchall()]
        if cols and '会場コード' in cols:
            logger.info(f'旧スキーマの {tbl} を削除して再作成します')
            cur.execute(f'DROP TABLE {tbl}')

    # ── レース情報 ──────────────────────────────
    cur.execute('''
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
        )
    ''')

    # ── 出走表 ──────────────────────────────────
    cur.execute('''
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
        )
    ''')

    # ── 直前情報 ────────────────────────────────
    cur.execute('''
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
        )
    ''')

    # ── レース結果 ──────────────────────────────
    cur.execute('''
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
        )
    ''')

    # ── 払い戻し ────────────────────────────────
    cur.execute('''
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
        )
    ''')

    conn.commit()
    logger.info('DB テーブル初期化完了')


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# API フェッチ
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def fetch_json(session, api_name, target_date: date):
    """指定日のAPIデータを取得してJSONを返す。失敗時はNone。"""
    yyyy = target_date.strftime('%Y')
    ymd  = target_date.strftime('%Y%m%d')
    url  = f"{BASE_URLS[api_name]}/{yyyy}/{ymd}.json"
    try:
        time.sleep(SLEEP_SEC)
        res = session.get(url, timeout=20)
        if res.status_code == 404:
            logger.info(f'  [{api_name}] データなし (404): {ymd}')
            return None
        res.raise_for_status()
        return res.json()
    except Exception as e:
        logger.error(f'  [{api_name}] 取得エラー: {url} → {e}')
        return None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Hub API（全データ一括）の保存
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def save_hub(conn, data):
    """Hub APIのJSONを解析してレース情報・出走表・直前情報・結果・払い戻しを保存"""
    programs = data.get('programs', [])
    cur = conn.cursor()

    cnt = {'race': 0, 'boat': 0, 'preview': 0, 'result': 0, 'payout': 0}

    for prog in programs:
        date_str     = prog.get('date', '')
        stadium_no   = prog.get('stadium_number')
        race_no      = prog.get('number')
        venue_name   = VENUES.get(stadium_no, str(stadium_no))

        # ── レース情報 ──
        cur.execute('''
            INSERT OR REPLACE INTO レース情報
            (日付, 会場番号, 会場名, レース番号, 締切時刻, 日目, グレード名,
             グレード番号, レース名, サブタイトル, 距離)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ''', (
            date_str, stadium_no, venue_name, race_no,
            prog.get('closed_at'),
            prog.get('day_label'),
            prog.get('grade_label'),
            prog.get('grade_number'),
            prog.get('title'),
            prog.get('subtitle'),
            prog.get('distance'),
        ))
        cnt['race'] += 1

        # ── 出走表（boats リスト）──
        for boat in prog.get('boats', []):
            cur.execute('''
                INSERT OR REPLACE INTO 出走表
                (日付, 会場番号, 会場名, レース番号, 艇番,
                 選手名, 選手番号, 級別番号, 支部番号, 出身地番号,
                 年齢, 体重, F数, L数, 平均ST,
                 全国1着率, 全国2着率, 全国3着率,
                 当地1着率, 当地2着率, 当地3着率,
                 モーター番号, モーター2着率, モーター3着率,
                 ボート番号,   ボート2着率,   ボート3着率)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ''', (
                date_str, stadium_no, venue_name, race_no,
                boat.get('racer_boat_number'),
                boat.get('racer_name'),
                boat.get('racer_number'),
                boat.get('racer_class_number'),
                boat.get('racer_branch_number'),
                boat.get('racer_birthplace_number'),
                boat.get('racer_age'),
                boat.get('racer_weight'),
                boat.get('racer_flying_count'),
                boat.get('racer_late_count'),
                boat.get('racer_average_start_timing'),
                boat.get('racer_national_top_1_percent'),
                boat.get('racer_national_top_2_percent'),
                boat.get('racer_national_top_3_percent'),
                boat.get('racer_local_top_1_percent'),
                boat.get('racer_local_top_2_percent'),
                boat.get('racer_local_top_3_percent'),
                boat.get('racer_assigned_motor_number'),
                boat.get('racer_assigned_motor_top_2_percent'),
                boat.get('racer_assigned_motor_top_3_percent'),
                boat.get('racer_assigned_boat_number'),
                boat.get('racer_assigned_boat_top_2_percent'),
                boat.get('racer_assigned_boat_top_3_percent'),
            ))
            cnt['boat'] += 1

        # ── 直前情報（preview → boats は dict "1"〜"6"）──
        preview = prog.get('preview')
        if preview:
            boats_dict = preview.get('boats', {})
            # dict の場合（キーが "1"〜"6"）とリストの場合の両方に対応
            if isinstance(boats_dict, dict):
                boats_iter = boats_dict.values()
            else:
                boats_iter = boats_dict

            for b in boats_iter:
                # 展示タイムとコース番号がともにnull/0 → 展示未実施のプレースホルダーなのでスキップ
                exhibit_time = b.get('racer_exhibition_time')
                course_no    = b.get('racer_course_number')
                if not exhibit_time and not course_no:
                    continue
                cur.execute('''
                    INSERT OR REPLACE INTO 直前情報
                    (日付, 会場番号, 会場名, レース番号,
                     風速, 風向き番号, 波高, 天候番号, 気温, 水温,
                     艇番, コース番号, スタートST,
                     体重, 体重調整, 展示タイム, チルト調整)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ''', (
                    date_str, stadium_no, venue_name, race_no,
                    preview.get('wind_speed'),
                    preview.get('wind_direction_number'),
                    preview.get('wave_height'),
                    preview.get('weather_number'),
                    preview.get('air_temperature'),
                    preview.get('water_temperature'),
                    b.get('racer_boat_number'),
                    course_no,
                    b.get('racer_start_timing'),
                    b.get('racer_weight'),
                    b.get('racer_weight_adjustment'),
                    exhibit_time,
                    b.get('racer_tilt_adjustment'),
                ))
                cnt['preview'] += 1

        # ── レース結果（result → boats はリスト）──
        result = prog.get('result')
        if result:
            for b in result.get('boats', []):
                cur.execute('''
                    INSERT OR REPLACE INTO レース結果
                    (日付, 会場番号, 会場名, レース番号,
                     風速, 風向き番号, 波高, 天候番号, 気温, 水温, 決まり手番号,
                     艇番, コース番号, スタートST, 着順, 選手番号, 選手名)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ''', (
                    date_str, stadium_no, venue_name, race_no,
                    result.get('wind_speed'),
                    result.get('wind_direction_number'),
                    result.get('wave_height'),
                    result.get('weather_number'),
                    result.get('air_temperature'),
                    result.get('water_temperature'),
                    result.get('technique_number'),
                    b.get('racer_boat_number'),
                    b.get('racer_course_number'),
                    b.get('racer_start_timing'),
                    b.get('racer_place_number'),
                    b.get('racer_number'),
                    b.get('racer_name'),
                ))
                cnt['result'] += 1

            # ── 払い戻し ──
            payouts = result.get('payouts', {})
            PAYOUT_NAMES = {
                'trifecta':       '三連単',
                'trio':           '三連複',
                'exacta':         '二連単',
                'quinella':       '二連複',
                'quinella_place': '拡連複',
                'win':            '単勝',
                'place':          '複勝',
            }
            for key, label in PAYOUT_NAMES.items():
                for p in payouts.get(key, []):
                    cur.execute('''
                        INSERT OR REPLACE INTO 払い戻し
                        (日付, 会場番号, 会場名, レース番号, 種別, 組み合わせ, 金額)
                        VALUES (?,?,?,?,?,?,?)
                    ''', (
                        date_str, stadium_no, venue_name, race_no,
                        label,
                        p.get('combination', ''),
                        p.get('amount'),
                    ))
                    cnt['payout'] += 1

    conn.commit()
    return cnt


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Programs API 単独保存（レース情報・出走表のみ）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def save_programs(conn, data):
    """Programs API のデータをレース情報・出走表に保存"""
    cur = conn.cursor()
    cnt = {'race': 0, 'boat': 0}

    for prog in data.get('programs', []):
        date_str   = prog.get('date', '')
        stadium_no = prog.get('stadium_number')
        race_no    = prog.get('number')
        venue_name = VENUES.get(stadium_no, str(stadium_no))

        cur.execute('''
            INSERT OR REPLACE INTO レース情報
            (日付, 会場番号, 会場名, レース番号, 締切時刻, 日目, グレード名,
             グレード番号, レース名, サブタイトル, 距離)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ''', (
            date_str, stadium_no, venue_name, race_no,
            prog.get('closed_at'), prog.get('day_label'),
            prog.get('grade_label'), prog.get('grade_number'),
            prog.get('title'), prog.get('subtitle'), prog.get('distance'),
        ))
        cnt['race'] += 1

        for boat in prog.get('boats', []):
            cur.execute('''
                INSERT OR REPLACE INTO 出走表
                (日付, 会場番号, 会場名, レース番号, 艇番,
                 選手名, 選手番号, 級別番号, 支部番号, 出身地番号,
                 年齢, 体重, F数, L数, 平均ST,
                 全国1着率, 全国2着率, 全国3着率,
                 当地1着率, 当地2着率, 当地3着率,
                 モーター番号, モーター2着率, モーター3着率,
                 ボート番号, ボート2着率, ボート3着率)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ''', (
                date_str, stadium_no, venue_name, race_no,
                boat.get('racer_boat_number'),
                boat.get('racer_name'),
                boat.get('racer_number'),
                boat.get('racer_class_number'),
                boat.get('racer_branch_number'),
                boat.get('racer_birthplace_number'),
                boat.get('racer_age'),
                boat.get('racer_weight'),
                boat.get('racer_flying_count'),
                boat.get('racer_late_count'),
                boat.get('racer_average_start_timing'),
                boat.get('racer_national_top_1_percent'),
                boat.get('racer_national_top_2_percent'),
                boat.get('racer_national_top_3_percent'),
                boat.get('racer_local_top_1_percent'),
                boat.get('racer_local_top_2_percent'),
                boat.get('racer_local_top_3_percent'),
                boat.get('racer_assigned_motor_number'),
                boat.get('racer_assigned_motor_top_2_percent'),
                boat.get('racer_assigned_motor_top_3_percent'),
                boat.get('racer_assigned_boat_number'),
                boat.get('racer_assigned_boat_top_2_percent'),
                boat.get('racer_assigned_boat_top_3_percent'),
            ))
            cnt['boat'] += 1

    conn.commit()
    return cnt


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Previews API 単独保存（直前情報のみ）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def save_previews(conn, data):
    """Previews API のデータを直前情報に保存"""
    cur = conn.cursor()
    cnt = {'preview': 0}

    for prev in data.get('previews', []):
        date_str   = prev.get('date', '')
        stadium_no = prev.get('stadium_number')
        race_no    = prev.get('number')
        venue_name = VENUES.get(stadium_no, str(stadium_no))

        boats = prev.get('boats', {})
        if isinstance(boats, dict):
            boats_iter = boats.values()
        else:
            boats_iter = boats

        for b in boats_iter:
            # 展示タイムとコース番号がともにnull/0 → 展示未実施のプレースホルダーなのでスキップ
            exhibit_time = b.get('racer_exhibition_time')
            course_no    = b.get('racer_course_number')
            if not exhibit_time and not course_no:
                continue
            cur.execute('''
                INSERT OR REPLACE INTO 直前情報
                (日付, 会場番号, 会場名, レース番号,
                 風速, 風向き番号, 波高, 天候番号, 気温, 水温,
                 艇番, コース番号, スタートST,
                 体重, 体重調整, 展示タイム, チルト調整)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ''', (
                date_str, stadium_no, venue_name, race_no,
                prev.get('wind_speed'),
                prev.get('wind_direction_number'),
                prev.get('wave_height'),
                prev.get('weather_number'),
                prev.get('air_temperature'),
                prev.get('water_temperature'),
                b.get('racer_boat_number'),
                course_no,
                b.get('racer_start_timing'),
                b.get('racer_weight'),
                b.get('racer_weight_adjustment'),
                exhibit_time,
                b.get('racer_tilt_adjustment'),
            ))
            cnt['preview'] += 1

    conn.commit()
    return cnt


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Results API 単独保存（結果・払い戻しのみ）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def save_results(conn, data):
    """Results API のデータをレース結果・払い戻しに保存"""
    cur = conn.cursor()
    cnt = {'result': 0, 'payout': 0}
    PAYOUT_NAMES = {
        'trifecta':'三連単', 'trio':'三連複', 'exacta':'二連単',
        'quinella':'二連複', 'quinella_place':'拡連複',
        'win':'単勝', 'place':'複勝',
    }

    for res in data.get('results', []):
        date_str   = res.get('date', '')
        stadium_no = res.get('stadium_number')
        race_no    = res.get('number')
        venue_name = VENUES.get(stadium_no, str(stadium_no))

        for b in res.get('boats', []):
            cur.execute('''
                INSERT OR REPLACE INTO レース結果
                (日付, 会場番号, 会場名, レース番号,
                 風速, 風向き番号, 波高, 天候番号, 気温, 水温, 決まり手番号,
                 艇番, コース番号, スタートST, 着順, 選手番号, 選手名)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ''', (
                date_str, stadium_no, venue_name, race_no,
                res.get('wind_speed'), res.get('wind_direction_number'),
                res.get('wave_height'), res.get('weather_number'),
                res.get('air_temperature'), res.get('water_temperature'),
                res.get('technique_number'),
                b.get('racer_boat_number'),
                b.get('racer_course_number'),
                b.get('racer_start_timing'),
                b.get('racer_place_number'),
                b.get('racer_number'),
                b.get('racer_name'),
            ))
            cnt['result'] += 1

        for key, label in PAYOUT_NAMES.items():
            for p in res.get('payouts', {}).get(key, []):
                cur.execute('''
                    INSERT OR REPLACE INTO 払い戻し
                    (日付, 会場番号, 会場名, レース番号, 種別, 組み合わせ, 金額)
                    VALUES (?,?,?,?,?,?,?)
                ''', (
                    date_str, stadium_no, venue_name, race_no,
                    label, p.get('combination', ''), p.get('amount'),
                ))
                cnt['payout'] += 1

    conn.commit()
    return cnt


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# メイン処理
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def process_date(session, conn, target_date: date):
    """1日分のデータを取得して保存する。
    過去日: Hub API（1リクエストで全データ）
    今日  : 個別API（Hub は当日中更新されないため Programs/Previews/Results を使う）
    Hub が 404 の場合も個別 API にフォールバック。
    """
    ymd   = target_date.strftime('%Y%m%d')
    today = date.today()
    logger.info(f'処理中: {ymd}')

    # ── 過去日かつ Hub API が取れる場合 ──
    if target_date < today:
        data = fetch_json(session, 'hub', target_date)
        if data:
            cnt = save_hub(conn, data)
            logger.info(
                f'  {ymd} [Hub]: レース={cnt["race"]} 出走={cnt["boat"]} '
                f'直前={cnt["preview"]} 結果={cnt["result"]} 払戻={cnt["payout"]}'
            )
            return True
        logger.info(f'  {ymd}: Hub API なし → 個別 API にフォールバック')

    # ── 今日 or Hub が取れない場合: 個別 API を順番に試す ──
    success = False
    total   = {'race': 0, 'boat': 0, 'preview': 0, 'result': 0, 'payout': 0}

    prog_data = fetch_json(session, 'programs', target_date)
    if prog_data:
        c = save_programs(conn, prog_data)
        total['race'] += c['race']; total['boat'] += c['boat']
        success = True

    prev_data = fetch_json(session, 'previews', target_date)
    if prev_data:
        c = save_previews(conn, prev_data)
        total['preview'] += c['preview']
        success = True

    res_data = fetch_json(session, 'results', target_date)
    if res_data:
        c = save_results(conn, res_data)
        total['result'] += c['result']; total['payout'] += c['payout']
        success = True

    if success:
        logger.info(
            f'  {ymd} [個別]: レース={total["race"]} 出走={total["boat"]} '
            f'直前={total["preview"]} 結果={total["result"]} 払戻={total["payout"]}'
        )
    else:
        logger.warning(f'  {ymd}: どのAPIからもデータ取得できず → スキップ')

    return success


def main():
    args = sys.argv[1:]

    # 日付範囲の決定
    if len(args) == 0:
        dates = [date.today()]
    elif len(args) == 1:
        d = datetime.strptime(args[0], '%Y%m%d').date()
        dates = [d]
    elif len(args) == 2:
        start = datetime.strptime(args[0], '%Y%m%d').date()
        end   = datetime.strptime(args[1], '%Y%m%d').date()
        dates = []
        cur   = start
        while cur <= end:
            dates.append(cur)
            cur += timedelta(days=1)
    else:
        print('使い方: python fetch_from_openapi.py [開始日 [終了日]]')
        print('  例: python fetch_from_openapi.py 20260401')
        print('  例: python fetch_from_openapi.py 20260301 20260331')
        sys.exit(1)

    logger.info(f'対象日付: {len(dates)}日分 '
                f'({dates[0].strftime("%Y%m%d")} ～ {dates[-1].strftime("%Y%m%d")})')

    session = requests.Session()
    session.headers.update({'User-Agent': 'Mozilla/5.0'})

    conn = sqlite3.connect(DB_PATH)
    init_db(conn)

    success = 0
    for d in dates:
        if process_date(session, conn, d):
            success += 1

    conn.close()
    logger.info(f'完了: {success}/{len(dates)}日分 保存')

    # DB の件数確認
    conn2 = sqlite3.connect(DB_PATH)
    cur2  = conn2.cursor()
    tables = ['レース情報', '出走表', '直前情報', 'レース結果', '払い戻し']
    logger.info('=== DB件数 ===')
    for t in tables:
        try:
            cur2.execute(f'SELECT COUNT(*) FROM {t}')
            logger.info(f'  {t}: {cur2.fetchone()[0]:,} 件')
        except Exception:
            pass
    conn2.close()


if __name__ == '__main__':
    main()
