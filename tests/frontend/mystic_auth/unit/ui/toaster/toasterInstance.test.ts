import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getToasts, toaster } from '@/ui/toaster/toasterInstance';

describe('toasterInstance dismiss(id)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    toaster.dismiss();
    vi.useRealTimers();
  });

  it('marks a single toast exiting then removes it after its exit animation, leaving others untouched', () => {
    const keep = toaster.create({ title: 'Keep me' });
    const removeMe = toaster.create({ title: 'Remove me' });

    toaster.dismiss(removeMe);

    expect(getToasts().find((t) => t.id === removeMe)?.exiting).toBe(true);
    expect(getToasts().find((t) => t.id === keep)?.exiting).toBeFalsy();

    vi.advanceTimersByTime(180);

    expect(getToasts().find((t) => t.id === removeMe)).toBeUndefined();
    expect(getToasts().find((t) => t.id === keep)).toBeDefined();
  });

  it('accepts a string id, same as the component-level API passes through', () => {
    const id = toaster.create({ title: 'String id dismiss' });

    toaster.dismiss(String(id));
    vi.advanceTimersByTime(180);

    expect(getToasts().find((t) => t.id === id)).toBeUndefined();
  });

  it('is a no-op when the given id does not match any current toast', () => {
    toaster.create({ title: 'Untouched' });
    const before = getToasts().length;

    toaster.dismiss(999999);

    expect(getToasts().length).toBe(before);
  });
});
