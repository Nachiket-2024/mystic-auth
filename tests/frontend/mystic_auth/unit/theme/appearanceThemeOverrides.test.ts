import { describe, it, expect } from 'vitest';
import { colord, extend } from 'colord';
import mixPlugin from 'colord/plugins/mix';

import {
  buildAppearanceThemeOverrides,
  deriveCanvasFrom,
} from '@/theme/appearanceThemeOverrides';
import { generateBrandScale } from '@/theme/generateBrandScale';

extend([mixPlugin]);

describe('buildAppearanceThemeOverrides', () => {
  it('returns null when no brand color is set (default theme, no rebuild needed)', () => {
    expect(buildAppearanceThemeOverrides({ brandColor: null })).toBeNull();
  });

  it('returns a SystemConfig fragment with all ten brand scale steps when a color is set', () => {
    const overrides = buildAppearanceThemeOverrides({ brandColor: '#2563eb' });

    expect(overrides).toBeTruthy();
    const brand = overrides!.theme!.tokens!.colors!.brand as Record<string, { value: string }>;
    expect(Object.keys(brand).sort()).toEqual(
      ['100', '200', '300', '400', '50', '500', '600', '700', '800', '900'].sort()
    );
    expect(brand['500'].value).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('sets bg.canvasFrom for both light and dark modes from the derived scale', () => {
    const overrides = buildAppearanceThemeOverrides({ brandColor: '#2563eb' });

    const canvasFrom = overrides!.theme!.semanticTokens!.colors!['bg.canvasFrom'] as {
      value: { _light: string; _dark: string };
    };
    expect(canvasFrom.value._light).toMatch(/^#[0-9a-f]{6}$/i);
    expect(canvasFrom.value._dark).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('deriveCanvasFrom', () => {
  it('uses the 100 step as-is for the light-mode value', () => {
    const scale = generateBrandScale('#2563eb');

    expect(deriveCanvasFrom(scale).light).toBe(scale['100']);
  });

  it('blends gray.900 with the 900 step for the dark-mode value (not a flat brand.900 wash)', () => {
    const scale = generateBrandScale('#2563eb');

    // A 65/35 blend of gray.900 with the 900 step, matching the function's
    // own docstring - not a flat #18181b or a flat scale['900'] wash.
    const { dark } = deriveCanvasFrom(scale);
    const blended = colord('#18181b').mix(scale['900'], 0.35).toHex();
    expect(dark).toBe(blended);
  });
});
