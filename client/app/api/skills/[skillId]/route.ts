import { NextResponse } from "next/server";
import { getSkill, SKILL_INPUT_SCHEMAS } from "@/lib/skills-config";
import { handleX402Payment, paidResponse, type X402RouteConfig } from "@/lib/x402/handler";
import {
  executeWhaleTracker,
  executeContentCraft,
  executeStacksScout,
  executeProfilePro,
  executeMemeRadar,
} from "@/lib/skills/executors";
import type { SkillId } from "@/types/skill";

// Max request body size (50 KB) to prevent abuse
const MAX_BODY_SIZE = 50 * 1024;

// ── Executor dispatch ──────────────────────────────────────

const EXECUTORS: Record<SkillId, (input: any) => Promise<any>> = {
  "whale-tracker": executeWhaleTracker,
  "content-craft": executeContentCraft,
  "stacks-scout": executeStacksScout,
  "profile-pro": executeProfilePro,
  "meme-radar": executeMemeRadar,
};

// ── Helpers ────────────────────────────────────────────────

function getRouteConfig(skillId: string): X402RouteConfig | null {
  const skill = getSkill(skillId);
  if (!skill) return null;

  const payTo = process.env.SERVER_ADDRESS;
  if (!payTo) return null; // Fail closed — never accept payments to empty address

  return {
    amount: skill.priceMicroSTX.toString(),
    payTo,
    network: process.env.NEXT_PUBLIC_NETWORK || "testnet",
    facilitatorUrl:
      process.env.NEXT_PUBLIC_FACILITATOR_URL ||
      "https://facilitator.stacksx402.com",
    description: `${skill.name} — ${skill.description}`,
    resource: `/api/skills/${skillId}`,
  };
}

function parseInput(request: Request, url: URL): any {
  // For GET requests, parse query params as input
  const input: Record<string, unknown> = {};
  url.searchParams.forEach((value, key) => {
    // Attempt to parse JSON values (arrays, numbers, booleans)
    try {
      input[key] = JSON.parse(value);
    } catch {
      input[key] = value;
    }
  });
  return input;
}

// ── Route handler ──────────────────────────────────────────

async function handleSkillRequest(
  request: Request,
  { params }: { params: Promise<{ skillId: string }> }
) {
  const { skillId } = await params;

  // 1. Look up skill
  const skill = getSkill(skillId);
  if (!skill) {
    return NextResponse.json(
      { error: "not_found", message: `Skill "${skillId}" not found` },
      { status: 404 }
    );
  }

  // 2. Build x402 config
  const config = getRouteConfig(skillId);
  if (!config || !config.payTo) {
    return NextResponse.json(
      { error: "config_error", message: "Server payment address not configured" },
      { status: 500 }
    );
  }

  // 3. Check payment
  const paymentResult = await handleX402Payment(request, config);
  if (!paymentResult.paid) {
    return paymentResult.response;
  }

  // 4. Parse & validate input
  let rawInput: any;
  const url = new URL(request.url);

  if (request.method === "POST") {
    // Guard against oversized payloads
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: "payload_too_large", message: "Request body exceeds maximum size" },
        { status: 413 }
      );
    }

    try {
      rawInput = await request.json();
    } catch {
      return NextResponse.json(
        { error: "invalid_body", message: "Request body must be valid JSON" },
        { status: 400 }
      );
    }
  } else {
    rawInput = parseInput(request, url);
  }

  const schema = SKILL_INPUT_SCHEMAS[skillId as SkillId];
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        message: "Invalid input parameters",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 }
    );
  }

  // 5. Execute skill
  const executor = EXECUTORS[skillId as SkillId];
  if (!executor) {
    return NextResponse.json(
      { error: "not_implemented", message: `Executor for "${skillId}" not found` },
      { status: 501 }
    );
  }

  try {
    const result = await executor(parsed.data);
    return paidResponse(
      {
        skill: skillId,
        result,
        executed_at: Math.floor(Date.now() / 1000),
      },
      paymentResult.settlement
    );
  } catch (err) {
    console.error(`[${skillId}] Execution error:`, err);
    // Never leak internal error details to clients
    return NextResponse.json(
      {
        error: "execution_error",
        message: "Skill execution failed. Please try again.",
      },
      { status: 500 }
    );
  }
}

// Export both GET and POST handlers
export const GET = handleSkillRequest;
export const POST = handleSkillRequest;
