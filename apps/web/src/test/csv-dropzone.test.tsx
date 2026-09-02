import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CsvDropzone } from '../components/CsvDropzone';

const csv = new File(['sku,name\nSKU-1,Bolt'], 'import.csv', { type: 'text/csv' });

describe('CsvDropzone', () => {
  it('accepts a file picked through the file input', async () => {
    const onFile = vi.fn();
    render(<CsvDropzone onFile={onFile} />);
    const input = screen.getByTestId('csv-file-input');
    await userEvent.upload(input, csv);
    expect(onFile).toHaveBeenCalledWith(csv);
    expect(screen.getByText('Selected: import.csv')).toBeInTheDocument();
  });

  it('accepts a file dropped on the dropzone', () => {
    const onFile = vi.fn();
    render(<CsvDropzone onFile={onFile} />);
    const zone = screen.getByTestId('csv-dropzone');
    fireEvent.drop(zone, { dataTransfer: { files: [csv] } });
    expect(onFile).toHaveBeenCalledWith(csv);
  });

  it('ignores files while disabled', () => {
    const onFile = vi.fn();
    render(<CsvDropzone onFile={onFile} disabled />);
    const zone = screen.getByTestId('csv-dropzone');
    fireEvent.drop(zone, { dataTransfer: { files: [csv] } });
    expect(onFile).not.toHaveBeenCalled();
  });

});
