const formats: Record<string, { mimeType: string; source: 'PDF' | 'PHOTO' | 'EMAIL' }> = {
    'application/pdf': { mimeType: 'application/pdf', source: 'PDF' },
    'image/jpeg': { mimeType: 'image/jpeg', source: 'PHOTO' },
    'image/png': { mimeType: 'image/png', source: 'PHOTO' },
    'image/webp': { mimeType: 'image/webp', source: 'PHOTO' },
    'text/plain': { mimeType: 'text/plain', source: 'EMAIL' },
    'text/html': { mimeType: 'text/html', source: 'EMAIL' },
};
const extensions: Record<string, string> = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', webp: 'image/webp', txt: 'text/plain',
    html: 'text/html', htm: 'text/html',
};

export function receiptUploadFormat(file: { name: string; type: string; size: number }) {
    if (!file.size) throw new Error('This file is empty. Choose a saved receipt.');
    if (file.size > 4 * 1024 * 1024) throw new Error('Choose a receipt no larger than 4 MB.');
    let mimeType = file.type.toLowerCase().split(';')[0].trim();
    if (!mimeType || mimeType === 'application/octet-stream')
        mimeType = extensions[file.name.split('.').pop()?.toLowerCase() ?? ''] ?? '';
    const format = formats[mimeType];
    if (!format) throw new Error('Choose a PDF, JPG, PNG, WebP, text or HTML receipt. Save .eml or HEIC files as PDF or JPG first.');
    return format;
}

export function receiptBytesToBase64(bytes: Uint8Array) {
    const chunks: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += 0x8000)
        chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
    return btoa(chunks.join(''));
}

export function uploadErrorMessage(status: number, code?: string) {
    const messages: Record<string, string> = {
        UNSUPPORTED_MEDIA_TYPE: 'The receipt file type does not match its source. Try uploading it again.',
        CONTENT_TYPE_MISMATCH: 'This file does not contain the expected PDF or image data. Export the original receipt again.',
        INVALID_TEXT_DOCUMENT: 'The email receipt must contain readable text. Export it as a PDF or text file.',
        DOCUMENT_QUOTA_REACHED: 'This account has reached its receipt upload limit. Contact the workspace administrator.',
        USER_NOT_PROVISIONED: 'Your account is not set up for receipt storage. Contact the workspace administrator.',
        DOCUMENTS_NOT_CONFIGURED: 'Receipt processing is not configured on the server. Contact the workspace administrator.',
        EVIDENCE_STORAGE_UNWRITABLE: 'Receipt storage is temporarily unavailable. Please try again later.',
        EXTRACTION_PROVIDER_FAILED: 'Your file was saved, but receipt extraction is temporarily unavailable. Please try again later.',
        EXTRACTION_INCOMPLETE: 'Your file was saved, but extraction could not finish. Try a clearer receipt.',
        INVALID_EXTRACTION: 'Your file was saved, but its receipt details could not be read. Try a clearer receipt.',
    };
    if (code && Object.hasOwn(messages, code)) return messages[code];
    if (status === 401) return 'Your session expired. Reconnect your account.';
    if (status === 403) return 'Your account does not have permission to perform this action.';
    if (status === 413) return 'The upload is too large. Choose a receipt no larger than 4 MB.';
    if (status === 415) return 'This receipt format is unsupported. Use PDF, JPG, PNG, WebP, text or HTML.';
    if (status === 429) return 'Too many requests. Wait a moment before trying again.';
    if (status >= 500) return 'Receipt processing is temporarily unavailable. Please try again later.';
    return 'The action could not be completed. Please review your information.';
}
