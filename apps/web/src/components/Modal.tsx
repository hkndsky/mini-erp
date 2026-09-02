import { useEffect, useRef, type ReactNode } from 'react';

export function Modal({
  title,
  onClose,
  children,
  initialFocus = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  initialFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.activeElement as HTMLElement | null;
    if (initialFocus && ref.current) ref.current.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose, initialFocus]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="modal">
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="btn btn-icon" aria-label="Close dialog" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
