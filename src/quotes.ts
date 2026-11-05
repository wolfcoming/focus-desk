export type Quote = { text: string; from?: string };

/** 离线兜底：短句、偏哲理，适合侧栏 */
const LOCAL: Quote[] = [
  { text: "知止而后有定，定而后能静。", from: "大学" },
  { text: "君子务本，本立而道生。", from: "论语" },
  { text: "行胜于言。", from: "朱熹" },
  { text: "千里之行，始于足下。", from: "老子" },
  { text: "凡事豫则立，不豫则废。", from: "中庸" },
  { text: "静以修身，俭以养德。", from: "诸葛亮" },
  { text: "欲速则不达。", from: "论语" },
  { text: "博学之，审问之，慎思之，明辨之，笃行之。", from: "中庸" },
  { text: "不积跬步，无以至千里。", from: "荀子" },
  { text: "心静则智生。", from: "菜根谭" },
  { text: "少则得，多则惑。", from: "老子" },
  { text: "与其临渊羡鱼，不如退而结网。", from: "汉书" },
];

function dayIndex(length: number) {
  const key = new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return length === 0 ? 0 : hash % length;
}

export function localQuoteOfDay(): Quote {
  return LOCAL[dayIndex(LOCAL.length)] ?? LOCAL[0];
}

/** 一言：免费、免 Key；c=k 为哲学类。失败时回落本地。 */
export async function fetchRailQuote(): Promise<Quote> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch("https://v1.hitokoto.cn/?c=k&max_length=40", {
      signal: controller.signal,
    });
    if (!response.ok) return localQuoteOfDay();
    const data = (await response.json()) as {
      hitokoto?: string;
      from?: string | null;
      from_who?: string | null;
    };
    const text = data.hitokoto?.trim();
    if (!text) return localQuoteOfDay();
    const from = [data.from_who, data.from].filter(Boolean).join(" · ") || undefined;
    return { text, from };
  } catch {
    return localQuoteOfDay();
  } finally {
    window.clearTimeout(timer);
  }
}
