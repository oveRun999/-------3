/**
 * import_kresult.js
 * 公式BOATRACEダウンロードページのK結果TXTをDBにインポート
 * 使い方: node import_kresult.js [TXTファイルまたはフォルダ]
 *
 * 例:
 *   node import_kresult.js K260401.TXT
 *   node import_kresult.js extracted/   ← フォルダ内の全TXTを処理
 */

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = path.join(__dirname, "boatrace.db");

// 着順の特殊コード変換
const RANK_CODES = {
  F: 14, // フライング
  L: 13, // 出遅れ
  K: 11, // 棄権
  S: 12, // 失格
  E: 16, // 欠場
};

function parseKresultTxt(filepath) {
  const raw = fs.readFileSync(filepath);
  // CP932 → UTF-8 に iconv で変換（なければバイト読み）
  let text;
  try {
    const iconv = require("iconv-lite");
    text = iconv.decode(raw, "CP932");
  } catch {
    // iconv-lite が無い場合: UTF-8 として読む（文字化けするが数字は取れる）
    text = raw.toString("binary");
  }

  const lines = text.split("\n");
  const records = [];

  // ファイル名から日付を取得: K260401.TXT → 2026-04-01
  const fname = path.basename(filepath, ".TXT").replace(/^K/i, "");
  const year = 2000 + parseInt(fname.slice(0, 2), 10);
  const month = parseInt(fname.slice(2, 4), 10);
  const day = parseInt(fname.slice(4, 6), 10);
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  let currentVenue = null;
  let currentRace = null;

  for (const line of lines) {
    // 会場ブロック開始: 24KBGN
    const venueStart = line.match(/^(\d{2})KBGN/);
    if (venueStart) {
      currentVenue = parseInt(venueStart[1], 10);
      currentRace = null;
      continue;
    }
    // 会場ブロック終了: 24KEND
    if (/^\d{2}KEND/.test(line)) {
      currentVenue = null;
      currentRace = null;
      continue;
    }
    if (!currentVenue) continue;

    // レース番号: "   1R " or "  12R "
    const raceMatch = line.match(/^\s{1,3}(\d{1,2})R\s/);
    if (raceMatch) {
      currentRace = parseInt(raceMatch[1], 10);
      continue;
    }
    if (!currentRace) continue;

    // 着順データ行: "  01  1 4676 ..."
    // col 3-4: 着順(01-06 or F/L/K/S/E)
    // col 6  : 艇番(1-6)
    // col 8-11: 選手番号(4桁)
    const dataMatch = line.match(/^  ([0-9 F L K S E]{2})\s{1,2}(\d) (\d{4}) /);
    if (!dataMatch) continue;

    const rankStr = dataMatch[1].trim();
    const boat = parseInt(dataMatch[2], 10);
    const racer = parseInt(dataMatch[3], 10);

    let rank;
    if (RANK_CODES[rankStr] !== undefined) {
      rank = RANK_CODES[rankStr];
    } else if (/^\d+$/.test(rankStr)) {
      rank = parseInt(rankStr, 10);
    } else {
      continue; // 解析不能
    }

    records.push({
      dateStr,
      venue: currentVenue,
      race: currentRace,
      racer,
      boat,
      rank,
    });
  }

  return records;
}

function importRecords(db, records) {
  // 既存行（OpenAPIデータ）があれば着順だけ更新、なければ新規INSERT
  // UNIQUE制約は (日付, 会場番号, レース番号, 艇番) なので艇番で衝突を検知
  const stmt = db.prepare(`
    INSERT INTO レース結果 (日付, 会場番号, レース番号, 艇番, 選手番号, 着順)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(日付, 会場番号, レース番号, 艇番)
    DO UPDATE SET 着順 = excluded.着順
  `);

  let count = 0;
  db.exec('BEGIN');
  try {
    for (const r of records) {
      stmt.run(r.dateStr, r.venue, r.race, r.boat, r.racer, r.rank);
      count++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return count;
}

function collectTxtFiles(target) {
  const files = [];
  if (fs.statSync(target).isDirectory()) {
    for (const f of fs.readdirSync(target)) {
      if (/^K\d{6}\.TXT$/i.test(f)) {
        files.push(path.join(target, f));
      }
    }
  } else {
    files.push(target);
  }
  return files.sort();
}

// --- メイン ---
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("使い方: node import_kresult.js <TXTファイルまたはフォルダ>");
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);

// レース結果テーブルが無ければ最小構成で作成（通常はfetch_from_openapi.pyが作成済み）
db.exec(`
  CREATE TABLE IF NOT EXISTS レース結果 (
    日付       TEXT    NOT NULL,
    会場番号   INTEGER NOT NULL,
    レース番号 INTEGER NOT NULL,
    艇番       INTEGER NOT NULL,
    選手番号   INTEGER,
    着順       INTEGER,
    UNIQUE(日付, 会場番号, レース番号, 艇番)
  )
`);

const target = args[0];
let files;
try {
  files = collectTxtFiles(target);
} catch (e) {
  console.error("ファイルが見つかりません:", target);
  process.exit(1);
}

console.log(`処理ファイル数: ${files.length}`);
let totalRecords = 0;

for (const f of files) {
  try {
    const records = parseKresultTxt(f);
    const count = importRecords(db, records);
    totalRecords += count;
    console.log(`✓ ${path.basename(f)}: ${count}件`);
  } catch (e) {
    console.error(`✗ ${path.basename(f)}: ${e.message}`);
  }
}

console.log('\n完了: 合計 ' + totalRecords + ' 件インポートしました');