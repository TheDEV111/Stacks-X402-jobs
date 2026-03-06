import { NextResponse } from "next/server";
import { getAllSkills } from "@/lib/skills-config";
import type { Skill } from "@/types/skill";

/**
 * GET /api/registry/skills
 *
 * Public endpoint — returns all available skills with metadata.
 * Strips the inputSchema (non-serialisable Zod object) before sending.
 */
export async function GET() {
  const skills = getAllSkills().map((skill: Skill) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { inputSchema: _, ...serializable } = skill;
    return serializable;
  });

  return NextResponse.json(
    {
      skills,
      count: skills.length,
      timestamp: Math.floor(Date.now() / 1000),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    }
  );
}
