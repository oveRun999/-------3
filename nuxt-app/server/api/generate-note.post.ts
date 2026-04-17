import Anthropic from "@anthropic-ai/sdk";

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
    `◎本線: ${honmei}`,
    `○対抗: ${taikou}`,
    ana ? `△穴: ${ana}` : "",
    oozana ? `💥大穴: ${oozana}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `あなたは競艇予想をnoteで発信している40代のおじさんです。柔らかい物腰で、読者に語りかけるような文体で書きます。「〜ですね」「〜なんですよ」「〜かなと思います」といった口調を使ってください。断定的にならず、あくまで自分の見解として丁寧に伝えます。

以下のレースデータをもとに、noteに投稿する競艇予想記事をMarkdown形式で書いてください。

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

## 記事の構成（必ずこの順番で書いてください）
1. タイトル（## で始める。日付（${date}）・会場名・レース番号・特徴を含む具体的なもの）
2. このレースを選んだ理由（## 見出し。語りかける口調で2〜3文）
3. 自信度・狙い目（## 見出し。⭐の数・スタンス・点数を箇条書きで）
4. レース当日のコンディション（## 見出し。天候データを箇条書きで）
5. 展示気配の評価（## 見出し。各艇を箇条書きで。例：「- 🥇 **1号艇 田中**：節イチの仕上がり。文句なし」）
6. 展開予想ストーリー（## 見出し。> 引用ブロックで語りかける形で）
7. 本命の根拠（## 見出し。✅ 絵文字を使った箇条書きで4〜5項目）
8. 買い目公開（## 見出し。本線・対抗・穴・大穴を箇条書きで。資金配分も箇条書き）
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
    system: `熊本在住の43歳、元エンジニアで現在無職のおじさん競艇予想家になりきって、noteに投稿する競艇予想記事をMarkdown形式で書いてください。柔らかい物腰で、読者に語りかけるような文体でお願いします。「〜ですね」「〜なんですよ」「〜かなと思います」といった口調を使ってください。断定的にならず、あくまで自分の見解として丁寧に伝えてください。一日に何度も予想をする場合は、記事の内容が似通らないように工夫してください。競艇歴:20年、note歴:5年のベテラン予想家です。`,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  // トークン使用量と推定費用をターミナルに出力
  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  const costUsd =
    (inputTokens / 1_000_000) * 0.8 + (outputTokens / 1_000_000) * 4.0;
  const costJpy = costUsd * 150;
  console.log(
    `[usage] input: ${inputTokens} tokens / output: ${outputTokens} tokens`,
  );
  console.log(
    `[usage] 推定費用: $${costUsd.toFixed(5)} （約${costJpy.toFixed(2)}円）`,
  );

  return { markdown: text };
});
