import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import PolicyDialogTabs from '@/policies/dialogs/PolicyDialogTabs';

// Protected (baseline/system) policies keep the Edit tab visible but inert,
// and it must not look clickable.

const renderTabs = (editDisabled: boolean, onEdit = vi.fn()) => {
  render(
    <PolicyDialogTabs
      activeTab="details"
      showEdit
      editDisabled={editDisabled}
      editDisabledLabel="Protected policies cannot be edited"
      onDetails={vi.fn()}
      onEdit={onEdit}
    />
  );
  return screen.getByRole('tab', { name: /edit/i });
};

describe('PolicyDialogTabs edit tab', () => {
  it('is disabled, explained and not clickable for a protected policy', () => {
    const onEdit = vi.fn();
    const tab = renderTabs(true, onEdit);
    expect(tab).toBeDisabled();
    expect(tab).toHaveAttribute('title', 'Protected policies cannot be edited');
    expect(tab.className).toContain('cursor-not-allowed');
    expect(tab.className).not.toContain('hover:bg-brand-subtle');
    fireEvent.click(tab);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('activates normally for an editable policy', () => {
    const onEdit = vi.fn();
    const tab = renderTabs(false, onEdit);
    expect(tab).toBeEnabled();
    fireEvent.click(tab);
    expect(onEdit).toHaveBeenCalledOnce();
  });
});
