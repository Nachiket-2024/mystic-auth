import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SegmentedControl from '@/ui/filters/SegmentedControl';

describe('SegmentedControl', () => {
  it('marks the option matching `value` as pressed, and the others not', () => {
    render(
      <SegmentedControl
        ariaLabel="Result"
        value="true"
        onChange={vi.fn()}
        options={[
          { value: '', label: 'All' },
          { value: 'true', label: 'Allowed' },
          { value: 'false', label: 'Denied' },
        ]}
      />
    );

    expect(screen.getByRole('button', { name: 'Allowed' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Denied' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the clicked option\'s value on a single click (no open-then-pick step)', async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        ariaLabel="Result"
        value=""
        onChange={onChange}
        options={[
          { value: '', label: 'All' },
          { value: 'true', label: 'Allowed' },
        ]}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Allowed' }));
    expect(onChange).toHaveBeenCalledWith('true');
  });

  it('exposes the group as a labeled group for assistive tech', () => {
    render(
      <SegmentedControl
        ariaLabel="Result"
        value=""
        onChange={vi.fn()}
        options={[{ value: '', label: 'All' }]}
      />
    );
    expect(screen.getByRole('group', { name: 'Result' })).toBeInTheDocument();
  });
});
