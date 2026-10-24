/**
 * Postbox contract limits and constants.
 * Kept strictly in sync with Postbox.sol.
 */
export const MAX_MESSAGE_BYTES = 280;
export const MAX_PAGE = 50;
export const DEFAULT_PRICE = 1_000_000_000_000_000n; // 0.001 ether in wei

export const PRICE_PRESETS = [
  { label: "Free", value: 0n },
  { label: "0.001 BOT", value: 1_000_000_000_000_000n },
  { label: "0.01 BOT", value: 10_000_000_000_000_000n },
] as const;
