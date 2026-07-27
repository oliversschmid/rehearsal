"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function SlideOver({
  title,
  onClose,
  children,
  widthClass,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  widthClass?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div className="slideover" role="dialog" aria-modal="true">
      <div className="slideover-backdrop" onClick={onClose} />
      <div className={`slideover-panel ${widthClass ?? ""}`}>
        <div className="sticky top-0 bg-white z-10 border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="btn btn-ghost !p-2" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
