import { describe, expect, it } from 'vitest';
import { numberBoxLabel } from '../web/src/components/SliderField';

describe('SliderField number box label', () => {
  it('names the unit when there is one', () => {
    expect(numberBoxLabel('Line thickness', 'px')).toBe('Line thickness (px)');
  });

  it('has no empty brackets when there is no unit (Heading weight)', () => {
    expect(numberBoxLabel('Heading weight', '')).toBe('Heading weight');
  });
});
