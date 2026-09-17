import Anthropic from "@anthropic-ai/sdk";
import type { BrandConfig, GeneratedPost, Topic } from "./types.js";

const MODEL = "claude-sonnet-5";

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

async function draftArticle(
  brand: BrandConfig,
  topic: Topic
): Promise<string> {
  const anthropic = client();
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `あなたは美容サロン「${brand.name}」の公式ブログ執筆者です。
以下の条件で日本語のブログ記事本文をMarkdownで書いてください。

# テーマ
${topic.title}

# 想定検索キーワード
${topic.keywords.join(", ")}

# トーン・ブランドボイス
${brand.brandVoice}

# 執筆ルール
- 冒頭2〜3文で結論・要点を提示する「アンサーファースト」構成にする（AI検索エンジンや生成AIに引用されやすくするため）
- H2/H3見出しで論理的に構成する
- 記事後半に「よくある質問」セクションを3問程度のQ&A形式で入れる
- 施術効果を断定・保証する表現（「必ず」「絶対に」「治る」など）は使わない。個人差がある旨を自然に含める
- 文末に予約導線を1箇所入れる。必ずMarkdownのリンク記法 \`[LINEで予約する](${brand.bookingUrl})\` の形式で書き、URLをそのまま裸で書かないこと
- 文字数の目安は1800〜2500字
- Markdownのみを出力し、前置きや説明文は含めない`,
      },
    ],
  });
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  return text.trim();
}

interface SeoReviewResult {
  title: string;
  metaDescription: string;
  slug: string;
  jsonLd: Record<string, unknown>[];
  internalLinkSuggestions: string[];
  riskFlags: string[];
}

const SEO_REVIEW_TOOL: Anthropic.Tool = {
  name: "submit_seo_review",
  description:
    "SEO/AIOメタデータと薬機法・景品表示法リスクレビューの結果を提出する",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "32文字前後のSEOタイトル" },
      metaDescription: {
        type: "string",
        description: "110〜120文字程度のmeta description",
      },
      slug: { type: "string", description: "英数字とハイフンのみのURLスラッグ" },
      jsonLd: {
        type: "array",
        description:
          "Article と FAQPage の JSON-LD構造化データオブジェクトの配列（schema.org準拠）",
        items: { type: "object" },
      },
      internalLinkSuggestions: {
        type: "array",
        items: { type: "string" },
        description: "内部リンクを貼るとよい既存ページ・カテゴリの提案（日本語の説明でよい）",
      },
      riskFlags: {
        type: "array",
        items: { type: "string" },
        description:
          "本文中に薬機法・景品表示法上リスクがある表現があれば、該当箇所の引用と理由を列挙する。問題なければ空配列。",
      },
    },
    required: [
      "title",
      "metaDescription",
      "slug",
      "jsonLd",
      "internalLinkSuggestions",
      "riskFlags",
    ],
  },
};

async function reviewAndBuildSeo(
  brand: BrandConfig,
  topic: Topic,
  bodyMarkdown: string
): Promise<SeoReviewResult> {
  const anthropic = client();
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    tools: [SEO_REVIEW_TOOL],
    tool_choice: { type: "tool", name: "submit_seo_review" },
    messages: [
      {
        role: "user",
        content: `あなたは美容サロン「${brand.name}」のブログ編集者兼SEO/AIO担当、かつ薬機法・景品表示法のコンプライアンスレビュー担当です。
以下の記事本文をレビューし、submit_seo_reviewツールで結果を提出してください。

# サイトURL
${brand.siteUrl}

# 想定検索キーワード
${topic.keywords.join(", ")}

# 記事本文
${bodyMarkdown}

特にriskFlagsは、施術効果の断定・保証、最上級表現、ビフォーアフターの効果保証などを見逃さず厳しめにチェックしてください。`,
      },
    ],
  });
  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) throw new Error("Claude did not return a tool_use block");
  return toolUse.input as SeoReviewResult;
}

function renderInline(text: string): string {
  // Markdownのリンク記法・太字・裸URLを実際にクリックできる<a>タグに変換する。
  return text
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(
      /(^|[^"'>])(https?:\/\/[^\s<]+)/g,
      '$1<a href="$2" target="_blank" rel="noopener">$2</a>'
    );
}

function markdownToHtml(markdown: string): string {
  // WordPressはMarkdownをそのまま解釈しないため簡易変換する。
  // 高度な変換が必要な場合は `marked` 等の導入を検討する。
  return markdown
    .split(/\n{2,}/)
    .map((block) => {
      const heading = block.match(/^(#{1,3})\s+(.*)$/);
      if (heading) {
        const level = heading[1].length + 1; // H1は記事タイトルに使うのでH2から
        return `<h${level}>${renderInline(heading[2])}</h${level}>`;
      }
      if (block.trim().startsWith("- ")) {
        const items = block
          .split("\n")
          .map((line) => `<li>${renderInline(line.replace(/^-\s+/, ""))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      if (block.trim().startsWith("> ")) {
        const quote = block
          .split("\n")
          .map((line) => line.replace(/^>\s?/, ""))
          .join(" ");
        return `<blockquote><p>${renderInline(quote)}</p></blockquote>`;
      }
      return `<p>${renderInline(block.trim())}</p>`;
    })
    .join("\n");
}

export async function generatePost(
  brand: BrandConfig,
  topic: Topic
): Promise<GeneratedPost> {
  const bodyMarkdown = await draftArticle(brand, topic);
  const review = await reviewAndBuildSeo(brand, topic, bodyMarkdown);
  const bodyWithDisclaimer = `${bodyMarkdown}\n\n> ${brand.disclaimer}`;
  return {
    brandId: brand.id,
    topicId: topic.id,
    title: review.title,
    metaDescription: review.metaDescription,
    slug: review.slug,
    bodyMarkdown: bodyWithDisclaimer,
    bodyHtml: markdownToHtml(bodyWithDisclaimer),
    jsonLd: review.jsonLd,
    internalLinkSuggestions: review.internalLinkSuggestions,
    riskFlags: review.riskFlags,
  };
}
