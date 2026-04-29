// POST /api/generate-note-all
// 指定会場の全レース（最大12R）をまとめてNote記事に生成する
import Anthropic from "@anthropic-ai/sdk";

interface RaceData {
  raceNo: number;
  boats: any[];
  raceInfo: any;
  weather: any;
  upsetAnalysis: any;
}

function scoreDiffOf(boats: any[]): number {
  if (boats.length < 2) return 0;
  const sorted = [...boats].sort((a, b) => b.score - a.score);
  return (sorted[0]?.score ?? 0) - (sorted[1]?.score ?? 0);
}

function starsOf(diff: number): string {
  if (diff >= 10) return "★★★★★";
  if (diff >= 7)  return "★★★★☆";
  if (diff >= 4)  return "★★★☆☆";
  if (diff >= 2)  return "★★☆☆☆";
  return "★☆☆☆☆";
}

function betOf(b0: any, b1: any, b2: any): string {
  return [b0, b1, b2]
    .filter(Boolean)
    .map((b: any) => b.艇番)
    .join("→");
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { date, venueName, races } = body as {
    date: string;
    venueName: string;
    races: RaceData[];
  };

  if (!date || !venueName || !races?.length) {
    throw createError({ statusCode: 400, message: "date / venueName / races は必須です" });
  }

  const config = useRuntimeConfig();
  const apiKey = config.anthropicApiKey;
  if (!apiKey) {
    throw createError({ statusCode: 500, message: "ANTHROPIC_API_KEY が設定されていません" });
  }

  // ---- 各レースの 本命/対抗/穴/大穴/自信度 を計算 ----
  const raceBlocks = races.map((r) => {
    const sorted = [...r.boats].sort((a, b) => b.score - a.score);
    const [b1, b2, b3, b4] = sorted;
    const diff = scoreDiffOf(r.boats);
    const stars = starsOf(diff);

    // 大穴: upsetAnalysisのboatsがあればそちら、なければb4基点
    let oozana = "";
    if (r.upsetAnalysis?.boats?.length >= 3) {
      oozana = r.upsetAnalysis.boats.map((b: any) => b.艇番).join("→");
    } else if (b4) {
      oozana = betOf(b4, b1, b2);
    }

    return {
      raceNo: r.raceNo,
      gradeName: r.raceInfo?.グレード名 ?? "",
      raceName: r.raceInfo?.レース名 ?? "",
      honmei: betOf(b1, b2, b3),
      taikou: betOf(b2, b1, b3),
      ana: b3 ? betOf(b3, b1, b2) : "",
      oozana,
      stars,
      diff: diff.toFixed(1),
      boatSummary: sorted.slice(0, 3).map((b: any) =>
        `${b.艇番}号艇 ${b.選手名 ?? ""}(${b.score?.toFixed(1)}pt)`
      ).join(" / "),
      upsetLevel: r.upsetAnalysis?.level ?? "",
    };
  });

  // ---- Claude で各レースの一言コメントを一括生成 ----
  const client = new Anthropic({ apiKey });

  const racesForPrompt = raceBlocks.map((r) =>
    `${r.raceNo}R: 上位艇=${r.boatSummary}、スコア差=${r.diff}pt、大穴レベル=${r.upsetLevel || "なし"}`
  ).join("\n");

  const commentPrompt = `以下は${venueName}競艇場の全レースデータです。
下記のJSON形式のみで出力してください（余計なテキスト不要）。

1. "lead": 記事全体のリード文（50〜80文字）。今日の${venueName}全レースの予想について、読者に語りかける口調で一言まとめてください。
2. "comments": 各レースの一言コメント（20〜40文字）。予想家らしい語り口で、艇番や展開予想を含めてください。

出力形式:
{"lead":"...","comments":[{"raceNo":1,"comment":"..."},{"raceNo":2,"comment":"..."},...]}

レースデータ:
${racesForPrompt}`;

  let lead = "";
  let comments: Record<number, string> = {};
  let costJpy = 0;
  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: commentPrompt }],
    });
    const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      lead = parsed.lead ?? "";
      const arr: { raceNo: number; comment: string }[] = parsed.comments ?? [];
      arr.forEach((item) => { comments[item.raceNo] = item.comment; });
    }
    // Haiku 4.5: input $0.8/Mtok, output $4.0/Mtok
    const inputTok = msg.usage.input_tokens;
    const outputTok = msg.usage.output_tokens;
    const costUsd = (inputTok / 1_000_000) * 0.8 + (outputTok / 1_000_000) * 4.0;
    costJpy = Math.ceil(costUsd * 150 * 100) / 100; // 小数第2位まで
    console.log(`[generate-note-all] input:${inputTok} output:${outputTok} cost:$${costUsd.toFixed(4)} (${costJpy}円)`);
  } catch (e) {
    console.error("[generate-note-all] comment generation failed:", e);
  }

  // ---- Markdown 組み立て ----
  const d = new Date(date + "T00:00:00");
  const dateLabel = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;

  const lines: string[] = [];
  lines.push(`## 【${dateLabel}】競艇予想・${venueName}レースまとめ`);
  lines.push("");
  if (lead) lines.push(lead);
  lines.push("");
  lines.push("★評価の基準：★1（波乱含み）、★3（標準）、★5（鉄板・勝負レース）");
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const r of raceBlocks) {
    lines.push(`### ■ ${venueName}　${r.raceNo}R${r.gradeName ? `（${r.gradeName}）` : ""}`);
    lines.push(`- 本命 (◎): ${r.honmei}`);
    lines.push(`- 対抗 (○): ${r.taikou}`);
    if (r.ana)    lines.push(`- 穴　 (▲): ${r.ana}`);
    if (r.oozana) lines.push(`- 大穴 (×): ${r.oozana}`);
    lines.push(`- 自信度: ${r.stars}`);
    const comment = comments[r.raceNo] ?? "";
    lines.push(`- 一言コメント: ${comment}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  const markdown = lines.join("\n");

  // ---- カード表示用の構造化データ ----
  const cards = raceBlocks.map((r) => ({
    raceNo: r.raceNo,
    gradeName: r.gradeName,
    raceName: r.raceName,
    honmei: r.honmei,
    taikou: r.taikou,
    ana: r.ana,
    oozana: r.oozana,
    stars: r.stars,
    comment: comments[r.raceNo] ?? "",
  }));

  return { markdown, cards, lead, venueName, dateLabel, costJpy };
});
