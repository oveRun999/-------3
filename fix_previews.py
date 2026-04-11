#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
直前情報の空レコード削除 + 再取得スクリプト

使い方（Windowsのコマンドプロンプトで実行）:
  python fix_previews.py              # 昨日の直前情報を再取得
  python fix_previews.py 20260401     # 指定日の直前情報を再取得
  python fix_previews.py 20260325 20260401  # 日付範囲を再取得

やること:
  1. DBの空レコード（展示タイム=0 かつ コース番号=NULL）を削除
  2. 指定日の直前情報を Previews API または Hub API から再取得して保存
"""

import requests
import sqlite3
import sys
import time
import logging
import os
from datetime import datetime, date, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), 'boatrace.db')
BASE_URLS = {
    'hub':      'https://boatraceopenapi.github.io/hub/v3',
    'previews': 'https://boatraceopenapi.github.io/previews/v3',
}
VENUES = {
    1:'桐生', 2:'戸田', 3:'江戸川', 4:'平和島', 5:'多摩川', 6:'浜名湖',
    7:'蒲郡', 8:'常滑', 9:'津', 10:'三国', 11:'びわこ', 12:'住之江',
    13:'尼崎', 14:'鳴門', 15:'丸亀', 16:'児島', 17:'宮島', 18:'徳山',
    19:'下関', 20:'若松', 21:'芦屋', 22:'福岡', 23:'唐津', 24:'大村',
}

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)


def fetch_json(session, api_name, target_date: date):
    yyyy = target_date.strftime('%Y')
    ymd  = target_date.strftime('%Y%m%d')
    url  = f"{BASE_URLS[api_name]}/{yyyy}/{ymd}.json"
    try:
        time.sleep(0.5)
        res = session.get(url, timeout=20)
        if res.status_code == 404:
            logger.info(f'  [{api_name}] データなし (404): {ymd}')
            return None
        res.raise_for_status()
        return res.json()
    except Exception as e:
        logger.error(f'  [{api_name}] エラー: {url} → {e}')
        return None


def clean_empty_records(conn):
    """展示タイムとコース番号がともにnull/0の空レコードを削除"""
    cur = conn.cursor()
    cur.execute('''
        DELETE FROM 直前情報
        WHERE (展示タイム IS NULL OR 展示タイム = 0)
          AND コース番号 IS NULL
    ''')
    deleted = cur.rowcount
    conn.commit()
    if deleted > 0:
        logger.info(f'  空レコード削除: {deleted}件')
    return deleted


def save_previews_from_hub(conn, data, date_str):
    """Hub APIのdataから指定日の直前情報だけ保存"""
    cur = conn.cursor()
    cnt = 0
    for prog in data.get('programs', []):
        if prog.get('date', '') != date_str:
            continue
        stadium_no = prog.get('stadium_number')
        race_no    = prog.get('number')
        venue_name = VENUES.get(stadium_no, str(stadium_no))
        preview    = prog.get('preview')
        if not preview:
            continue
        boats_dict = preview.get('boats', {})
        boats_iter = boats_dict.values() if isinstance(boats_dict, dict) else boats_dict
        for b in boats_iter:
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
                preview.get('wind_speed'), preview.get('wind_direction_number'),
                preview.get('wave_height'), preview.get('weather_number'),
                preview.get('air_temperature'), preview.get('water_temperature'),
                b.get('racer_boat_number'), course_no,
                b.get('racer_start_timing'), b.get('racer_weight'),
                b.get('racer_weight_adjustment'), exhibit_time,
                b.get('racer_tilt_adjustment'),
            ))
            cnt += 1
    conn.commit()
    return cnt


def save_previews_from_api(conn, data):
    """Previews APIのdataから直前情報を保存"""
    cur = conn.cursor()
    cnt = 0
    for prev in data.get('previews', []):
        date_str   = prev.get('date', '')
        stadium_no = prev.get('stadium_number')
        race_no    = prev.get('number')
        venue_name = VENUES.get(stadium_no, str(stadium_no))
        boats = prev.get('boats', {})
        boats_iter = boats.values() if isinstance(boats, dict) else boats
        for b in boats_iter:
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
                prev.get('wind_speed'), prev.get('wind_direction_number'),
                prev.get('wave_height'), prev.get('weather_number'),
                prev.get('air_temperature'), prev.get('water_temperature'),
                b.get('racer_boat_number'), course_no,
                b.get('racer_start_timing'), b.get('racer_weight'),
                b.get('racer_weight_adjustment'), exhibit_time,
                b.get('racer_tilt_adjustment'),
            ))
            cnt += 1
    conn.commit()
    return cnt


def process_date(session, conn, target_date: date):
    ymd      = target_date.strftime('%Y%m%d')
    date_str = target_date.strftime('%Y-%m-%d')
    today    = date.today()
    logger.info(f'処理中: {ymd}')

    # まず空レコードを削除
    clean_empty_records(conn)

    # 過去日: Hub API優先
    if target_date < today:
        data = fetch_json(session, 'hub', target_date)
        if data:
            cnt = save_previews_from_hub(conn, data, date_str)
            logger.info(f'  {ymd} [Hub]: 直前情報 {cnt}件 保存')
            return cnt > 0
        logger.info(f'  {ymd}: Hub API なし → Previews API にフォールバック')

    # 今日 or Hub が取れない場合: Previews API
    data = fetch_json(session, 'previews', target_date)
    if data:
        cnt = save_previews_from_api(conn, data)
        logger.info(f'  {ymd} [Previews]: 直前情報 {cnt}件 保存')
        return cnt > 0

    logger.warning(f'  {ymd}: データ取得できず')
    return False


def main():
    args = sys.argv[1:]
    today = date.today()

    if len(args) == 0:
        # デフォルトは昨日
        dates = [today - timedelta(days=1)]
    elif len(args) == 1:
        dates = [datetime.strptime(args[0], '%Y%m%d').date()]
    elif len(args) == 2:
        start = datetime.strptime(args[0], '%Y%m%d').date()
        end   = datetime.strptime(args[1], '%Y%m%d').date()
        dates, cur = [], start
        while cur <= end:
            dates.append(cur)
            cur += timedelta(days=1)
    else:
        print('使い方: python fix_previews.py [開始日 [終了日]]')
        sys.exit(1)

    logger.info(f'対象: {len(dates)}日分')

    session = requests.Session()
    session.headers.update({'User-Agent': 'Mozilla/5.0'})
    conn = sqlite3.connect(DB_PATH)

    for d in dates:
        process_date(session, conn, d)

    # 最終確認
    cur = conn.cursor()
    cur.execute('SELECT COUNT(*) FROM 直前情報 WHERE 展示タイム > 0')
    valid = cur.fetchone()[0]
    cur.execute('SELECT COUNT(*) FROM 直前情報')
    total = cur.fetchone()[0]
    logger.info(f'直前情報: {valid}/{total}件に展示タイムあり')
    conn.close()


if __name__ == '__main__':
    main()
