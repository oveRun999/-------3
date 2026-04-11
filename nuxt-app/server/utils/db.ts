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
  }
  return _db
}

// 今日の日付を YYYY-MM-DD 形式で返す
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}
