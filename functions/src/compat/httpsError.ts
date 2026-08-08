/** Lightweight HttpsError that mirrors the firebase-functions v2 API. */
export class HttpsError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'HttpsError';
  }
}
