import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';

import PasswordStrengthMeter from '@/auth/password_rules/PasswordStrengthMeter';

function renderMeter(password: string, label: string) {
  return render(
    <ChakraProvider value={defaultSystem}>
      <PasswordStrengthMeter password={password} label={label} />
    </ChakraProvider>
  );
}

// The segment row is the aria-hidden HStack; each direct child is one of
// the 4 fixed segments. Chakra/Panda gives same-styled segments an
// identical generated className and differently-styled ones a different
// one, so counting distinct classNames among the trailing (unfilled)
// segments' class vs the leading (filled) ones' class tells filled count
// without depending on jsdom resolving CSS custom properties.
function segmentClasses(container: HTMLElement): string[] {
  const row = container.querySelector('[aria-hidden="true"]') as HTMLElement;
  return Array.from(row.children).map((el) => (el as HTMLElement).className);
}

describe('PasswordStrengthMeter', () => {
  it('fills zero segments (all share the unfilled class) and shows the muted "-" label for an empty password', () => {
    const { container } = renderMeter('', 'Strength: -');

    const classes = segmentClasses(container);
    expect(classes).toHaveLength(4);
    expect(new Set(classes).size).toBe(1); // all 4 identical -> none filled

    const label = screen.getByText('Strength: -');
    expect(label).toBeInTheDocument();
    expect(getComputedStyle(label).color).toBe('var(--chakra-colors-fg-muted)');
  });

  it('fills exactly 2 segments and shows red "Weak" for a password passing 2 rules', () => {
    // length + lower only = 2 rules -> Weak (<=2)
    const { container } = renderMeter('aaaaaaaa', 'Strength: Weak');

    const classes = segmentClasses(container);
    expect(classes.slice(0, 2).every((c) => c === classes[0])).toBe(true);
    expect(classes[2] === classes[0]).toBe(false); // unfilled segments differ from filled ones
    expect(classes[2]).toBe(classes[3]);

    const label = screen.getByText('Strength: Weak');
    expect(getComputedStyle(label).color).toBe('var(--chakra-colors-red-500)');
  });

  it('fills exactly 3 segments and shows orange "Medium" for a password passing 3 rules', () => {
    // length + upper + lower = 3 rules -> Medium
    const { container } = renderMeter('Aaaaaaaa', 'Strength: Medium');

    const classes = segmentClasses(container);
    expect(classes.slice(0, 3).every((c) => c === classes[0])).toBe(true);
    expect(classes[3] === classes[0]).toBe(false);

    const label = screen.getByText('Strength: Medium');
    expect(getComputedStyle(label).color).toBe('var(--chakra-colors-orange-400)');
  });

  it('fills all 4 segments and shows green "Strong" once every rule passes', () => {
    const { container } = renderMeter('Aaaaaaaa1', 'Strength: Strong');

    const classes = segmentClasses(container);
    expect(new Set(classes).size).toBe(1); // all 4 filled -> identical class

    const label = screen.getByText('Strength: Strong');
    expect(getComputedStyle(label).color).toBe('var(--chakra-colors-green-500)');
  });
});
