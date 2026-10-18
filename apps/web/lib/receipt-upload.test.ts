import { expect, test } from 'vitest';
import { receiptBytesToBase64, receiptUploadFormat, uploadErrorMessage } from './receipt-upload';

test('routes PDF receipts to the PDF extractor regardless of a users email/photo selection', () => {
    expect(receiptUploadFormat({ name: 'email-receipt.pdf', type: 'application/pdf', size: 1024 }))
        .toEqual({ mimeType: 'application/pdf', source: 'PDF' });
    expect(receiptUploadFormat({ name: 'receipt.PDF', type: '', size: 1024 }).source).toBe('PDF');
    expect(receiptUploadFormat({ name: 'receipt.pdf', type: 'application/octet-stream', size: 1024 }).source).toBe('PDF');
});

test('routes images and email text to their supported extractors', () => {
    expect(receiptUploadFormat({ name: 'receipt.jpg', type: 'image/jpeg', size: 10 }).source).toBe('PHOTO');
    expect(receiptUploadFormat({ name: 'email.html', type: 'text/html', size: 10 }).source).toBe('EMAIL');
    expect(receiptUploadFormat({ name: 'email.txt', type: '', size: 10 }).mimeType).toBe('text/plain');
});

test('rejects empty, oversized and unsupported receipts before uploading', () => {
    for (const file of [
        { name: 'email.pdf', type: 'application/pdf', size: 0 },
        { name: 'email.pdf', type: 'application/pdf', size: 4194305 },
        { name: 'email.eml', type: 'message/rfc822', size: 10 },
        { name: 'photo.heic', type: 'image/heic', size: 10 },
        { name: 'wrong.pdf', type: 'application/json', size: 10 },
    ]) expect(() => receiptUploadFormat(file)).toThrow();
});

test('encodes binary receipts in bounded chunks without corrupting bytes', () => {
    expect(receiptBytesToBase64(Uint8Array.from([0, 255, 128, 65]))).toBe('AP+AQQ==');
    const large = new Uint8Array(4 * 1024 * 1024);
    large[0] = 17;
    large[large.length - 1] = 239;
    const encoded = receiptBytesToBase64(large);
    expect(atob(encoded).length).toBe(large.length);
    expect(atob(encoded.slice(0, 4)).charCodeAt(0)).toBe(17);
    expect(atob(encoded.slice(-4)).charCodeAt(0)).toBe(239);
});

test('provides safe useful errors without forwarding arbitrary backend content', () => {
    expect(uploadErrorMessage(415, 'UNSUPPORTED_MEDIA_TYPE')).toContain('file type');
    expect(uploadErrorMessage(409, 'DOCUMENT_QUOTA_REACHED')).toContain('upload limit');
    expect(uploadErrorMessage(502, 'EXTRACTION_PROVIDER_FAILED')).toContain('file was saved');
    expect(uploadErrorMessage(500, 'secret provider message')).not.toContain('secret');
    expect(uploadErrorMessage(400, '__proto__')).toContain('could not be completed');
});
