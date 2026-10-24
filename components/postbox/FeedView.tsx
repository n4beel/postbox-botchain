"use client";

import { useEffect, useRef, useState } from "react";
import { isAddress, type Address } from "viem";
import { useAccount } from "wagmi";
import MessageCard from "./MessageCard";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import { useToast } from "@/components/ui/Toast";
import { groupByDay, type MessageItem } from "@/lib/postbox";

interface FeedViewProps {
  messages: MessageItem[];
  loading?: boolean;
  emptyTitle?: string;
  shareUrl?: string;
  feedOwner?: Address;
}

export default function FeedView({
  messages,
  loading = false,
  emptyTitle = "Nothing here yet.",
  shareUrl,
  feedOwner,
}: FeedViewProps) {
  const { address } = useAccount();
  const { toast } = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Group messages chronologically (oldest at top, newest at bottom)
  // `messages` array from loadInbox is newest-first, so reverse it for display
  const chronological = [...messages].reverse();
  const dayGroups = groupByDay(chronological);

  // Auto-scroll to bottom on mount and when messages change
  useEffect(() => {
    if (!loading && chronological.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chronological.length, loading]);

  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast("success", "Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3 w-full py-4">
        <div className="w-16 h-3 mx-auto skeleton-cream mb-2" />
        <div className="w-[75%] h-20 skeleton-cream rounded-2xl rounded-tl-sm" />
        <div className="w-[65%] h-16 skeleton-cream rounded-2xl rounded-tl-sm" />
        <div className="w-[70%] h-24 skeleton-cream rounded-2xl rounded-tr-sm self-end" />
      </div>
    );
  }

  if (chronological.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
        <span className="text-3xl" role="img" aria-label="mailbox">
          📭
        </span>
        <h3 className="font-serif text-lg font-medium text-[#FFF6E8]">
          {emptyTitle}
        </h3>
        {shareUrl && (
          <div className="flex flex-col items-center gap-2 max-w-sm mt-1">
            <p className="text-xs text-[#E9C7BC]">
              Share your personal link to receive paid messages directly on-chain:
            </p>
            <div className="flex items-center gap-2 p-1.5 px-3 rounded-full bg-[#7C140F]/80 border border-[#6B100B] text-xs font-mono text-[#FFF6E8] max-w-full truncate">
              <span className="truncate">{shareUrl}</span>
              <Button
                variant="pill"
                size="sm"
                onClick={handleCopyLink}
                className="flex-shrink-0 text-[10px] py-1 px-2.5 h-auto min-h-0 bg-[#FFD36B] text-[#2B0F0D] hover:bg-[#F7C650]"
              >
                {copied ? "Copied ✓" : "Copy Link"}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full py-2">
      {Array.from(dayGroups.entries()).map(([dayLabel, msgs]) => (
        <div key={dayLabel} className="flex flex-col gap-3">
          {/* Day Separator in small caps */}
          <div className="flex items-center justify-center my-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-widest uppercase text-[#E9C7BC] bg-[#7C140F]/60">
              {dayLabel}
            </span>
          </div>

          {/* Messages for this day */}
          {msgs.map((msg, i) => {
            const isSentByMe = Boolean(
              address && msg.from.toLowerCase() === address.toLowerCase()
            );

            return (
              <MessageCard
                key={`${msg.from}-${msg.index}-${msg.blockNumber}-${i}`}
                message={msg}
                isSent={isSentByMe}
              />
            );
          })}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
