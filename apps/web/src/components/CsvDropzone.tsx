import { useRef, useState, type DragEvent } from 'react';

/**
 * Drag & drop CSV upload with a file-picker fallback. The dropzone announces
 * itself to screen readers via an aria-live region that mirrors the file name.
 */
export function CsvDropzone({
  onFile,
  disabled = false,
  hint = 'Drop a CSV here, or click to browse.',
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  function handleFile(file: File | undefined) {
    if (!file || disabled) return;
    setFileName(file.name);
    onFile(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer?.files?.[0]);
  }

  return (
    <div>
      <div
        data-testid="csv-dropzone"
        className={`dropzone${dragging ? ' dropzone-active' : ''}${disabled ? ' dropzone-disabled' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="CSV upload area"
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) inputRef.current?.click();
        }}
      >
        {dragging ? (
          <span className="dropzone-hint dropzone-drop">Release to upload</span>
        ) : (
          <span className="dropzone-hint">{hint}</span>
        )}
      </div>
      <input
        ref={inputRef}
        data-testid="csv-file-input"
        type="file"
        accept=".csv,text/csv"
        hidden
        disabled={disabled}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <p className="dropzone-status" aria-live="polite">
        {fileName ? `Selected: ${fileName}` : ''}
      </p>
    </div>
  );
}
