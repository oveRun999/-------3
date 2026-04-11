const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const db = new DatabaseSync(path.join(__dirname, 'boatrace.db'), { readOnly: true });

console.log('=== テーブル件数 ===');
const tables = ['出走表','レース結果','レース情報','直前情報','払い戻し','選手プロフィール'];
for (const t of tables) {
  try {
    const r = db.prepare('SELECT COUNT(*) as cnt FROM "' + t + '"').get();
    console.log(t + ': ' + r.cnt.toLocaleString() + '件');
  } catch(e) { console.log(t + ': テーブルなし'); }
}

console.log('\n=== レース結果サンプル（着順あり） ===');
try {
  const rows = db.prepare('SELECT 日付,会場番号,レース番号,艇番,着順,選手番号 FROM レース結果 WHERE 着順 IS NOT NULL ORDER BY 日付 DESC LIMIT 3').all();
  rows.forEach(r => console.log(JSON.stringify(r)));
} catch(e) { console.log('エラー:', e.message); }

console.log('\n=== 出走表サンプル ===');
try {
  const rows = db.prepare('SELECT 日付,会場名,レース番号,艇番,選手名 FROM 出走表 ORDER BY 日付 DESC LIMIT 3').all();
  rows.forEach(r => console.log(JSON.stringify(r)));
} catch(e) { console.log('エラー:', e.message); }
