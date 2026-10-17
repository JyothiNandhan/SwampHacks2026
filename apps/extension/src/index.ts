export const extensionStatus = 'manifest-v3-ready';

export interface ExtensionCapturePreview {
  source: 'page' | 'receipt';
  merchantName: string | null;
  capturedAt: string;
  notes: string[];
}

export const buildExtensionPreview = (
  merchantName: string | null,
  notes: string[] = [],
): ExtensionCapturePreview => ({
  source: 'page',
  merchantName,
  capturedAt: new Date().toISOString(),
  notes,
});
