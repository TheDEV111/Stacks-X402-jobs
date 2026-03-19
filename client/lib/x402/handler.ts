/**
 * x402 Payment Handler for Next.js App Router
 *
 * Since the x402-stacks middleware is Express-based, this module implements
 * the same flow using Web Request/Response APIs compatible with App Router.
 */

import {
  X402PaymentVerifier,
  X402_HEADERS,
  networkToCAIP2,
} from "x402-stacks";
import type {
  PaymentRequiredV2,
  PaymentRequirementsV2,
  PaymentPayloadV2,
  SettlementResponseV2,
  NetworkV2,
  NetworkType,
} from "x402-stacks";

export interface X402RouteConfig {
  /** Payment amount in microSTX (as string) */
  amount: string;
  /** Recipient Stacks address (SERVER_ADDRESS) */
  payTo: string;
  /** Network: "testnet" or "mainnet" (converted to CAIP-2) */
  network: string;
  /** Facilitator URL */
  facilitatorUrl: string;
  /** Human-readable description of the skill */
  description: string;
  /** The resource URL path (e.g. "/api/skills/whale-tracker") */
  resource: string;
}

/**
 * Check if the incoming request has a payment-signature header.
 * If not, return a 402 Response with payment-required header.
 * If yes, verify & settle via facilitator, then return the settlement result.
 */
export async function handleX402Payment(
  request: Request,
  config: X402RouteConfig
): Promise<
  | { paid: false; response: Response }
  | { paid: true; settlement: SettlementResponseV2 }
> {
  const network: NetworkV2 = config.network.includes(":")
    ? (config.network as NetworkV2)
    : (networkToCAIP2(config.network as NetworkType) as NetworkV2);

  const paymentRequirements: PaymentRequirementsV2 = {
    scheme: "exact",
    network,
    amount: config.amount,
    asset: "STX",
    payTo: config.payTo,
    maxTimeoutSeconds: 300,
  };

  // Check for payment-signature header
  const signatureHeader = request.headers.get(X402_HEADERS.PAYMENT_SIGNATURE);

  if (!signatureHeader) {
    // Return 402 Payment Required
    const paymentRequired: PaymentRequiredV2 = {
      x402Version: 2,
      resource: {
        url: config.resource,
        description: config.description,
      },
      accepts: [paymentRequirements],
    };

    const encoded = Buffer.from(JSON.stringify(paymentRequired)).toString(
      "base64"
    );

    return {
      paid: false,
      response: new Response(JSON.stringify(paymentRequired), {
        status: 402,
        headers: {
          "Content-Type": "application/json",
          [X402_HEADERS.PAYMENT_REQUIRED]: encoded,
        },
      }),
    };
  }

  // Decode payment payload
  let paymentPayload: PaymentPayloadV2;
  try {
    const decoded = Buffer.from(signatureHeader, "base64").toString("utf-8");
    paymentPayload = JSON.parse(decoded);
  } catch {
    return {
      paid: false,
      response: new Response(
        JSON.stringify({ error: "invalid_payload", message: "Failed to decode payment-signature header" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  // Validate version
  if (paymentPayload.x402Version !== 2) {
    return {
      paid: false,
      response: new Response(
        JSON.stringify({ error: "invalid_x402_version", message: "Only x402 v2 is supported" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  // Settle via facilitator
  const verifier = new X402PaymentVerifier(config.facilitatorUrl);
  let settlement: SettlementResponseV2;

  try {
    settlement = await verifier.settle(paymentPayload, {
      paymentRequirements,
    });
  } catch {
    return {
      paid: false,
      response: new Response(
        JSON.stringify({
          error: "facilitator_unavailable",
          message: "Payment settlement service is temporarily unavailable. Please retry.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  if (!settlement.success) {
    const encoded = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        resource: { url: config.resource, description: config.description },
        accepts: [paymentRequirements],
      })
    ).toString("base64");

    return {
      paid: false,
      response: new Response(
        JSON.stringify({
          error: settlement.errorReason || "settlement_failed",
          payer: settlement.payer,
          transaction: settlement.transaction,
        }),
        {
          status: 402,
          headers: {
            "Content-Type": "application/json",
            [X402_HEADERS.PAYMENT_REQUIRED]: encoded,
          },
        }
      ),
    };
  }

  return { paid: true, settlement };
}

/**
 * Helper: build a 200 response with payment-response header attached.
 */
export function paidResponse(
  data: unknown,
  settlement: SettlementResponseV2
): Response {
  const paymentResponse = {
    success: settlement.success,
    payer: settlement.payer,
    transaction: settlement.transaction,
    network: settlement.network,
  };

  const encoded = Buffer.from(JSON.stringify(paymentResponse)).toString(
    "base64"
  );

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      [X402_HEADERS.PAYMENT_RESPONSE]: encoded,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
