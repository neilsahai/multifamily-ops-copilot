"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

type Pos = { left: number; width: number; top?: number; bottom?: number };

const MAX_WIDTH = 256;
const GUTTER = 8;

/**
 * Small "i" button with help text on hover, focus or tap. The text stays in
 * the DOM (so `aria-describedby` works) but is `hidden` until shown, and it is
 * positioned `fixed` and clamped to the viewport, so it never creates
 * horizontal overflow.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);

  const show = useCallback(() => {
    const el = btn.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const width = Math.min(MAX_WIDTH, vw - GUTTER * 2);
    const left = Math.min(Math.max(GUTTER, r.left + r.width / 2 - width / 2), vw - width - GUTTER);
    setPos(r.top > 200 ? { left, width, bottom: window.innerHeight - r.top + 8 } : { left, width, top: r.bottom + 8 });
  }, []);
  const hide = useCallback(() => setPos(null), []);

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [pos, hide]);

  return (
    <span className="inline-flex align-middle" onMouseEnter={show} onMouseLeave={hide}>
      <button
        ref={btn}
        type="button"
        aria-label={`About ${label}`}
        aria-describedby={id}
        aria-expanded={pos !== null}
        onFocus={show}
        onBlur={hide}
        onClick={show}
        className="inline-flex size-4 items-center justify-center rounded-full border border-line-strong text-[10px] font-semibold text-ink-faint hover:text-ink"
      >
        i
      </button>
      <span
        id={id}
        role="tooltip"
        hidden={pos === null}
        style={pos ? { position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom } : undefined}
        className="z-50 rounded-lg bg-ink px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-white shadow-lg"
      >
        {children}
      </span>
    </span>
  );
}
