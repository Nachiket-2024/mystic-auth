import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Pagination from '@/ui/navigation/Pagination';

describe('Pagination', () => {
  it('calls onPageChange with the previous page when Prev is clicked', async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={3} totalPages={5} onPageChange={onPageChange} />);

    await userEvent.click(screen.getByRole('button', { name: /previous/i }));

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange with the next page when Next is clicked', async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={3} totalPages={5} onPageChange={onPageChange} />);

    await userEvent.click(screen.getByRole('button', { name: /next page/i }));

    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('disables Prev on the first page and Next on the last page', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} totalPages={1} onPageChange={onPageChange} />);

    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
  });

  it('collapses a large page range into leading and trailing ellipses', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={10} totalPages={20} onPageChange={onPageChange} />);

    const ellipses = screen.getAllByText('…');
    expect(ellipses).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 20' })).toBeInTheDocument();
  });

  it('calls onPageChange with the clicked page number', async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} totalPages={3} onPageChange={onPageChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }));

    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
