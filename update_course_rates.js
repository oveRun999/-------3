/**
 * update_course_rates.js
 * DBの実績データからコース別勝率を計算して predict.get.ts の定数を更新する
 * 実行: node update_course_rates.js
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const candidates = [
  path.join(__dirname, 'boatrace.db'),
  path.join(__dirname, 'nuxt-app', 'boatrace.db'),
];
const dbPath = candidates.find(p => fs.existsSync(p));
if (!dbPath) { console.error('boatrace.db が見つからない'); process.exit(1); }

const db = new DatabaseSync(dbPath);
console.log('DB:', dbPath);

// レース結果の総件数確認
const total = db.prepare(`SELECT COUNT(*) AS cnt FROM レース結果 WHERE 着順 BETWEEN 1 AND 6`).get();
console.log(`レース結果 総件数: ${total.cnt.toLocaleString()}`);

// コース番号がNULLでない件数確認
const withCourse = db.prepare(`SELECT COUNT(*) AS cnt FROM レース結果 WHERE 着順 BETWEEN 1 AND 6 AND コース番号 IS NOT NULL`).get();
console.log(`うちコース番号あり: ${withCourse.cnt.toLocaleString()}`);

// ===== 全国コース別1着率（COALESCEで艇番をフォールバック） =====
const globalRows = db.prepare(`
  SELECT COALESCE(コース番号, 艇番) AS cno,
         COUNT(*) AS total,
         SUM(CASE WHEN 着順 = 1 THEN 1 ELSE 0 END) AS wins
  FROM レース結果
  WHERE 着順 BETWEEN 1 AND 6
    AND COALESCE(コース番号, 艇番) BETWEEN 1 AND 6
  GROUP BY cno
  ORDER BY cno
`).all();

console.log('\n【全国コース別1着率】');
const COURSE_WIN_RATE = {};
for (const r of globalRows) {
  const rate = r.wins / r.total;
  COURSE_WIN_RATE[r.cno] = Math.round(rate * 1000) / 1000;
  console.log(`  ${r.cno}コース: ${(rate * 100).toFixed(1)}%  (${r.wins.toLocaleString()}/${r.total.toLocaleString()})`);
}

// ===== 会場別・コース別1着率 =====
const venueRows = db.prepare(`
  SELECT 会場番号,
         COALESCE(コース番号, 艇番) AS cno,
         COUNT(*) AS total,
         SUM(CASE WHEN 着順 = 1 THEN 1 ELSE 0 END) AS wins
  FROM レース結果
  WHERE 着順 BETWEEN 1 AND 6
    AND COALESCE(コース番号, 艇番) BETWEEN 1 AND 6
  GROUP BY 会場番号, cno
  HAVING total >= 500
  ORDER BY 会場番号, cno
`).all();

const venueMap = {};
for (const r of venueRows) {
  if (!venueMap[r.会場番号]) venueMap[r.会場番号] = {};
  venueMap[r.会場番号][r.cno] = {
    rate: Math.round(r.wins / r.total * 1000) / 1000,
    total: r.total,
    wins: r.wins,
  };
}

// 会場名マップ
const venueNames = db.prepare(`SELECT DISTINCT 会場番号, 会場名 FROM 出走表 ORDER BY 会場番号`).all();
const nameMap = {};
for (const v of venueNames) nameMap[v.会場番号] = v.会場名;

console.log('\n【会場別 1コース1着率】');
const VENUE_COURSE1_RATE = {};
for (let no = 1; no <= 24; no++) {
  const c1 = venueMap[no]?.[1];
  if (!c1) {
    console.log(`  ${no}. ${nameMap[no] ?? '?'}: データ不足`);
    continue;
  }
  VENUE_COURSE1_RATE[no] = c1.rate;
  console.log(`  ${no}. ${nameMap[no] ?? '?'}: ${(c1.rate * 100).toFixed(1)}%  (${c1.wins.toLocaleString()}/${c1.total.toLocaleString()})`);
}

// ===== predict.get.ts 更新 =====
const targetFile = path.join(__dirname, 'nuxt-app', 'server', 'api', 'predict.get.ts');
if (!fs.existsSync(targetFile)) { console.error('predict.get.ts が見つからない'); process.exit(1); }

let src = fs.readFileSync(targetFile, 'utf-8');

const cwrLines = Object.entries(COURSE_WIN_RATE)
  .map(([c, r]) => `  ${c}: ${r},`)
  .join('\n');
src = src.replace(
  /const COURSE_WIN_RATE[\s\S]*?\}/,
  `const COURSE_WIN_RATE: Record<number, number> = {\n${cwrLines}\n}`
);

const now = new Date().toISOString().slice(0, 10);
if (Object.keys(VENUE_COURSE1_RATE).length > 0) {
  const venueLines = Object.entries(VENUE_COURSE1_RATE)
    .map(([no, r]) => `  ${no}: ${r},  // ${nameMap[no] ?? ''}`)
    .join('\n');
  src = src.replace(
    /\/\/ ===== 会場別1コース1着率[\s\S]*?const VENUE_COURSE1_RATE[\s\S]*?\}/,
    `// ===== 会場別1コース1着率（実績データ自動生成: ${now}）=====\nconst VENUE_COURSE1_RATE: Record<number, number> = {\n${venueLines}\n}`
  );
}

fs.writeFileSync(targetFile, src, 'utf-8');
console.log('\n✅ predict.get.ts を更新しました');

// accuracy.get.ts も更新
const accFile = path.join(__dirname, 'nuxt-app', 'server', 'api', 'accuracy.get.ts');
if (fs.existsSync(accFile)) {
  let acc = fs.readFileSync(accFile, 'utf-8');
  acc = acc.replace(
    /const COURSE_WIN_RATE[\s\S]*?\}/,
    `const COURSE_WIN_RATE: Record<number, number> = {\n${cwrLines}\n}`
  );
  if (Object.keys(VENUE_COURSE1_RATE).length > 0) {
    const venueLines = Object.entries(VENUE_COURSE1_RATE)
      .map(([no, r]) => `  ${no}: ${r},  // ${nameMap[no] ?? ''}`)
      .join('\n');
    acc = acc.replace(
      /const VENUE_COURSE1_RATE[\s\S]*?\}/,
      `const VENUE_COURSE1_RATE: Record<number, number> = {\n${venueLines}\n}`
    );
  }
  fs.writeFileSync(accFile, acc, 'utf-8');
  console.log('✅ accuracy.get.ts も更新しました');
}

db.close();
