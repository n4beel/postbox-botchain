import { describe, expect, it } from "vitest";
import {
  byteLength,
  formatDayLabel,
  groupByDay,
  relativeTime,
  shortAddr,
  validateMessage,
  type MessageItem,
} from "../postbox";

describe("postbox utilities", () => {
  describe("byteLength", () => {
    it("returns 0 for empty string", () => {
      expect(byteLength("")).toBe(0);
    });

    it("measures ASCII characters as 1 byte each", () => {
      expect(byteLength("hello")).toBe(5);
    });

    it("measures multi-byte UTF-8 characters accurately", () => {
      // '€' is 3 bytes in UTF-8
      expect(byteLength("€")).toBe(3);
      // '👋' is 4 bytes in UTF-8
      expect(byteLength("👋")).toBe(4);
      // 'é' is 2 bytes in UTF-8
      expect(byteLength("é")).toBe(2);
    });
  });

  describe("validateMessage", () => {
    it("rejects empty message", () => {
      const res = validateMessage("");
      expect(res.valid).toBe(false);
      expect(res.length).toBe(0);
      expect(res.error).toBe("Message cannot be empty.");
    });

    it("accepts 1-byte message", () => {
      const res = validateMessage("a");
      expect(res.valid).toBe(true);
      expect(res.length).toBe(1);
      expect(res.error).toBeUndefined();
    });

    it("accepts exactly 280-byte message", () => {
      const msg = "a".repeat(280);
      const res = validateMessage(msg);
      expect(res.valid).toBe(true);
      expect(res.length).toBe(280);
      expect(res.error).toBeUndefined();
    });

    it("rejects 281-byte message", () => {
      const msg = "a".repeat(281);
      const res = validateMessage(msg);
      expect(res.valid).toBe(false);
      expect(res.length).toBe(281);
      expect(res.error).toContain("maximum allowed is 280 bytes");
    });

    it("handles multi-byte boundaries properly", () => {
      // 70 emojis at 4 bytes each = 280 bytes
      const emojis70 = "⚡".repeat(70); // '⚡' is 3 bytes -> 210 bytes
      expect(validateMessage(emojis70).valid).toBe(true);

      const rocket70 = "🚀".repeat(70); // 70 * 4 = 280 bytes
      expect(byteLength(rocket70)).toBe(280);
      expect(validateMessage(rocket70).valid).toBe(true);

      const rocket71 = "🚀".repeat(71); // 71 * 4 = 284 bytes
      expect(validateMessage(rocket71).valid).toBe(false);
    });
  });

  describe("shortAddr", () => {
    it("shortens address", () => {
      expect(shortAddr("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…5678");
    });

    it("returns short string as is", () => {
      expect(shortAddr("0x123")).toBe("0x123");
    });
  });

  describe("relativeTime", () => {
    const nowSecs = 1_700_000_000;

    it("formats just now", () => {
      expect(relativeTime(nowSecs - 2, nowSecs)).toBe("just now");
    });

    it("formats seconds ago", () => {
      expect(relativeTime(nowSecs - 30, nowSecs)).toBe("30s ago");
    });

    it("formats minutes ago", () => {
      expect(relativeTime(nowSecs - 120, nowSecs)).toBe("2m ago");
    });

    it("formats hours ago", () => {
      expect(relativeTime(nowSecs - 7200, nowSecs)).toBe("2h ago");
    });

    it("formats days ago", () => {
      expect(relativeTime(nowSecs - 172800, nowSecs)).toBe("2d ago");
    });

    it("formats calendar date for older timestamps", () => {
      const older = nowSecs - 86400 * 30; // 30 days ago
      const str = relativeTime(older, nowSecs);
      expect(str).toMatch(/[A-Z][a-z]{2}\s\d+/);
    });
  });

  describe("formatDayLabel & groupByDay", () => {
    it("labels today and yesterday correctly", () => {
      const nowSecs = Math.floor(Date.now() / 1000);
      expect(formatDayLabel(nowSecs)).toBe("Today");
      expect(formatDayLabel(nowSecs - 86400)).toBe("Yesterday");
    });

    it("groups messages by day label", () => {
      const nowSecs = Math.floor(Date.now() / 1000);
      const messages: MessageItem[] = [
        {
          to: "0x1111111111111111111111111111111111111111",
          from: "0x2222222222222222222222222222222222222222",
          index: 1,
          paid: 1000000000000000n,
          message: "First today",
          sentAt: nowSecs,
          blockNumber: 10,
        },
        {
          to: "0x1111111111111111111111111111111111111111",
          from: "0x2222222222222222222222222222222222222222",
          index: 2,
          paid: 1000000000000000n,
          message: "Second today",
          sentAt: nowSecs - 100,
          blockNumber: 11,
        },
        {
          to: "0x1111111111111111111111111111111111111111",
          from: "0x3333333333333333333333333333333333333333",
          index: 0,
          paid: 1000000000000000n,
          message: "Yesterday note",
          sentAt: nowSecs - 86400,
          blockNumber: 5,
        },
      ];

      const groups = groupByDay(messages);
      expect(groups.has("Today")).toBe(true);
      expect(groups.has("Yesterday")).toBe(true);
      expect(groups.get("Today")?.length).toBe(2);
      expect(groups.get("Yesterday")?.length).toBe(1);
    });
  });
});
