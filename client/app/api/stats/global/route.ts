import { NextResponse } from "next/server";
import { getAllSkills, CATEGORIES } from "@/lib/skills-config";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";

// 60 requests per 60s per IP — read-only, cacheable
const limiter = createRateLimiter("stats", { maxRequests: 60, windowSec: 60 });

/**
 * GET /api/stats/global
 *
 * Public endpoint — returns platform-level statistics.
 * For the hackathon MVP, stats are derived from the skills config.
 * Post-launch these will be computed from Supabase execution logs.
 */
export async function GET(request: Request) {
  const rl = limiter.check(getClientIp(request));
  if (!rl.allowed) return rl.response;

  const skills = getAllSkills();

  const totalSkills = skills.length;
  const totalRevenueSTX = 0; // will come from Supabase later
  const totalExecutions = 0; // will come from Supabase later

  const priceRange = {
    min: Math.min(...skills.map((s) => s.priceSTX)),
    max: Math.max(...skills.map((s) => s.priceSTX)),
  };

  const categoryCounts: Record<string, number> = {};
  for (const skill of skills) {
    categoryCounts[skill.category] = (categoryCounts[skill.category] || 0) + 1;
  }

  return NextResponse.json(
    {
      totalSkills,
      totalExecutions,
      totalRevenueSTX,
      priceRange,
      categories: CATEGORIES.map((c) => ({
        ...c,
        skillCount: categoryCounts[c.id] || 0,
      })),
      network: process.env.NEXT_PUBLIC_NETWORK || "testnet",
      timestamp: Math.floor(Date.now() / 1000),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    }
  );
}
