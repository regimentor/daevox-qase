import { describe, expect, it } from 'vitest';
import { isSafeUploadUrl, MAX_ATTACHMENT_BYTES, validateAttachment } from './validation';
describe('attachment validation', () => {
  it.each([
    [{ name: '', size: 1, type: 'image/png' }, 'имени'],
    [{ name: 'a.png', size: 0, type: 'image/png' }, 'пуст'],
    [{ name: 'a.png', size: MAX_ATTACHMENT_BYTES + 1, type: 'image/png' }, '25 МБ'],
    [{ name: 'a.exe', size: 1, type: 'application/x-msdownload' }, 'Разрешены'],
  ])('rejects invalid file', (file, text) => expect(validateAttachment(file)).toContain(text));
  it('accepts supported file', () =>
    expect(validateAttachment({ name: 'a.pdf', size: 4, type: 'application/pdf' })).toBeNull());
  it.each([
    ['https://storage.test/file', true],
    ['http://localhost/file', true],
    ['http://storage.test/file', false],
    ['javascript:alert(1)', false],
    ['broken', false],
  ])('validates URL %s', (url, expected) => expect(isSafeUploadUrl(url)).toBe(expected));
});
