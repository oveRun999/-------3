import Anthropic from "@anthropic-ai/sdk";
import { getDB } from '~/server/utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const {
    date,
    venue,
    raceNo,
    gradeName,
    raceName,
    weather,
    boats, // sortedBoats（スコア順）
    scoreDiff,
    honmei,
    taikou,
    ana,
    oozana,
    upsetAnalysis,
  } = body;

  // ---- 過去記事をDBから取得 ----
  const db = getDB()
  const pastRows = db.prepare(`
    SELECT 日付, 会場番号, レース番号, 記事内容, 保存日時
    FROM note記事
    ORDER BY 保存日時 DESC
    LIMIT 10
  `).all() as { 日付: string; 会場番号: number; レース番号: number; 記事内容: string; 保存日時: string }[]

  const totalCount = (db.prepare(`SELECT COUNT(*) as cnt FROM note記事`).get() as any)?.cnt ?? 0
  const articleNo  = totalCount + 1  // 今回が何本目か

  // ---- 買い目の重複を除去 ----
  const seenCombos = new Set<string>()
  function dedupBet(combo: string | null | undefined): string | null {
    if (!combo) return null
    if (seenCombos.has(combo)) return null
    seenCombos.add(combo)
    return combo
  }
  const dedupedHonmei  = dedupBet(honmei)
  const dedupedTaikou  = dedupBet(taikou)
  const dedupedAna     = dedupBet(ana)
  const dedupedOozana  = dedupBet(oozana)

  const config = useRuntimeConfig();
  const apiKey = config.anthropicApiKey;
  // デバッグ用：キーの先頭8文字と長さを出力
  console.log("[generate-note] apiKey length:", apiKey?.length ?? 0);
  console.log(
    "[generate-note] apiKey prefix:",
    apiKey?.slice(0, 8) ?? "(empty)",
  );
  if (!apiKey) {
    throw createError({
      statusCode: 500,
      message:
        "ANTHROPIC_API_KEY が設定されていません。.env に追加してください。",
    });
  }

  const client = new Anthropic({ apiKey });

  // 艇情報のテキスト整形
  const boatLines = (boats as any[])
    .map((b: any, i: number) => {
      const mark = i === 0 ? "◎" : i === 1 ? "○" : i === 2 ? "△" : "　";
      return `${mark} ${b.艇番}号艇 ${b.選手名 ?? ""}（スコア${b.score?.toFixed(1)}、${b.コース番号 ?? b.艇番}コース進入）`;
    })
    .join("\n");

  const upsetText = upsetAnalysis
    ? `大穴分析レベル: ${upsetAnalysis.level}（${upsetAnalysis.score}pt）\n要因: ${upsetAnalysis.factors?.join("、") || "なし"}`
    : "大穴要因: 特になし";

  const weatherItems = [
    weather?.天候 ? `- 天候：${weather.天候}` : null,
    weather?.風向 ? `- 風向：${weather.風向}` : null,
    weather?.風速 != null ? `- 風速：${weather.風速}m` : null,
    weather?.波高 != null ? `- 波高：${weather.波高}cm` : null,
  ].filter(Boolean);
  const weatherText = weatherItems.length > 0 ? weatherItems.join("\n") : null;

  const buyLines = [
    dedupedHonmei  ? `◎本線: ${dedupedHonmei}`  : "",
    dedupedTaikou  ? `○対抗: ${dedupedTaikou}`  : "",
    dedupedAna     ? `△穴: ${dedupedAna}`       : "",
    dedupedOozana  ? `💥大穴: ${dedupedOozana}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // ---- 過去記事サマリー（直近3件の冒頭200文字）----
  const pastSummary = pastRows.slice(0, 3).map((r, i) => {
    const snippet = r.記事内容.slice(0, 200).replace(/\n/g, ' ')
    return `[${i + 1}件前 ${r.保存日時}] ${r.日付} ${r.レース番号}R: ${snippet}…`
  }).join('\n')

  // 今日すでに記事があれば挨拶なし
  const todayStr    = new Date().toISOString().slice(0, 10)
  const isFirstToday = !pastRows.some(r => r.保存日時.startsWith(todayStr))

  const prompt = `## 重要な執筆前確認事項

### この記事は通算 ${articleNo} 本目の記事です
- 出力済み記事数: ${totalCount} 本
${isFirstToday
  ? '- 今日最初の記事です。書き出しに**1文だけ**短い挨拶を入れてください（時刻・時間帯には触れず自然に）'
  : '- 今日すでに記事があります。**挨拶は不要**です。いきなり本題から始めてください'}
${pastRows.length > 0 ? `- 直近の記事を参考に、同じ言い回し・同じ構成パターン・同じ話題が被らないよう工夫してください` : '- これが初めての記事です。テンプレ感が出ないように自然な書き出しをしてください'}

${pastSummary ? `### 直近の記事サマリー（内容が被らないよう参考にすること）\n${pastSummary}\n` : ''}

---

あなたは競艇予想をnoteで発信している40代のおじさんです。柔らかい物腰で、読者に語りかけるような文体で書きます。「〜ですね」「〜なんですよ」「〜かなと思います」といった口調を使ってください。断定的にならず、あくまで自分の見解として丁寧に伝えます。

以下のレースデータをもとに、noteに投稿する競艇予想記事をMarkdown形式で書いてください。

## 執筆のトーン
- 「データ上は〇〇ですが、私の経験上、こういう時は…」という、データ＋主観の構成にしてください。
- 専門用語（スリット、出足、伸びなど）を使いつつ、初心者に教えるような優しさで。
- 文中に「（笑）」「（汗）」「！」などの記号を少し混ぜて、硬さを取ってください。

## レース情報
- 日付: ${date}
- 会場: ${venue}
- レース番号: ${raceNo}R
- グレード: ${gradeName || "なし"}
- レース名: ${raceName || "なし"}
- スコア差（1位と2位）: ${scoreDiff?.toFixed(1)}pt

## 天候（取得できた項目のみ記載。nullや未取得の項目は「情報なし」と書かず完全に省く）
${weatherText ?? "（天候データなし：このセクションは記事に含めないこと）"}

## AIスコア順位（高い順）
${boatLines}

## 買い目
${buyLines}

## ${upsetText}

## noteエディタで使えるMarkdown記法（これ以外は使わないこと）
- ## 大見出し（h2）
- ### 小見出し（h3）
- - または * で箇条書き
- 1. で番号付きリスト
- > で引用ブロック
- **テキスト** で太字
- ~~テキスト~~ で打ち消し線
- --- で区切り線
- テーブル（表）は非対応なので**絶対に使わない**
- チェックリスト（- [x]）は非対応なので**絶対に使わない**
- # 見出し（h1）は非対応（タイトルがh1のため）なので**絶対に使わない**
-「定型句の禁止」: 「〜の根拠」「〜の評価」といった見出しを、もっと柔らかい表現に変えるよう指示します（例：「なぜこのレースを選んだかというとね、」）。
-「個人の感想」: 数値データだけでなく、「この選手は私の推しなんです」「前回の走りを見てて気になっていた」といった、データに基づかない（風の）一言を入れさせます.



## 記事の構成（順番は守りつつ、見出し名はもっと自然に）
1. タイトル（## で始める。必ず先頭に「【${date.replace(/-/g, "/")}】」を付け、続けて会場名・レース番号・特徴を含む具体的なもの、カッチリしすぎず、期待感が伝わるようにAI生成っぽくない、感情の入ったものに。（例：【4/17 蒲郡:レース番号】迷ったけど、ここは1号艇の〇〇選手を信じたい））
2. このレースを選んだ理由（## 見出し。語りかける口調で2〜3文）今日の体調や時事ニュース、レースと関係ない雑談から入る。
3. 自信度・狙い目（## 見出し。⭐の数・スタンス・点数を箇条書きで）
4. レース当日のコンディション（## 見出し。天候データを箇条書きで）
5. 展示気配の評価（## 見出し。各艇を箇条書きで。例：「- 🥇 **1号艇 田中**：節イチの仕上がり。文句なし」）
6. 展開予想ストーリー（## 見出し。> 引用ブロックで語りかける形で）
7. 本命の根拠（## 見出し。✅ 絵文字を使った箇条書きで4〜5項目）
8. 買い目公開（## 見出し。本線・対抗・穴・大穴を箇条書きで。資金配分も％表示で箇条書き）
9. 「崩れた場合」の話（## 見出し。> 引用ブロックで誠実に一言）
10. 免責事項（--- 区切り線の後に1行）


## その他の注意事項
- スクリーンショットの挿入箇所は以下の説明文を太字で記載する（場所ごとに内容を変えること）
  - 展示気配の評価セクションの直後：「📸 **【スクショ①：予想アプリの「艇別スコア詳細」画面。各艇のAIスコアと順位が確認できます】**」
  - 展開予想ストーリーセクションの直後：「📸 **【スクショ②：予想アプリの「コース別複勝率グラフ（過去7年）」。担当コースでの実績トレンドが確認できます】**」
  - 大穴分析がある場合はその直後：「📸 **【スクショ③：予想アプリの「大穴要因レーダーチャート」。波乱リスクの各要因スコアが8軸で可視化されています】**」
- 各セクションの間には --- で区切り線を入れて読みやすくする
- 絵文字を適度に使って視覚的にわかりやすくする
- **データがない・不明な項目は記事に一切書かないこと**（「不明」「情報なし」「取得できませんでした」などの記載も禁止）
- 天候データがない場合はコンディションセクション自体を丸ごと省く
- グレード名・レース名がない場合はタイトルに含めない
- 全体で800〜1200文字程度にまとめる`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: `43歳、元エンジニアで現在無職のおじさん競艇予想家になりきって、noteに投稿する競艇予想記事をMarkdown形式で書いてください。柔らかい物腰で、読者に語りかけるような文体でお願いします。「〜ですね」「〜なんですよ」「〜かなと思います」といった口調を使ってください。時々人を傷つけないようなジョークやユーモアを交えてお願いします。断定的にならず、あくまで自分の見解として丁寧に伝えてください。一日に何度も予想をする場合は、記事の内容が似通らないように工夫してください。競艇歴:20年、note歴:5年のベテラン予想家です。エンジニア出身なのでデータは重視しつつも、長年の勘や経験も大切にしています。`,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  const costUsd =
    (inputTokens / 1_000_000) * 0.8 + (outputTokens / 1_000_000) * 4.0;
  const costJpy = costUsd * 150;
  console.log(
    `[usage] input: ${inputTokens} tokens / output: ${outputTokens} tokens`,
  );
  console.log(
    `[usage] 推定費用: $${costUsd.toFixed(4)} (約${costJpy.toFixed(1)}円)`,
  );

  return { markdown: text, articleNo };
});
