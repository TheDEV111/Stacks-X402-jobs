import { NextResponse } from "next/server";
import { getAllSkills } from "@/lib/skills-config";

export async function GET(request: Request) {
  const baseUrl = new URL(request.url).origin;

  const skills = getAllSkills().map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    endpoint: skill.endpoint,
    method: skill.method,
    priceMicroSTX: skill.priceMicroSTX,
    dataSource: skill.dataSource,
    category: skill.category,
  }));

  return NextResponse.json({
    marketplace: "x402.skills",
    protocol: "x402",
    network: process.env.NEXT_PUBLIC_NETWORK || "testnet",
    discovery: {
      openapi: `${baseUrl}/api/openapi`,
      pluginManifest: `${baseUrl}/.well-known/ai-plugin.json`,
      registry: `${baseUrl}/api/registry/skills`,
    },
    skills,
  });
}
