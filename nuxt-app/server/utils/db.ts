// Node.js v24 組み込みの SQLite を使用（C++ビルドツール不要）
// https://nodejs.org/api/sqlite.html
import { DatabaseSync } from 'node:sqlite'
import path from 'path'

let _db: DatabaseSync | null = null

export function getDB(): DatabaseSync {
  if (!_db) {
    // nuxt-app/ の1つ上が 競艇予想アプリ3/
    const dbPath = path.resolve(process.cwd(), '..', 'boatrace.db')
    _db = new DatabaseSync(dbPath)
    // 選手プロフィールテーブルが未作成の場合に備えて空テーブルを作成
    _db.exec(`
      CREATE TABLE IF NOT EXISTS 選手プロフィール (
        選手番号 INTEGER PRIMARY KEY,
        性別     INTEGER NOT NULL DEFAULT 1,
        養成期   INTEGER NOT NULL DEFAULT 0
      )
    `)
    _db.exec(`
      CREATE TABLE IF NOT EXISTS 選手コース成績 (
        選手番号    INTEGER NOT NULL,
        年          INTEGER NOT NULL,
        期終了月    INTEGER NOT NULL,
        算出期間_自 TEXT,
        算出期間_至 TEXT    NOT NULL,
        c1進入  INTEGER, c1複勝率  REAL, c1ST  REAL,
        c2進入  INTEGER, c2複勝率  REAL, c2ST  REAL,
        c3進入  INTEGER, c3複勝率  REAL, c3ST  REAL,
        c4進入  INTEGER, c4複勝率  REAL, c4ST  REAL,
        c5進入  INTEGER, c5複勝率  REAL, c5ST  REAL,
        c6進入  INTEGER, c6複勝率  REAL, c6ST  REAL,
        PRIMARY KEY (選手番号, 算出期間_至)
      )
    `)
    _db.exec(`
      CREATE TABLE IF NOT EXISTS アプリ設定 (
        キー   TEXT PRIMARY KEY,
        値     TEXT NOT NULL,
        更新日時 TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      )
    `)
    _db.exec(`
      CREATE TABLE IF NOT EXISTS 直前情報手動入力 (
        日付       TEXT    NOT NULL,
        会場番号   INTEGER NOT NULL,
        レース番号 INTEGER NOT NULL,
        艇番       INTEGER NOT NULL,
        展示タイム REAL,
        スタートST REAL,
        PRIMARY KEY (日付, 会場番号, レース番号, 艇番)
      )
    `)
    _db.exec(`
      CREATE TABLE IF NOT EXISTS note記事 (
        日付       TEXT    NOT NULL,
        会場番号   INTEGER NOT NULL,
        レース番号 INTEGER NOT NULL,
        記事内容   TEXT    NOT NULL,
        保存日時   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        PRIMARY KEY (日付, 会場番号, レース番号)
      )
    `)
    _db.exec(`
      CREATE TABLE IF NOT EXISTS 予想スナップショット (
        日付       TEXT    NOT NULL,
        会場番号   INTEGER NOT NULL,
        レース番号 INTEGER NOT NULL,
        本命       TEXT,
        対抗       TEXT,
        穴         TEXT,
        大穴       TEXT,
        boats_json TEXT    NOT NULL,
        upset_json TEXT,
        保存日時   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        PRIMARY KEY (日付, 会場番号, レース番号)
      )
    `)
  }
  return _db
}

// 今日の日付を YYYY-MM-DD 形式で返す
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}
