"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "pill" | "round" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[#FFD36B] hover:bg-[#F7C650] text-[#2B0F0D] font-semibold border border-[#E5B842] shadow-sm active:translate-y-px",
  pill:
    "rounded-full bg-[#8F1712] hover:bg-[#7D110D] text-[#FFF6E8] border border-[#7C140F] font-medium active:scale-95",
  round:
    "rounded-full bg-[#FFD36B] hover:bg-[#F7C650] text-[#2B0F0D] font-bold p-0 flex items-center justify-center border border-[#E5B842] shadow active:scale-95",
  ghost:
    "bg-transparent hover:bg-[#8F1712]/50 text-[#FFF6E8] border border-[#7C140F] font-medium",
  danger:
    "bg-[#5E0F0C] hover:bg-[#4E0A08] text-[#FFBABA] border border-[#7C140F] font-medium",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs rounded-full min-h-[34px]",
  md: "px-4 py-2 text-sm rounded-xl min-h-[42px]",
  lg: "px-6 py-3 text-base rounded-2xl min-h-[48px]",
};

const roundSizes: Record<ButtonSize, string> = {
  sm: "w-9 h-9 min-h-[36px]",
  md: "w-11 h-11 min-h-[44px]",
  lg: "w-13 h-13 min-h-[52px]",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      children,
      className = "",
      ...props
    },
    ref
  ) => {
    const isRound = variant === "round";
    const sizeStyle = isRound ? roundSizes[size] : sizeClasses[size];

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          "inline-flex items-center justify-center gap-2 cursor-pointer select-none transition-all duration-150",
          "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none",
          variantClasses[variant],
          sizeStyle,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
