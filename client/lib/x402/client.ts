"use client";

import {
  decodePaymentRequired,
  encodePaymentPayload,
  decodePaymentResponse,
  X402_HEADERS,
} from "x402-stacks";
import type {
  PaymentRequiredV2,
  PaymentPayloadV2,
  SettlementResponseV2,
} from "x402-stacks";
import { request as stacksRequest } from "@stacks/connect";
import { getNetworkName } from "@/lib/stacks/network";

export type { PaymentRequiredV2, SettlementResponseV2 };

/**
 * Step 1: Fetch the 402 payment requirements from a skill endpoint.
 */
export async function fetchPaymentRequirements(
  endpoint: string
): Promise<PaymentRequiredV2> {
  const res = await fetch(endpoint, { method: "GET" });

  if (res.status !== 402) {
    throw new Error(`Expected 402, got ${res.status}`);
  }

  const header = res.headers.get(X402_HEADERS.PAYMENT_REQUIRED);
  if (!header) {
    throw new Error("Missing payment-required header in 402 response");
  }

  const parsed = decodePaymentRequired(header);
  if (!parsed) {
    throw new Error("Failed to decode payment-required header");
  }

  return parsed;
}

/**
 * Step 2: Sign an STX transfer via the user's wallet (does NOT broadcast).
 * Returns the signed transaction hex.
 */
export async function signPaymentTransaction(
  requirements: PaymentRequiredV2
): Promise<string> {
  const accept = requirements.accepts[0];
  if (!accept) throw new Error("No payment requirements available");

  const network = getNetworkName();

  // Use @stacks/connect v8 request API — sign but don't broadcast
  const result = await stacksRequest("stx_transferStx", {
    recipient: accept.payTo,
    amount: accept.amount,
    memo: `x402:${requirements.resource.url ?? "skill"}`,
    network,
  });

  // result.transaction is the signed tx hex
  if (!result.transaction) {
    throw new Error("Wallet did not return a signed transaction");
  }

  return result.transaction;
}

/**
 * Step 3: Submit the signed tx to the skill endpoint with payment-signature header.
 * The server forwards to the facilitator for atomic settlement.
 */
export async function executeWithPayment<T = unknown>(
  endpoint: string,
  signedTx: string,
  requirements: PaymentRequiredV2,
  body?: Record<string, unknown>
): Promise<{ data: T; settlement: SettlementResponseV2 | null }> {
  const accept = requirements.accepts[0];
  if (!accept) throw new Error("No payment requirements available");

  const payload: PaymentPayloadV2 = {
    x402Version: 2,
    resource: requirements.resource,
    accepted: accept,
    payload: { transaction: signedTx },
  };

  const encodedPayload = encodePaymentPayload(payload);

  // Preserve original API semantics: POST when body exists, otherwise GET.
  const method = body ? "POST" : "GET";

  const res = await fetch(endpoint, {
    method,
    headers: {
      "Content-Type": "application/json",
      [X402_HEADERS.PAYMENT_SIGNATURE]: encodedPayload,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "Unknown error");
    throw new Error(`Skill execution failed (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as T;
  const settlementHeader = res.headers.get(X402_HEADERS.PAYMENT_RESPONSE);
  const settlement = decodePaymentResponse(settlementHeader);

  return { data, settlement };
}

/**
 * Full x402 payment flow: fetch requirements → sign → execute.
 *
 * Calls `onStateChange` at each step so the UI can show progress.
 */
export async function executeSkillWithPayment<T = unknown>(opts: {
  endpoint: string;
  body?: Record<string, unknown>;
  onStateChange?: (
    state: "signing" | "broadcasting" | "confirming" | "executing"
  ) => void;
}): Promise<{ data: T; settlement: SettlementResponseV2 | null }> {
  const { endpoint, body, onStateChange } = opts;

  // 1. Fetch 402 requirements
  onStateChange?.("signing");
  const requirements = await fetchPaymentRequirements(endpoint);

  // 2. Sign tx
  const signedTx = await signPaymentTransaction(requirements);

  // 3. Broadcasting / confirming (facilitator handles this)
  onStateChange?.("broadcasting");

  // 4. Execute
  onStateChange?.("executing");
  const result = await executeWithPayment<T>(
    endpoint,
    signedTx,
    requirements,
    body
  );

  return result;
}
