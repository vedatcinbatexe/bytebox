import http from 'node:http';

// One request from the API tester to the user's server (sent from here, so the browser has no CORS trouble)
export interface ApiRequest {
  id: number; // matches the answer to the question in the browser
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}

export interface ApiResponse {
  id: number;
  status: number; // 0 when the server didn't answer
  statusText: string;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
  timeMs: number;
  sizeBytes: number;
  error?: string;
}

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const MAX_BODY_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const TIMEOUT_MS = 30_000;

export function sendApiRequest(host: string, port: number, request: ApiRequest): Promise<ApiResponse> {
  const started = Date.now();
  const failed = (error: string): ApiResponse => ({
    id: request.id, status: 0, statusText: '', headers: {}, body: '', truncated: false,
    timeMs: Date.now() - started, sizeBytes: 0, error,
  });

  const method = String(request.method).toUpperCase();
  if (!METHODS.includes(method)) return Promise.resolve(failed(`Unsupported method ${method}`));
  const path = String(request.path || '/');
  if (!path.startsWith('/') || /[\s\r\n]/.test(path)) return Promise.resolve(failed('The path must start with / and have no spaces'));
  const body = Buffer.from(String(request.body ?? ''), 'utf8');
  if (body.length > MAX_BODY_BYTES) return Promise.resolve(failed('The request body is larger than 256 KB'));

  // Only simple header names and values; host and length are set here
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    if (/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name) && !/[\r\n]/.test(String(value))) {
      if (!['host', 'content-length', 'transfer-encoding', 'connection'].includes(name.toLowerCase())) {
        headers[name] = String(value);
      }
    }
  }
  if (body.length > 0 && method !== 'GET' && method !== 'HEAD') headers['content-length'] = String(body.length);

  return new Promise((resolve) => {
    const outgoing = http.request({ host, port, method, path, headers: { ...headers, host: `localhost:${port}` }, timeout: TIMEOUT_MS }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let truncated = false;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size <= MAX_RESPONSE_BYTES) chunks.push(chunk);
        else truncated = true;
      });
      response.on('end', () => {
        const responseHeaders: Record<string, string> = {};
        for (const [name, value] of Object.entries(response.headers)) {
          if (value !== undefined) responseHeaders[name] = Array.isArray(value) ? value.join(', ') : value;
        }
        resolve({
          id: request.id,
          status: response.statusCode ?? 0,
          statusText: response.statusMessage ?? '',
          headers: responseHeaders,
          body: Buffer.concat(chunks).subarray(0, MAX_RESPONSE_BYTES).toString('utf8'),
          truncated,
          timeMs: Date.now() - started,
          sizeBytes: size,
        });
      });
    });
    outgoing.on('timeout', () => outgoing.destroy(new Error('The server took longer than 30 s to answer')));
    outgoing.on('error', (error) => resolve(failed(error.message)));
    if (body.length > 0 && method !== 'GET' && method !== 'HEAD') outgoing.write(body);
    outgoing.end();
  });
}
