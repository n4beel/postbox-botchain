"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress, type Address, type Hex } from "viem";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import PageShell from "@/components/layout/PageShell";
import FeedView from "@/components/postbox/FeedView";
import Composer from "@/components/postbox/Composer";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import { isBotChainId } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { loadInbox, type MessageItem } from "@/lib/postbox";
import { app } from "@/lib/app-config";

export default function HomePage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const publicClientRef = useRef(publicClient);
  useEffect(() => {
    publicClientRef.current = publicClient;
  });

  const deployment = isBotChainId(chainId) ? getDeployment(chainId) : undefined;

  const [lookupAddr, setLookupAddr] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && address) {
      setShareUrl(`${window.location.origin}/a/${address}`);
    }
  }, [address]);

  // Load inbox when connected
  const refreshInbox = useCallback(async () => {
    const client = publicClientRef.current;
    if (!address || !client || !deployment?.address) return;
    setLoading(true);
    try {
      const { messages: fetched } = await loadInbox(
        client,
        deployment.address,
        address,
        0,
        50
      );
      setMessages(fetched);
    } catch (err) {
      console.error("Failed to load inbox:", err);
    } finally {
      setLoading(false);
    }
  }, [address, deployment?.address]);

  useEffect(() => {
    if (isConnected && address && deployment?.address) {
      refreshInbox();
    } else {
      setMessages([]);
    }
  }, [isConnected, address, deployment?.address, refreshInbox]);

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = lookupAddr.trim();
    if (!isAddress(clean)) {
      setLookupError("Please enter a valid 0x Ethereum address.");
      return;
    }
    setLookupError("");
    router.push(`/a/${clean}`);
  };

  const handleOptimisticSend = (msg: MessageItem) => {
    setMessages((prev) => [msg, ...prev]);
  };

  const handleDelivered = () => {
    refreshInbox();
  };

  const handleFailed = () => {
    // Remove optimistic message if failed
    setMessages((prev) => prev.filter((m) => !m.optimistic));
  };

  return (
    <PageShell>
      {isConnected && address ? (
        <div className="flex flex-col flex-1 justify-between">
          <div className="flex flex-col gap-2 mb-4">
            <FeedView
              messages={messages}
              loading={loading}
              emptyTitle="Nothing here yet."
              shareUrl={shareUrl}
              feedOwner={address}
            />
          </div>

          <Composer
            onOptimisticSend={handleOptimisticSend}
            onDelivered={handleDelivered}
            onFailed={handleFailed}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6 py-6 max-w-md mx-auto w-full">
          {/* Welcome Card */}
          <Panel variant="cream" className="text-center p-6 sm:p-8">
            <span className="text-4xl block mb-3" role="img" aria-label="letterbox">
              📬
            </span>
            <h1 className="font-serif text-2xl font-bold tracking-tight text-[#2B0F0D] mb-2">
              {app.name}
            </h1>
            <p className="text-sm text-[#7A5A52] leading-relaxed mb-4">
              {app.tagline} Set a fee to message you. Read messages on-chain. Zero spam.
            </p>

            <div className="border-t border-[#E8DCC8] pt-4 text-xs text-[#7A5A52] text-left flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <span className="text-[#FFD36B] font-bold">✓</span>
                <span>All messages are publicly readable without a wallet.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#FFD36B] font-bold">✓</span>
                <span>Senders pay your chosen fee to write to your inbox.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#FFD36B] font-bold">✓</span>
                <span>Collect all accumulated fees whenever you want.</span>
              </div>
            </div>
          </Panel>

          {/* Address Lookup */}
          <div className="flex flex-col gap-2">
            <form onSubmit={handleLookup} className="flex flex-col gap-2">
              <label
                htmlFor="lookup-address"
                className="text-xs font-medium text-[#FFF6E8]"
              >
                Open an address
              </label>
              <div className="flex gap-2">
                <input
                  id="lookup-address"
                  type="text"
                  value={lookupAddr}
                  onChange={(e) => {
                    setLookupAddr(e.target.value);
                    if (lookupError) setLookupError("");
                  }}
                  placeholder="0x… (view any inbox)"
                  className="flex-1 px-3 py-2 text-xs bg-[#7C140F]/80 text-[#FFF6E8] placeholder-[#E9C7BC]/50 rounded-xl border border-[#6B100B] outline-none focus:border-[#FFD36B]"
                />
                <Button variant="primary" size="md" type="submit">
                  Open
                </Button>
              </div>
              {lookupError && (
                <p className="text-xs text-[#FFD36B] mt-0.5">{lookupError}</p>
              )}
            </form>
            <p className="text-[11px] text-[#E9C7BC]/70 text-center">
              Connect your wallet above to see your personal inbox and collect fees.
            </p>
          </div>
        </div>
      )}
    </PageShell>
  );
}
