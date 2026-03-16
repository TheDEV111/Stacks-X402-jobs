"use client";

import { useState, useCallback } from "react";
import { Zap, Wallet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/WalletProvider";
import { PaymentStatus } from "@/components/payment/PaymentStatus";
import { executeSkillWithPayment } from "@/lib/x402/client";
import { formatSTX } from "@/lib/utils/format";
import { getExplorerUrl, getFaucetUrl, getNetworkName } from "@/lib/stacks/network";
import { addExecutionHistory } from "@/lib/execution-history";
import type { PaymentState } from "@/types/payment";
import { toast } from "sonner";

interface PaymentButtonProps {
  /** Skill API endpoint, e.g. "/api/skills/whale-tracker" */
  endpoint: string;
  /** Skill id for analytics/history */
  skillId: string;
  /** Price in microSTX */
  priceMicroSTX: number;
  /** Optional POST body for the skill */
  body?: Record<string, unknown>;
  /** Called with the skill result on success */
  onResult?: (data: unknown) => void;
}

export function PaymentButton({
  endpoint,
  skillId,
  priceMicroSTX,
  body,
  onResult,
}: PaymentButtonProps) {
  const { address, balanceMicroSTX, connectWallet, isConnecting } = useWallet();
  const [state, setState] = useState<PaymentState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const insufficientBalance =
    balanceMicroSTX !== null && balanceMicroSTX < priceMicroSTX;

  const handleExecute = useCallback(async () => {
    setError(null);
    setTxHash(null);

    try {
      const result = await executeSkillWithPayment({
        endpoint,
        body,
        onStateChange: setState,
      });

      const hash = result.settlement?.transaction ?? null;
      setTxHash(hash);
      setState("success");
      onResult?.(result.data);

      addExecutionHistory({
        id: crypto.randomUUID(),
        skillId,
        endpoint,
        txHash: hash,
        priceMicroSTX,
        status: "success",
        requestBody: body ?? null,
        result: result.data,
        createdAt: Math.floor(Date.now() / 1000),
      });

      toast.success("Skill executed successfully", {
        description: hash
          ? `Tx: ${hash.slice(0, 10)}...${hash.slice(-6)}`
          : "Payment settled via facilitator",
      });
    } catch (err) {
      setState("error");
      const msg =
        err instanceof Error ? err.message : "An unknown error occurred";

      // Detect user rejection
      if (
        msg.toLowerCase().includes("cancel") ||
        msg.toLowerCase().includes("reject") ||
        msg.toLowerCase().includes("denied")
      ) {
        setError("Transaction cancelled by user.");
        toast.error("Transaction cancelled", {
          description: "Wallet signature request was declined.",
        });
      } else {
        setError(msg);
        toast.error("Execution failed", {
          description: "Could not complete payment and skill execution.",
        });
      }

      addExecutionHistory({
        id: crypto.randomUUID(),
        skillId,
        endpoint,
        txHash: null,
        priceMicroSTX,
        status: "error",
        requestBody: body ?? null,
        result: { error: "execution_failed" },
        createdAt: Math.floor(Date.now() / 1000),
      });
    }
  }, [endpoint, body, onResult, skillId, priceMicroSTX]);

  const isProcessing =
    state === "signing" ||
    state === "broadcasting" ||
    state === "confirming" ||
    state === "executing";

  return (
    <div className="space-y-4">
      {/* Not connected */}
      {!address && (
        <Button
          className="w-full gap-2"
          size="lg"
          onClick={connectWallet}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wallet className="h-4 w-4" />
          )}
          Connect Wallet to Execute
        </Button>
      )}

      {/* Connected — insufficient balance */}
      {address && insufficientBalance && (
        <div className="space-y-2">
          <Button className="w-full gap-2" size="lg" disabled>
            <Zap className="h-4 w-4" />
            Insufficient Balance
          </Button>
          {getNetworkName() === "testnet" && (
            <p className="text-xs text-center text-muted-foreground">
              Need testnet STX?{" "}
              <a
                href={getFaucetUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Get from faucet
              </a>
            </p>
          )}
        </div>
      )}

      {/* Connected — can pay */}
      {address && !insufficientBalance && (
        <Button
          className="w-full gap-2"
          size="lg"
          onClick={handleExecute}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          {isProcessing
            ? "Processing…"
            : `Execute — ${formatSTX(priceMicroSTX)}`}
        </Button>
      )}

      {/* Payment progress / result / error */}
      <PaymentStatus
        state={state}
        error={error}
        txHash={txHash}
        explorerUrl={txHash ? getExplorerUrl(txHash) : null}
      />

      {/* Reset after success/error */}
      {(state === "success" || state === "error") && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs"
          onClick={() => {
            setState("idle");
            setError(null);
            setTxHash(null);
          }}
        >
          {state === "success" ? "Execute Again" : "Try Again"}
        </Button>
      )}
    </div>
  );
}
