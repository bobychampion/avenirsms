import { getAuth } from 'firebase/auth';

async function getToken(): Promise<string | null> {
  return (await getAuth().currentUser?.getIdToken()) ?? null;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export async function callApi<T = unknown>(
  endpoint: string,
  body?: unknown,
  method: 'POST' | 'GET' | 'DELETE' = 'POST',
): Promise<T> {
  const token = await getToken();
  const url = endpoint.startsWith('/') ? `${API_BASE}${endpoint}` : endpoint;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    let message = `API error ${res.status}`;
    try {
      const json = await res.json();
      message = json.error ?? json.message ?? message;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}
