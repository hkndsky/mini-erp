import { useState, type FormEvent } from 'react';
import { Modal } from './Modal';
import { errorMessage } from '../api/client';
import { endpoints } from '../api';
import type { ConflictRow } from '../api/types';

export function ResolveConflictModal({
  conflict,
  onClose,
  onDone,
}: {
  conflict: ConflictRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [resolution, setResolution] = useState<'APPLY_INCOMING' | 'KEEP_CURRENT'>('APPLY_INCOMING');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await endpoints.conflicts.resolve(conflict.id, {
        resolution,
        note: note.trim() ? note : undefined,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Resolve conflict — ${conflict.entityKey}`} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <dl className="conflict-detail">
          <div>
            <dt>Entity</dt>
            <dd>
              {conflict.entityType} · {conflict.entityKey}
            </dd>
          </div>
          <div>
            <dt>Field</dt>
            <dd>{conflict.field}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{conflict.source}</dd>
          </div>
          <div>
            <dt>Current value</dt>
            <dd>{conflict.currentValue ?? '—'}</dd>
          </div>
          <div>
            <dt>Incoming value</dt>
            <dd>{conflict.incomingValue ?? '—'}</dd>
          </div>
        </dl>
        <fieldset>
          <legend>Resolution</legend>
          <label>
            <input
              type="radio"
              name="resolution"
              value="APPLY_INCOMING"
              checked={resolution === 'APPLY_INCOMING'}
              onChange={() => setResolution('APPLY_INCOMING')}
            />
            Apply incoming value ({conflict.incomingValue ?? '—'})
          </label>
          <label>
            <input
              type="radio"
              name="resolution"
              value="KEEP_CURRENT"
              checked={resolution === 'KEEP_CURRENT'}
              onChange={() => setResolution('KEEP_CURRENT')}
            />
            Keep current value ({conflict.currentValue ?? '—'})
          </label>
        </fieldset>
        <label>
          Note (optional)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Why this decision?"
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="resolve-submit">
            {busy ? 'Saving…' : 'Save resolution'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
