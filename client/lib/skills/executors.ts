/**
 * Skill Executors
 *
 * Each function runs the actual logic for a skill.
 * For the hackathon MVP, some return real data from Hiro API,
 * and others return curated demo data (OpenAI / social skills
 * will be wired to real APIs post-hackathon).
 */

// ── Whale Tracker ──────────────────────────────────────────

interface WhaleTrackerInput {
  timeframe?: string;
  minAmount?: number;
  limit?: number;
}

export async function executeWhaleTracker(input: WhaleTrackerInput) {
  const { timeframe = "24h", minAmount = 100000, limit = 10 } = input;
  const hiroApi = process.env.HIRO_API_KEY
    ? `https://api.${getNetworkBase()}.hiro.so`
    : `https://api.${getNetworkBase()}.hiro.so`;

  const whaleThreshold = minAmount * 1_000_000; // convert STX to microSTX

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (process.env.HIRO_API_KEY) {
      headers["x-api-key"] = process.env.HIRO_API_KEY;
    }

    const res = await fetch(
      `${hiroApi}/extended/v1/tx?limit=${Math.min(limit, 50)}&type=token_transfer`,
      { headers, next: { revalidate: 30 } }
    );

    if (!res.ok) throw new Error(`Hiro API: ${res.status}`);
    const data = await res.json();

    const whaleMoves = (data.results || [])
      .filter((tx: any) => {
        const amount = Number(tx.token_transfer?.amount || 0);
        return amount >= whaleThreshold;
      })
      .slice(0, limit)
      .map((tx: any) => ({
        tx_id: tx.tx_id,
        amount: tx.token_transfer?.amount || "0",
        from: tx.sender_address,
        to: tx.token_transfer?.recipient_address,
        timestamp: tx.burn_block_time,
        block_height: tx.block_height,
      }));

    const totalVolume = whaleMoves.reduce(
      (sum: number, m: any) => sum + Number(m.amount),
      0
    );

    return {
      whale_moves: whaleMoves,
      total_volume: totalVolume.toString(),
      count: whaleMoves.length,
      timeframe,
      threshold_micro_stx: whaleThreshold,
    };
  } catch (err) {
    // Fallback to demo data if API fails
    return {
      whale_moves: [
        {
          tx_id: "0xdemo_whale_tx_001",
          amount: "500000000000",
          from: "SP2X0TZ59D5SZ8ACQ6YMCHHNR2ZN51Z32E4MHAJ",
          to: "SP3Y2ZSH8P74JNFHZ3THKMA2V9N540AJQG2XVHWX",
          timestamp: Math.floor(Date.now() / 1000) - 3600,
          block_height: 150000,
        },
      ],
      total_volume: "500000000000",
      count: 1,
      timeframe,
      threshold_micro_stx: whaleThreshold,
      _demo: true,
    };
  }
}

// ── Content Craft ──────────────────────────────────────────

interface ContentCraftInput {
  text: string;
  tone?: string;
  maxLength?: number;
}

export async function executeContentCraft(input: ContentCraftInput) {
  const { text, tone = "professional", maxLength = 500 } = input;

  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: `You are a professional content editor. Rewrite the given text in a ${tone} tone. Keep it under ${maxLength} characters. Return only the rewritten text.`,
            },
            { role: "user", content: text },
          ],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });

      if (!res.ok) throw new Error(`OpenAI: ${res.status}`);
      const data = await res.json();
      const rewritten = data.choices?.[0]?.message?.content?.trim() || text;

      return {
        original: text,
        rewritten,
        tone,
        word_count: rewritten.split(/\s+/).length,
        changes_summary: `Rewritten in ${tone} tone`,
      };
    } catch {
      // Fall through to demo
    }
  }

  // Demo response
  const demoRewrites: Record<string, string> = {
    professional:
      "Our platform delivers measurable productivity gains, enabling teams to accomplish more in less time with an intuitive, purpose-built workflow.",
    casual:
      "Our tool helps you get stuff done way faster — seriously, it's a game changer for busy teams.",
    technical:
      "The system optimizes task execution throughput via parallelized pipeline architecture, reducing mean completion time by up to 40%.",
  };

  return {
    original: text,
    rewritten: demoRewrites[tone] || demoRewrites.professional,
    tone,
    word_count: (demoRewrites[tone] || demoRewrites.professional).split(/\s+/).length,
    changes_summary: `Rewritten in ${tone} tone`,
    _demo: true,
  };
}

// ── Stacks Scout ───────────────────────────────────────────

interface StacksScoutInput {
  metrics?: string[];
  timeframe?: string;
}

export async function executeStacksScout(input: StacksScoutInput) {
  const { metrics = ["block_height", "transactions", "active_wallets"], timeframe = "24h" } = input;
  const hiroApi = `https://api.${getNetworkBase()}.hiro.so`;

  const headers: Record<string, string> = {};
  if (process.env.HIRO_API_KEY) {
    headers["x-api-key"] = process.env.HIRO_API_KEY;
  }

  const result: Record<string, unknown> = { timestamp: Math.floor(Date.now() / 1000) };

  try {
    if (metrics.includes("block_height")) {
      const res = await fetch(`${hiroApi}/extended/v2/blocks?limit=1`, { headers });
      if (res.ok) {
        const data = await res.json();
        result.block_height = data.results?.[0]?.height || 0;
        result.block_hash = data.results?.[0]?.hash;
      }
    }

    if (metrics.includes("transactions")) {
      const res = await fetch(`${hiroApi}/extended/v1/tx?limit=1`, { headers });
      if (res.ok) {
        const data = await res.json();
        result.transactions = {
          total: data.total || 0,
          recent_count: data.results?.length || 0,
        };
      }
    }

    if (metrics.includes("active_wallets")) {
      // Hiro API doesn't have a direct active wallets endpoint;
      // approximate from recent unique senders
      const res = await fetch(`${hiroApi}/extended/v1/tx?limit=50`, { headers });
      if (res.ok) {
        const data = await res.json();
        const uniqueSenders = new Set(
          (data.results || []).map((tx: any) => tx.sender_address)
        );
        result.active_wallets = {
          recent_unique_senders: uniqueSenders.size,
          sample_size: 50,
        };
      }
    }

    result.timeframe = timeframe;
    result.metrics_requested = metrics;
    return result;
  } catch {
    return {
      block_height: 150000,
      transactions: { total: 50000, recent_count: 50 },
      active_wallets: { recent_unique_senders: 35, sample_size: 50 },
      timeframe,
      metrics_requested: metrics,
      _demo: true,
    };
  }
}

// ── Profile Pro ────────────────────────────────────────────

interface ProfileProInput {
  profileUrl: string;
  analysisDepth?: string;
}

export async function executeProfilePro(input: ProfileProInput) {
  const { profileUrl, analysisDepth = "standard" } = input;

  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: `You are a social media analyst. Analyze the given profile URL and provide a ${analysisDepth} audit. Return JSON with: profile (username, platform), score (0-100), strengths (array), weaknesses (array), suggestions (array). Only return valid JSON.`,
            },
            { role: "user", content: `Analyze this profile: ${profileUrl}` },
          ],
          max_tokens: 500,
          temperature: 0.7,
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) throw new Error(`OpenAI: ${res.status}`);
      const data = await res.json();
      const analysis = JSON.parse(data.choices?.[0]?.message?.content || "{}");
      return { ...analysis, analysis_depth: analysisDepth };
    } catch {
      // Fall through to demo
    }
  }

  // Extract platform from URL
  const platform = profileUrl.includes("twitter") || profileUrl.includes("x.com")
    ? "twitter"
    : profileUrl.includes("github")
      ? "github"
      : "unknown";

  return {
    profile: {
      url: profileUrl,
      platform,
      analysis_depth: analysisDepth,
    },
    score: 72,
    strengths: [
      "Consistent posting schedule",
      "Good engagement-to-follower ratio",
      "Clear niche focus",
    ],
    weaknesses: [
      "Limited use of hashtags",
      "Bio could be more descriptive",
      "Inconsistent visual branding",
    ],
    suggestions: [
      "Add 2-3 relevant hashtags per post",
      "Update bio to highlight core expertise and include a CTA",
      "Create a consistent visual template for posts",
      "Increase posting frequency to 2x/day during peak hours",
    ],
    _demo: true,
  };
}

// ── Meme Radar ─────────────────────────────────────────────

interface MemeRadarInput {
  limit?: number;
  category?: string;
}

export async function executeMemeRadar(input: MemeRadarInput) {
  const { limit = 10, category = "all" } = input;

  // For MVP, return curated trending meme data
  const trendingMemes = [
    {
      title: "Number Go Up",
      description: "Bitcoin price celebration after breaking new ATH",
      sentiment: "bullish" as const,
      popularity_score: 95,
      sources: ["twitter", "reddit"],
      category: "bitcoin",
      first_seen: Math.floor(Date.now() / 1000) - 7200,
    },
    {
      title: "HODL Forever",
      description: "Diamond hands meme resurgence during correction",
      sentiment: "bullish" as const,
      popularity_score: 88,
      sources: ["twitter", "reddit", "discord"],
      category: "bitcoin",
      first_seen: Math.floor(Date.now() / 1000) - 14400,
    },
    {
      title: "Stacks Season",
      description: "STX community celebrating ecosystem growth",
      sentiment: "bullish" as const,
      popularity_score: 82,
      sources: ["twitter"],
      category: "stacks",
      first_seen: Math.floor(Date.now() / 1000) - 3600,
    },
    {
      title: "Rug Pull Detector",
      description: "Memes about identifying suspicious DeFi projects",
      sentiment: "bearish" as const,
      popularity_score: 76,
      sources: ["twitter", "reddit"],
      category: "defi",
      first_seen: Math.floor(Date.now() / 1000) - 21600,
    },
    {
      title: "Yield Farming Adventures",
      description: "Humorous takes on complex DeFi strategies",
      sentiment: "neutral" as const,
      popularity_score: 71,
      sources: ["twitter"],
      category: "defi",
      first_seen: Math.floor(Date.now() / 1000) - 10800,
    },
  ];

  const filtered =
    category === "all"
      ? trendingMemes
      : trendingMemes.filter((m) => m.category === category);

  const sentimentCounts = filtered.reduce(
    (acc, m) => {
      acc[m.sentiment] = (acc[m.sentiment] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const overallSentiment =
    (sentimentCounts.bullish || 0) > (sentimentCounts.bearish || 0)
      ? "bullish"
      : (sentimentCounts.bearish || 0) > (sentimentCounts.bullish || 0)
        ? "bearish"
        : "neutral";

  return {
    trending_memes: filtered.slice(0, limit),
    overall_sentiment: overallSentiment,
    trending_hashtags: ["#Bitcoin", "#HODL", "#Stacks", "#DeFi", "#Web3"],
    category_filter: category,
    timestamp: Math.floor(Date.now() / 1000),
    _demo: true,
  };
}

// ── Utils ──────────────────────────────────────────────────

function getNetworkBase(): string {
  return process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";
}
