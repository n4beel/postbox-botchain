"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import PageShell from "@/components/layout/PageShell";
import BotChainGate from "@/components/botchain/BotChainGate";
import MessageCard from "@/components/postbox/MessageCard";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import { isBotChainId } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { loadSent, type MessageItem } from "@/lib/postbox";

export default function SentPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const publicClientRef = useRef(publicClient);
  useEffect(() => {
    publicClientRef.current = publicClient;
  });

  const deployment = isBotChainId(chainId) ? getDeployment(chainId) : undefined;

  const [sentMessages, setSentMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshSent = useCallback(async () => {
    const client = publicClientRef.current;
    if (!address || !client || !deployment?.address) return;
    setLoading(true);
    try {
      const deployBlock = deployment.deployBlock
        ? BigInt(deployment.deployBlock)
        : 1n;
      const msgs = await loadSent(
        client,
        deployment.address,
        address,
        deployBlock
      );
      setSentMessages(msgs);
    } catch (err) {
      console.error("Failed to load sent messages:", err);
    } finally {
      setLoading(false);
    }
  }, [address, deployment?.address, deployment?.deployBlock]);

  useEffect(() => {
    if (isConnected && address && deployment?.address) {
      refreshSent();
    } else {
      setSentMessages([]);
    }
  }, [isConnected, address, deployment?.address, refreshSent]);

  return (
    <PageShell>
      <BotChainGate noWalletNote="Connect your wallet to review the messages you've posted on-chain.">
        <div className="flex flex-col flex-1 py-2">
          {/* Header Disclosure */}
          <div className="flex items-center justify-between mb-4 px-1">
            <span className="font-serif text-sm font-semibold text-[#FFF6E8]">
              Sent Messages
            </span>
            <span className="text-[11px] text-[#E9C7BC]/80">
              Scanned from deploy block {deployment?.deployBlock ?? 1}
            </span>
          </div>

          {loading ? (
            <div className="flex flex-col gap-3 w-full py-4">
              <div className="w-[70%] h-20 skeleton-cream rounded-2xl rounded-tr-sm self-end" />
              <div className="w-[60%] h-16 skeleton-cream rounded-2xl rounded-tr-sm self-end" />
              <div className="w-[75%] h-24 skeleton-cream rounded-2xl rounded-tr-sm self-end" />
            </div>
          ) : sentMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <span className="text-3xl" role="img" aria-label="envelope">
                ✉️
              </span>
              <h3 className="font-serif text-lg font-medium text-[#FFF6E8]">
                No sent messages yet.
              </h3>
              <p className="text-xs text-[#E9C7BC] max-w-sm">
                When you write to an address on Postbox, your outbound messages will show up here.
              </p>
              <Link href="/" className="mt-2">
                <Button variant="primary" size="sm">
                  Go to Inbox
                </Button>
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {sentMessages.map((msg, i) => (
                <MessageCard
                  key={`sent-${msg.to}-${msg.index}-${msg.blockNumber}-${i}`}
                  message={msg}
                  isSent={true}
                />
              ))}
            </div>
          )}
        </div>
      </BotChainGate>
    </PageShell>
  );
}
