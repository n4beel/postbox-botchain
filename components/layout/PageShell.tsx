"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { formatEther } from "viem";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { app } from "@/lib/app-config";
import { postboxAbi } from "@/lib/botchain/abi";
import { isBotChainId } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { NAV_ITEMS, type SegmentTab } from "@/lib/nav";

interface PageShellProps {
  children: React.ReactNode;
}

export default function PageShell({ children }: PageShellProps) {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const deployment = isBotChainId(chainId) ? getDeployment(chainId) : undefined;

  const [hasUnread, setHasUnread] = useState(false);

  // Read pending fees for connected user
  const { data: pendingBalance } = useReadContract({
    address: deployment?.address,
    abi: postboxAbi,
    functionName: "pending",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(deployment?.address && address && isConnected),
    },
  });

  // Read total messages in user's inbox to compute unread dot
  const { data: totalInboxCount } = useReadContract({
    address: deployment?.address,
    abi: postboxAbi,
    functionName: "inboxCount",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(deployment?.address && address && isConnected),
    },
  });

  // Calculate unread status using localStorage
  useEffect(() => {
    if (!address || totalInboxCount === undefined) {
      setHasUnread(false);
      return;
    }

    try {
      const key = `postbox_last_read_${address.toLowerCase()}`;
      const saved = localStorage.getItem(key);
      const lastRead = saved ? parseInt(saved, 10) : 0;
      const count = Number(totalInboxCount);

      if (pathname === "/") {
        // User is viewing inbox; mark as read
        localStorage.setItem(key, String(count));
        setHasUnread(false);
      } else {
        setHasUnread(count > lastRead);
      }
    } catch {
      // Storage unavailable or quota exceeded
      setHasUnread(false);
    }
  }, [address, totalInboxCount, pathname]);

  return (
    <div className="flex flex-col min-h-[100dvh] w-full bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Top Bar with Postbox Brand & Segmented Navigation */}
      <header className="sticky top-0 z-40 w-full bg-[#911611]/95 backdrop-blur-md border-b border-[#7C140F]">
        <div className="mx-auto w-full max-w-[560px] px-3 sm:px-4 py-2.5 flex flex-col gap-2">
          {/* Top row: Brand + Network + Connect Wallet */}
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/"
              className="flex items-center gap-2 group select-none no-underline"
            >
              <span className="text-xl" role="img" aria-label="letterbox">
                📬
              </span>
              <span className="font-serif text-lg font-semibold tracking-tight text-[#FFF6E8]">
                {app.name}
              </span>
            </Link>

            <div className="flex items-center gap-2">
              {pendingBalance && (pendingBalance as bigint) > 0n && (
                <Link
                  href="/settings"
                  className="px-2.5 py-1 text-xs font-semibold rounded-full bg-[#FFD36B] text-[#2B0F0D] hover:bg-[#F7C650] transition-colors shadow-sm flex items-center gap-1.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2B0F0D]" />
                  Collect {formatEther(pendingBalance as bigint)} BOT
                </Link>
              )}
              <NetworkBadge />
              <div className="w-[125px] sm:w-[150px]">
                <ConnectButton />
              </div>
            </div>
          </div>

          {/* Bottom row: Segmented Control (Inbox · Sent · Settings) */}
          <nav
            aria-label="Feed Navigation"
            className="flex items-center justify-center p-0.5 rounded-full bg-[#7C140F]/80 border border-[#6B100B]"
          >
            {NAV_ITEMS.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "relative flex-1 py-1.5 text-center text-xs font-medium rounded-full transition-all duration-150 select-none",
                    active
                      ? "bg-[#F8EEDD] text-[#2B0F0D] font-semibold shadow-sm"
                      : "text-[#E9C7BC] hover:text-[#FFF6E8] hover:bg-[#8F1812]/50",
                  ].join(" ")}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="inline-flex items-center gap-1.5 justify-center">
                    {item.label}
                    {item.tab === "inbox" && hasUnread && (
                      <span
                        className="w-2 h-2 rounded-full bg-[#FFD36B] animate-dot"
                        aria-label="Unread messages"
                      />
                    )}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Feed Content (narrow centred column, max 560px) */}
      <main className="flex-1 mx-auto w-full max-w-[560px] px-3 sm:px-4 py-4 flex flex-col justify-between">
        <div className="flex-1 w-full flex flex-col">{children}</div>

        {/* Feed Footer Attribution (the last 'card' in the feed) */}
        <div className="mt-8 mb-4 pt-6 border-t border-[#7C140F]/60 text-center flex flex-col items-center gap-2">
          <p className="text-xs text-[#E9C7BC]/80">{app.tagline}</p>
          <div className="flex items-center justify-center gap-4 text-[11px] text-[#E9C7BC]/70">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FFD36B]" />
              <BuiltOnBotChain className="uppercase tracking-wider font-medium" />
            </span>
            <span>·</span>
            <a
              href="https://botchain.ai"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[#FFF6E8] underline underline-offset-2"
            >
              botchain.ai
            </a>
            <span>·</span>
            <a
              href="https://scan.botchain.ai"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[#FFF6E8] underline underline-offset-2"
            >
              Explorer
            </a>
          </div>
          <p className="text-[10px] text-[#E9C7BC]/50 mt-1">
            Public and permanent. No encryption, no delete. 280 bytes.
          </p>
        </div>
      </main>
    </div>
  );
}
