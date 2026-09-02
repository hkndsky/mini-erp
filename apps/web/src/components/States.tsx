import type { ReactNode } from 'react';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <p>{message}</p>
      {children}
    </div>
  );
}
