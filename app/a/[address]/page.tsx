"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatEther, isAddress, type Address, type Hex } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContract } from "wagmi";
import PageShell from "@/components/layout/PageShell";
import FeedView from "@/components/postbox/FeedView";
import Composer from "@/components/postbox/Composer";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import ConnectButton from "@/components/ui/ConnectButton";
import { postboxAbi } from "@/lib/botchain/abi";
import { isBotChainId } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { DEFAULT_PRICE } from "@/lib/limits";
import { loadInbox, shortAddr, type MessageItem } from "@/lib/postbox";

export default function PublicAddressPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const resolvedParams = use(params);
  const rawAddress = resolvedParams.address;

  const chainId = useChainId();
  const publicClient = usePublicClient();
  const publicClientRef = useRef(publicClient);
  useEffect(() => {
    publicClientRef.current = publicClient;
  });

  const deployment = isBotChainId(chainId) ? getDeployment(chainId) : undefined;
  const { isConnected, address: myAddress } = useAccount();

  const targetAddress = useMemo<Address | null>(() => {
    return isAddress(rawAddress) ? (rawAddress as Address) : null;
  }, [rawAddress]);

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Read recipient's required fee
  const { data: priceData } = useReadContract({
    address: deployment?.address,
    abi: postboxAbi,
    functionName: "priceOf",
    args: targetAddress ? [targetAddress] : undefined,
    query: {
      enabled: Boolean(deployment?.address && targetAddress),
    },
  });

  const price = (priceData as bigint) ?? DEFAULT_PRICE;

  const refreshInbox = useCallback(async () => {
    const client = publicClientRef.current;
    if (!targetAddress || !client || !deployment?.address) return;
    setLoading(true);
    try {
      const { messages: fetched } = await loadInbox(
        client,
        deployment.address,
        targetAddress,
        0,
        50
      );
      setMessages(fetched);
    } catch (err) {
      console.error("Failed to load address inbox:", err);
    } finally {
      setLoading(false);
    }
  }, [targetAddress, deployment?.address]);

  useEffect(() => {
    if (targetAddress && deployment?.address) {
      refreshInbox();
    } else {
      setLoading(false);
    }
  }, [targetAddress, deployment?.address, refreshInbox]);

  const handleOptimisticSend = (msg: MessageItem) => {
    setMessages((prev) => [msg, ...prev]);
  };

  const handleDelivered = () => {
    refreshInbox();
  };

  const handleFailed = () => {
    setMessages((prev) => prev.filter((m) => !m.optimistic));
  };

  if (!targetAddress) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <Panel variant="cream" className="max-w-md p-6">
            <h2 className="font-serif text-lg font-bold text-[#2B0F0D] mb-1">
              Invalid Address
            </h2>
            <p className="text-xs text-[#7A5A52] mb-4">
              The address in the URL is not a valid 0x Ethereum address.
            </p>
            <Link href="/" className="inline-block">
              <Button variant="primary" size="sm">
                Return to Postbox
              </Button>
            </Link>
          </Panel>
        </div>
      </PageShell>
    );
  }

  const isMyOwnInbox = Boolean(
    myAddress && targetAddress.toLowerCase() === myAddress.toLowerCase()
  );

  return (
    <PageShell>
      <div className="flex flex-col flex-1 justify-between">
        {/* Recipient Profile Banner */}
        <div className="flex items-center justify-between gap-3 p-3 mb-2 rounded-2xl bg-[#8A1611]/80 border border-[#7C140F]">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-serif font-semibold text-sm text-[#FFF6E8]">
                {isMyOwnInbox ? "Your Public Postbox" : shortAddr(targetAddress)}
              </span>
              <span className="font-mono text-[10px] text-[#E9C7BC]/70 hidden sm:inline">
                ({targetAddress})
              </span>
            </div>
            <span className="text-[11px] text-[#E9C7BC]">
              Costs {formatEther(price)} BOT to write · goes directly to them
            </span>
          </div>

          <Link
            href="/"
            className="text-xs text-[#FFF6E8] hover:text-[#FFD36B] underline flex-shrink-0"
          >
            All Inboxes
          </Link>
        </div>

        {/* Message Feed */}
        <div className="flex flex-col gap-2 mb-4">
          <FeedView
            messages={messages}
            loading={loading}
            emptyTitle={`No messages sent to ${shortAddr(targetAddress)} yet.`}
            shareUrl={
              typeof window !== "undefined" ? window.location.href : undefined
            }
            feedOwner={targetAddress}
          />
        </div>

        {/* Pinned Composer addressed to this person */}
        {isConnected ? (
          <Composer
            fixedRecipient={targetAddress}
            onOptimisticSend={handleOptimisticSend}
            onDelivered={handleDelivered}
            onFailed={handleFailed}
          />
        ) : (
          <div className="sticky bottom-0 z-30 w-full pt-3 pb-4 bg-[#A8201A]/95 backdrop-blur-md border-t border-[#7C140F] text-center">
            <Panel variant="cream" className="p-4 flex flex-col items-center gap-2">
              <p className="text-xs text-[#2B0F0D] font-medium">
                Want to write to {shortAddr(targetAddress)}? Connect your wallet to post.
              </p>
              <div className="w-[180px]">
                <ConnectButton />
              </div>
            </Panel>
          </div>
        )}
      </div>
    </PageShell>
  );
}
