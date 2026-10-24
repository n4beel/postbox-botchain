"use client";

import Link from "next/link";
import { formatEther, type Address } from "viem";
import Panel from "@/components/ui/Panel";
import { relativeTime, shortAddr, type MessageItem } from "@/lib/postbox";
import { txUrl } from "@/lib/botchain/chain";
import { useChainId } from "wagmi";

interface MessageCardProps {
  message: MessageItem;
  isSent?: boolean;
  txHash?: string;
}

export default function MessageCard({
  message,
  isSent = false,
  txHash,
}: MessageCardProps) {
  const chainId = useChainId();

  if (isSent) {
    return (
      <div className="flex justify-end w-full animate-message">
        <div className="max-w-[85%] sm:max-w-[78%]">
          <Panel
            variant="gold"
            tail="sent"
            className="p-3.5 sm:p-4 text-[#2B0F0D]"
          >
            {/* Header: To address + status or time */}
            <div className="flex items-center justify-between gap-2 mb-1.5 text-xs text-[#2B0F0D]/80">
              <span className="font-serif font-medium">
                To:{" "}
                <Link
                  href={`/a/${message.to}`}
                  className="underline hover:text-[#2B0F0D] font-mono text-[11px]"
                >
                  {shortAddr(message.to)}
                </Link>
              </span>
              <div className="flex items-center gap-1.5">
                {message.optimistic ? (
                  <span className="px-1.5 py-0.5 rounded-full bg-[#E5B842] text-[10px] font-semibold tracking-wide">
                    Posting…
                  </span>
                ) : (
                  <>
                    <span className="text-[11px]">
                      {relativeTime(message.sentAt)}
                    </span>
                    {txHash && (
                      <a
                        href={txUrl(chainId, txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-[#2B0F0D] font-medium underline"
                      >
                        Delivered ✓
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Message Body */}
            <p className="text-sm sm:text-[15px] leading-relaxed break-words whitespace-pre-wrap font-sans text-[#2B0F0D]">
              {message.message}
            </p>
          </Panel>
        </div>
      </div>
    );
  }

  // Received message (Cream card, left-aligned)
  return (
    <div className="flex justify-start w-full animate-message">
      <div className="max-w-[88%] sm:max-w-[80%]">
        <Panel
          variant="cream"
          tail="received"
          className="p-3.5 sm:p-4 text-[#2B0F0D]"
        >
          {/* Header: Sender + Gold chip for paid amount + Relative time */}
          <div className="flex items-center justify-between gap-2 mb-1.5 text-xs">
            <Link
              href={`/a/${message.from}`}
              className="font-serif font-medium text-[#2B0F0D] hover:underline flex items-center gap-1"
            >
              <span>{shortAddr(message.from)}</span>
            </Link>

            <div className="flex items-center gap-1.5">
              {message.paid > 0n && (
                <span className="px-1.5 py-0.5 rounded-md bg-[#FFD36B] text-[#2B0F0D] text-[10px] font-bold tracking-tight border border-[#E5B842]/50 shadow-xs">
                  +{formatEther(message.paid)} BOT
                </span>
              )}
              <span className="text-[11px] text-[#7A5A52]">
                {relativeTime(message.sentAt)}
              </span>
            </div>
          </div>

          {/* Message Body */}
          <p className="text-sm sm:text-[15px] leading-relaxed break-words whitespace-pre-wrap font-sans text-[#2B0F0D]">
            {message.message}
          </p>
        </Panel>
      </div>
    </div>
  );
}
