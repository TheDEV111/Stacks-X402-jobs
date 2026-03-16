import { NextResponse } from "next/server";
import { getAllSkills } from "@/lib/skills-config";

export async function GET(request: Request) {
  const skills = getAllSkills();
  const baseUrl = new URL(request.url).origin;

  const paths: Record<string, unknown> = {
    "/api/registry/skills": {
      get: {
        summary: "List available skills",
        responses: {
          "200": { description: "Skills registry" },
        },
      },
    },
    "/api/stats/global": {
      get: {
        summary: "Get global marketplace stats",
        responses: {
          "200": { description: "Global stats" },
        },
      },
    },
  };

  for (const skill of skills) {
    paths[`/api/skills/${skill.id}`] = {
      [skill.method.toLowerCase()]: {
        summary: `Execute ${skill.name}`,
        description: `${skill.description}. May return HTTP 402 with payment requirements before execution.`,
        responses: {
          "200": { description: "Skill result" },
          "402": { description: "Payment required" },
          "422": { description: "Validation error" },
        },
      },
    };
  }

  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "x402 Skills API",
      version: "1.0.0",
      description:
        "Pay-per-use AI skills marketplace powered by x402 on Stacks.",
    },
    servers: [{ url: baseUrl }],
    paths,
  });
}
