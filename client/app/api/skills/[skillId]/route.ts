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
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import type { SkillId } from "@/types/skill";
import { X402_HEADERS } from "x402-stacks";

// Max request body size (50 KB) to prevent abuse
const MAX_BODY_SIZE = 50 * 1024;

// 20 requests per 60s per IP — these routes cost compute + payment overhead
const limiter = createRateLimiter("skills", { maxRequests: 20, windowSec: 60 });

// ── Executor dispatch ──────────────────────────────────────

const EXECUTORS = {
  "whale-tracker": executeWhaleTracker,
  "content-craft": executeContentCraft,
  "stacks-scout": executeStacksScout,
  "profile-pro": executeProfilePro,
  "meme-radar": executeMemeRadar,
} as const;

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

function parseInput(url: URL): Record<string, unknown> {
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

async function parseJsonBodyWithLimit(
  request: Request,
  maxBytes: number
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; response: Response }
> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "payload_too_large",
          message: "Request body exceeds maximum size",
        },
        { status: 413 }
      ),
    };
  }

  if (!request.body) {
    return { ok: true, data: {} };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: "payload_too_large",
              message: "Request body exceeds maximum size",
            },
            { status: 413 }
          ),
        };
      }
      chunks.push(value);
    }
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "invalid_body", message: "Could not read request body" },
        { status: 400 }
      ),
    };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder().decode(bytes);
    return { ok: true, data: text ? JSON.parse(text) : {} };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "invalid_body", message: "Request body must be valid JSON" },
        { status: 400 }
      ),
    };
  }
}

async function parseRequestInput(
  request: Request
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; response: Response }
> {
  if (request.method === "GET") {
    return { ok: true, data: parseInput(new URL(request.url)) };
  }

  if (request.method === "POST") {
    return parseJsonBodyWithLimit(request, MAX_BODY_SIZE);
  }

  return {
    ok: false,
    response: NextResponse.json(
      {
        error: "method_not_allowed",
        message: `Unsupported method: ${request.method}`,
      },
      { status: 405 }
    ),
  };
}

// ── Route handler ──────────────────────────────────────────

async function handleSkillRequest(
  request: Request,
  { params }: { params: Promise<{ skillId: string }> }
) {
  // 0. Rate limit
  const rl = limiter.check(getClientIp(request));
  if (!rl.allowed) return rl.response;

  const { skillId } = await params;

  // 1. Look up skill
  const skill = getSkill(skillId);
  if (!skill) {
    return NextResponse.json(
      { error: "not_found", message: `Skill "${skillId}" not found` },
      { status: 404 }
    );
  }

  // Enforce configured HTTP method — but only on paid execution attempts.
  // The initial discovery request (no payment-signature) may use GET even for
  // POST skills so the client can retrieve the 402 payment requirements.
  const hasPaymentSignature = Boolean(
    request.headers.get(X402_HEADERS.PAYMENT_SIGNATURE)
  );

  if (hasPaymentSignature && request.method !== skill.method) {
    return NextResponse.json(
      {
        error: "method_not_allowed",
        message: `Skill \"${skillId}\" only supports ${skill.method}`,
      },
      {
        status: 405,
        headers: { Allow: skill.method },
      }
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

  // 3. If this is a paid execution attempt, validate input first to avoid charging invalid requests.
  let validatedInput: unknown = {};

  if (hasPaymentSignature) {
    const parsedInput = await parseRequestInput(request);
    if (!parsedInput.ok) {
      return parsedInput.response;
    }

    const schema = SKILL_INPUT_SCHEMAS[skillId as SkillId];
    const parsed = schema.safeParse(parsedInput.data);
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

    validatedInput = parsed.data;
  }

  // 4. Check payment (returns 402 for discovery requests without payment-signature).
  const paymentResult = await handleX402Payment(request, config);
  if (!paymentResult.paid) {
    return paymentResult.response;
  }

  // 5. Execute skill
  const executor = EXECUTORS[skillId as SkillId] as (
    input: unknown
  ) => Promise<unknown>;
  if (!executor) {
    return NextResponse.json(
      { error: "not_implemented", message: `Executor for "${skillId}" not found` },
      { status: 501 }
    );
  }

  try {
    const result = await executor(validatedInput);
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
