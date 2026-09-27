import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

export function Card({ className, ...rest }: ComponentProps<"section">) {
  return <section className={cx("rounded-xl border border-line bg-surface shadow-[0_1px_0_rgb(20_33_61/0.04)]", className)} {...rest} />;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">{children}</p>;
}

type Tone = "neutral" | "accent" | "warn" | "risk";
const TONES: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-muted border-line",
  accent: "bg-accent-soft text-accent-strong border-accent/20",
  warn: "bg-warn-soft text-warn border-warn/20",
  risk: "bg-risk-soft text-risk border-risk/20",
};

export function Badge({ tone = "neutral", wrap = false, children, className }: { tone?: Tone; wrap?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", wrap ? "whitespace-normal" : "whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

const BUTTON = {
  primary: "bg-accent text-white hover:bg-accent-strong border-transparent",
  secondary: "bg-surface text-ink border-line-strong hover:bg-sunken",
  ghost: "bg-transparent text-ink-muted border-transparent hover:bg-sunken hover:text-ink",
  danger: "bg-risk text-white border-transparent hover:opacity-90",
};

export function buttonClass(variant: keyof typeof BUTTON = "primary", size: "sm" | "md" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "px-2.5 py-1 text-sm" : "px-3.5 py-2 text-sm",
    BUTTON[variant],
  );
}

export function Button({ variant = "primary", size = "md", className, ...rest }: ComponentProps<"button"> & { variant?: keyof typeof BUTTON; size?: "sm" | "md" }) {
  return <button type="button" className={cx(buttonClass(variant, size), className)} {...rest} />;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...rest }: ComponentProps<typeof Link> & { variant?: keyof typeof BUTTON; size?: "sm" | "md" }) {
  return <Link className={cx(buttonClass(variant, size), className)} {...rest} />;
}

export function Chevron({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={cx("chev size-3.5 shrink-0 transition-transform", className)} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
