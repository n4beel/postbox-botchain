import { forwardRef, type HTMLAttributes } from "react";

export type PanelVariant = "cream" | "gold" | "red" | "plain";
export type PanelTail = "received" | "sent" | "none";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: PanelVariant;
  tail?: PanelTail;
  noPadding?: boolean;
}

const variantStyles: Record<PanelVariant, string> = {
  cream: "bg-[#F8EEDD] text-[#2B0F0D] border border-[#E8DCC8] shadow-sm",
  gold: "bg-[#FFD36B] text-[#2B0F0D] border border-[#F3C450] shadow-sm",
  red: "bg-[#8A1611] text-[#FFF6E8] border border-[#7C140F]",
  plain: "bg-transparent text-inherit",
};

const tailStyles: Record<PanelTail, string> = {
  received: "card-received",
  sent: "card-sent",
  none: "rounded-[18px]",
};

const Panel = forwardRef<HTMLDivElement, PanelProps>(
  (
    {
      variant = "cream",
      tail = "none",
      noPadding = false,
      children,
      className = "",
      style,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={[
          variantStyles[variant],
          tailStyles[tail],
          noPadding ? "" : "p-4 sm:p-5",
          "relative transition-all duration-150",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={style}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Panel.displayName = "Panel";

export default Panel;
