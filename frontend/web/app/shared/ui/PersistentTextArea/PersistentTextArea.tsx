import { Input } from 'antd';
import type { TextAreaProps, TextAreaRef } from 'antd/es/input/TextArea';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

const MIN_HEIGHT = 48;
const MAX_HEIGHT = 1200;

function normalizeHeight(value: unknown): number | undefined {
  const height = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(height) || height < MIN_HEIGHT || height > MAX_HEIGHT) return undefined;
  return Math.round(height);
}

function readHeight(storageKey: string): number | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return normalizeHeight(window.localStorage.getItem(storageKey));
  } catch {
    return undefined;
  }
}

function writeHeight(storageKey: string, height: number) {
  try {
    window.localStorage.setItem(storageKey, String(height));
  } catch {
    // The textarea remains usable when browser storage is unavailable.
  }
}

export type PersistentTextAreaProps = Omit<TextAreaProps, 'autoSize'> & {
  storageKey: string;
};

export function PersistentTextArea({
  storageKey,
  style,
  value,
  defaultValue,
  onPointerUp,
  ...props
}: PersistentTextAreaProps) {
  const inputRef = useRef<TextAreaRef>(null);
  const managedHeightRef = useRef<number | undefined>(undefined);
  const [preferredHeight, setPreferredHeight] = useState(() => readHeight(storageKey));

  const persistRenderedHeight = useCallback(() => {
    const textarea = inputRef.current?.resizableTextArea?.textArea;
    if (!textarea) return;
    const height = normalizeHeight(textarea.getBoundingClientRect().height);
    if (height === undefined) return;
    if (managedHeightRef.current !== undefined && Math.abs(height - managedHeightRef.current) < 1)
      return;
    managedHeightRef.current = height;
    setPreferredHeight(height);
    writeHeight(storageKey, height);
  }, [storageKey]);

  useLayoutEffect(() => {
    managedHeightRef.current = undefined;
    setPreferredHeight(readHeight(storageKey));
  }, [storageKey]);

  useLayoutEffect(() => {
    const textarea = inputRef.current?.resizableTextArea?.textArea;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const contentHeight = normalizeHeight(textarea.scrollHeight);
    const height = Math.max(preferredHeight ?? 0, contentHeight ?? 0);
    if (!height) return;

    managedHeightRef.current = height;
    textarea.style.height = `${height}px`;
  }, [defaultValue, preferredHeight, value]);

  useLayoutEffect(() => {
    const textarea = inputRef.current?.resizableTextArea?.textArea;
    if (!textarea || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(persistRenderedHeight);
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [persistRenderedHeight]);

  return (
    <Input.TextArea
      {...props}
      ref={inputRef}
      value={value}
      defaultValue={defaultValue}
      autoSize={false}
      onPointerUp={(event) => {
        onPointerUp?.(event);
        persistRenderedHeight();
      }}
      style={{ ...style, resize: 'vertical', overflowY: 'auto' }}
    />
  );
}
