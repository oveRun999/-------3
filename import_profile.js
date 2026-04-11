#!/usr/bin/env node
/**
 * csv/ フォルダのファン手帳CSVから以下の2テーブルを構築
 *   - 選手プロフィール (選手番号, 性別, 養成期)
 *   - 選手コース成績  (選手番号, 年, 期終了月, c1〜c6 進入/複勝率/ST)
 *
 * 使い方: node import_profile.js  （競艇予想アプリ3/ または nuxt-app/ どちらでもOK）
 *
 * CSVの列構成（固定）:
 *   col[0]  = 登番（選手番号）
 *   col[7]  = 性別 (1=男, 2=女)
 *   col[20〜42] = 各コース 進入/複勝率/ST
 *   col[49] = 年
 *   col[51] = 算出期間_自
 *   col[52] = 算出期間_至
 *   col[53] = 養成期
 */

const { DatabaseSync } = require('node:sqlite')
const fs   = require('node:fs')
const path = require('node:path')

const BASE_DIR = __dirname.endsWith('nuxt-app')
  ? path.join(__dirname, '..')
  : __dirname

const DB_PATH = path.join(BASE_DIR, 'boatrace.db')
const CSV_DIR = path.join(BASE_DIR, 'csv')

// 列インデックス定数
const IDX_ID     = 0
const IDX_GENDER = 7
const IDX_YEAR   = 49
const IDX_FROM   = 51
const IDX_TO     = 52
const IDX_PERIOD = 53
// コース別: 進入[base], 複勝率[base+1], ST[base+2]  (4つおきに次のコース)
const COURSE_BASE = [20, 24, 28, 32, 36, 40]

function parseCSV(filepath) {
  const text  = fs.readFileSync(filepath, 'latin1')
  const lines = text.split(/\r?\n/)
  const rows  = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    rows.push(line.split(','))
  }
  return rows
}

function pf(v) { return parseFloat(v) || 0 }
function pi(v) { return parseInt(v, 10) || 0 }

// ──────────────────────────────────────
// DB初期化
// ──────────────────────────────────────
const db = new DatabaseSync(DB_PATH)

// 選手プロフィール
db.exec(`
  CREATE TABLE IF NOT EXISTS 選手プロフィール (
    選手番号 INTEGER PRIMARY KEY,
    性別     INTEGER NOT NULL,
    養成期   INTEGER NOT NULL
  )
`)

// 選手コース成績（既存テーブルが古いスキーマの場合は再作成）
db.exec(`DROP TABLE IF EXISTS 選手コース成績`)
db.exec(`
  CREATE TABLE 選手コース成績 (
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
console.log('テーブル初期化完了')

const files = fs.readdirSync(CSV_DIR)
  .filter(f => /^fan\d{4}\.csv$/i.test(f))
  .sort()

const stmtProfile = db.prepare(`
  INSERT OR REPLACE INTO 選手プロフィール (選手番号, 性別, 養成期)
  VALUES (?, ?, ?)
`)
const stmtCourse = db.prepare(`
  INSERT OR REPLACE INTO 選手コース成績
    (選手番号, 年, 期終了月, 算出期間_自, 算出期間_至,
     c1進入, c1複勝率, c1ST,
     c2進入, c2複勝率, c2ST,
     c3進入, c3複勝率, c3ST,
     c4進入, c4複勝率, c4ST,
     c5進入, c5複勝率, c5ST,
     c6進入, c6複勝率, c6ST)
  VALUES (?,?,?,?,?, ?,?,?, ?,?,?, ?,?,?, ?,?,?, ?,?,?, ?,?,?)
`)

let totalProfile = 0
let totalCourse  = 0

for (const fname of files) {
  const rows = parseCSV(path.join(CSV_DIR, fname))
  let cntP = 0, cntC = 0

  db.exec('BEGIN')
  try {
    for (const cols of rows) {
      const id = pi(cols[IDX_ID])
      if (!id) continue

      // 選手プロフィール
      const gender = pi(cols[IDX_GENDER])
      const period = pi(cols[IDX_PERIOD] || '0')
      if (gender) {
        stmtProfile.run(id, gender, isNaN(period) ? 0 : period)
        cntP++
      }

      // 選手コース成績
      const year  = pi(cols[IDX_YEAR])
      const atTo  = (cols[IDX_TO]   || '').trim()
      const atFrom = (cols[IDX_FROM] || '').trim()
      if (!year || !atTo) continue

      const endMonth = parseInt(atTo.slice(4, 6), 10) // 04 or 10

      const courseVals = []
      for (const base of COURSE_BASE) {
        courseVals.push(pi(cols[base]), pf(cols[base+1]), pf(cols[base+2]))
      }

      stmtCourse.run(id, year, endMonth, atFrom, atTo, ...courseVals)
      cntC++
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }

  totalProfile += cntP
  totalCourse  += cntC
  console.log(`  ${fname}: プロフィール ${cntP}件 / コース成績 ${cntC}件`)
}

console.log(`\n=== 完了 ===`)
console.log(`  選手プロフィール: 合計 ${totalProfile} 件`)
console.log(`  選手コース成績:   合計 ${totalCourse} 件`)
db.close()
