import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PersistentTextArea } from './PersistentTextArea';

const storageKey = 'test.persistent-textarea.height';

describe('PersistentTextArea', () => {
  beforeAll(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });
  afterAll(() => vi.unstubAllGlobals());
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => window.localStorage.clear());

  it('restores a saved height', () => {
    window.localStorage.setItem(storageKey, '180');

    render(<PersistentTextArea aria-label="Notes" storageKey={storageKey} rows={3} />);

    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveStyle({ height: '180px' });
  });

  it('stores a height changed by the user', () => {
    render(<PersistentTextArea aria-label="Notes" storageKey={storageKey} rows={3} />);
    const textarea = screen.getByRole('textbox', { name: 'Notes' });
    textarea.getBoundingClientRect = () =>
      ({
        bottom: 196,
        height: 196,
        left: 0,
        right: 280,
        top: 0,
        width: 280,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      }) as DOMRect;

    fireEvent.pointerUp(textarea);

    expect(window.localStorage.getItem(storageKey)).toBe('196');
  });

  it('grows when the content needs more room than the saved height', () => {
    window.localStorage.setItem(storageKey, '96');
    const view = render(
      <PersistentTextArea aria-label="Notes" storageKey={storageKey} value="Short" readOnly />,
    );
    const textarea = screen.getByRole('textbox', { name: 'Notes' });
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 220 });

    view.rerender(
      <PersistentTextArea
        aria-label="Notes"
        storageKey={storageKey}
        value={'A much longer value\n'.repeat(20)}
        readOnly
      />,
    );

    expect(textarea).toHaveStyle({ height: '220px' });
  });

  it('ignores invalid saved heights', () => {
    window.localStorage.setItem(storageKey, 'not-a-height');

    render(<PersistentTextArea aria-label="Notes" storageKey={storageKey} rows={3} />);

    expect(screen.getByRole('textbox', { name: 'Notes' }).style.height).toBe('auto');
  });

  it('remains usable when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage disabled');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage disabled');
    });

    render(<PersistentTextArea aria-label="Notes" storageKey={storageKey} rows={3} />);
    const textarea = screen.getByRole('textbox', { name: 'Notes' });
    textarea.getBoundingClientRect = () => ({ height: 160 }) as DOMRect;

    expect(() => fireEvent.pointerUp(textarea)).not.toThrow();
  });
});
