"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { connect as stacksConnect } from "@stacks/connect";
import { getNetworkName, getHiroApiUrl } from "@/lib/stacks/network";
import { truncateAddress } from "@/lib/utils/format";

// ── Types ──────────────────────────────────────────────────

export interface WalletState {
  /** Whether we're currently mid-connect */
  isConnecting: boolean;
  /** The connected STX address (if any) */
  address: string | null;
  /** Truncated display address like SP2X…f3Kd */
  displayAddress: string | null;
  /** STX balance in microSTX (null until fetched) */
  balanceMicroSTX: number | null;
  /** Current network */
  network: "mainnet" | "testnet";
}

export interface WalletActions {
  /** Prompt the user to connect a Stacks wallet */
  connectWallet: () => Promise<void>;
  /** Disconnect and clear state */
  disconnectWallet: () => void;
  /** Refetch balance */
  refreshBalance: () => Promise<void>;
}

type WalletContextValue = WalletState & WalletActions;

// ── Context ────────────────────────────────────────────────

const WalletContext = createContext<WalletContextValue | null>(null);

const STORAGE_KEY = "x402-wallet-address";

// ── Provider ───────────────────────────────────────────────

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [balanceMicroSTX, setBalanceMicroSTX] = useState<number | null>(null);
  const network = getNetworkName();

  // Restore from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setAddress(stored);
  }, []);

  // Fetch balance whenever address changes
  const refreshBalance = useCallback(async () => {
    if (!address) {
      setBalanceMicroSTX(null);
      return;
    }
    try {
      const res = await fetch(
        `${getHiroApiUrl()}/extended/v1/address/${address}/stx`
      );
      if (!res.ok) {
        throw new Error(`Balance fetch returned ${res.status}`);
      }
      const data = await res.json();
      setBalanceMicroSTX(Number(data.balance));
    } catch (err) {
      console.warn("[WalletProvider] Balance fetch failed for", address, err);
      setBalanceMicroSTX(null);
    }
  }, [address]);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  // Refresh balance periodically while connected (every 30 s)
  useEffect(() => {
    if (!address) return;
    const id = setInterval(refreshBalance, 30_000);
    return () => clearInterval(id);
  }, [address, refreshBalance]);

  // ── Connect ──────────────────────────────────────────────

  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    try {
      const response = await stacksConnect({
        forceWalletSelect: true,
      });

      // Find the Stacks address — check symbol (case-insensitive) then
      // fall back to address prefix (SP for mainnet, ST for testnet).
      const stxEntry =
        response.addresses.find(
          (a) => a.symbol?.toUpperCase() === "STX"
        ) ??
        response.addresses.find(
          (a) => a.address.startsWith("SP") || a.address.startsWith("ST")
        );
      const addr = stxEntry?.address ?? response.addresses[0]?.address;

      if (addr) {
        setAddress(addr);
        localStorage.setItem(STORAGE_KEY, addr);
      }
    } catch (err) {
      // User cancelled or wallet unavailable — reset gracefully
      console.warn("Wallet connection cancelled or failed:", err);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // ── Disconnect ───────────────────────────────────────────

  const disconnectWallet = useCallback(() => {
    setAddress(null);
    setBalanceMicroSTX(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // ── Memoized context ────────────────────────────────────

  const displayAddress = useMemo(
    () => (address ? truncateAddress(address) : null),
    [address]
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      isConnecting,
      address,
      displayAddress,
      balanceMicroSTX,
      network,
      connectWallet,
      disconnectWallet,
      refreshBalance,
    }),
    [
      isConnecting,
      address,
      displayAddress,
      balanceMicroSTX,
      network,
      connectWallet,
      disconnectWallet,
      refreshBalance,
    ]
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used within a <WalletProvider>");
  }
  return ctx;
}
