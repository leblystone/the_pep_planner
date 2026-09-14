import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Theme-aware status chip (Catch-up / Skipped / Rescheduled / One-off).
 * Click to show why the chip is present.
 */
export default function DoseStatusChip({ label, explanation, theme }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const place = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const popW = popoverRef.current?.offsetWidth || 220;
      const popH = popoverRef.current?.offsetHeight || 48;
      let left = rect.left + rect.width / 2 - popW / 2;
      let top = rect.bottom + 8;
      left = Math.max(8, Math.min(left, window.innerWidth - popW - 8));
      if (top + popH > window.innerHeight - 8) {
        top = rect.top - popH - 8;
      }
      setPos({ top, left });
    };

    place();
    const close = (e) => {
      if (
        triggerRef.current?.contains(e.target) ||
        popoverRef.current?.contains(e.target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    window.addEventListener('click', close, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('click', close, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  if (!label) return null;

  const bg = theme?.primaryDark || theme?.primary;
  const color = theme?.textOnPrimary || theme?.cardBackground;
  const tipBg = theme?.cardBackground;
  const tipText = theme?.text;
  const tipBorder = theme?.border;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-semibold uppercase tracking-wide flex-shrink-0 whitespace-nowrap cursor-pointer touch-manipulation"
        style={{
          backgroundColor: bg,
          color,
          border: 'none',
          lineHeight: 1.25,
        }}
        title={explanation || label}
        aria-label={explanation ? `${label}: ${explanation}` : label}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!explanation) return;
          setOpen((v) => !v);
        }}
      >
        {label}
      </button>
      {open && explanation && createPortal(
        <div
          ref={popoverRef}
          role="tooltip"
          className="fixed z-[10060] px-3 py-2 text-xs font-medium rounded-lg shadow-lg max-w-[240px]"
          style={{
            top: pos.top,
            left: pos.left,
            backgroundColor: tipBg,
            color: tipText,
            border: tipBorder ? `1px solid ${tipBorder}` : undefined,
            pointerEvents: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {explanation}
        </div>,
        document.body
      )}
    </>
  );
}
