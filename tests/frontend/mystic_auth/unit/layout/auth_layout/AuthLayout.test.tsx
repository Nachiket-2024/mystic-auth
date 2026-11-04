import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import AuthLayout from '@/layout/auth_layout/AuthLayout';

describe('AuthLayout', () => {
  it('keeps the font, language and theme controls outside <main>', () => {
    // <main> pads its card with `[&>div>div]:p-*`; a control wrapper inside it
    // picks that padding up and sits about 20px away from the screen corner.
    render(
      <MemoryRouter>
        <AuthLayout>
          <p>content</p>
        </AuthLayout>
      </MemoryRouter>
    );

    const main = screen.getByRole('main');
    expect(main).toContainElement(screen.getByText('content'));
    for (const control of screen.getAllByRole('button')) {
      expect(main).not.toContainElement(control);
    }
  });
});
