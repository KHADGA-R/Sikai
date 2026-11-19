import { HttpClient, HttpErrorResponse, HttpEventType, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { filter, firstValueFrom, tap, timeout } from 'rxjs';

/** Relative requests use the development proxy; production should route /api to Spring Boot. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', { providedIn: 'root', factory: () => '/api' });
const TOKEN_KEY = 'sikai.api-token';

export class ApiError extends Error {
  /** Preserve a normalized API failure message together with its HTTP status for callers. */
  constructor(message: string, readonly status: number) { super(message); }
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL).replace(/\/$/, '');
  readonly token = signal<string | null>(this.readToken());

  /** Update the in-memory token and persist it for this browser tab; storage failures do not prevent login. */
  setToken(token: string | null): void {
    this.token.set(token);
    try { token ? sessionStorage.setItem(TOKEN_KEY, token) : sessionStorage.removeItem(TOKEN_KEY); }
    catch { /* In-memory sessions still work if browser storage is disabled. */ }
  }

  /** Restore only the API token from session storage, treating unavailable storage as a signed-out session. */
  private readToken(): string | null {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  }

  /** Send a typed API request with an optional bearer token; FormData bodies retain their browser-generated boundary. */
  async request<T>(method: string, path: string, body?: unknown, authenticated = true): Promise<T> {
    const token = authenticated ? this.token() : null;
    try {
      return await firstValueFrom(this.http.request<T>(method, this.base + path, {
        body, headers: token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined
      }).pipe(timeout(120000)));
    } catch (error) { throw this.error(error, token); }
  }

  async upload<T>(path: string, body: FormData, progress: (percent: number) => void): Promise<T> {
    const token = this.token();
    try {
      const response = await firstValueFrom(this.http.post<T>(this.base + path, body, {
        headers: token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined,
        observe: 'events', reportProgress: true
      }).pipe(
        timeout(120000),
        tap(event => {
          if (event.type === HttpEventType.UploadProgress && event.total) progress(Math.round(event.loaded / event.total * 100));
        }),
        filter((event): event is HttpResponse<T> => event.type === HttpEventType.Response)
      ));
      return response.body as T;
    } catch (error) { throw this.error(error, token); }
  }

  /** Download a protected lesson as a Blob so video, audio and PDF views can use an authenticated object URL. */
  async file(lessonId: number | string, resource: 'file' | 'slides' = 'file'): Promise<Blob> {
    return this.blob(`/lessons/${lessonId}/${resource}`);
  }

  async blob(path: string): Promise<Blob> {
    const token = this.token();
    try {
      return await firstValueFrom(this.http.get(this.base + path, {
        responseType: 'blob', headers: token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined
      }).pipe(timeout(120000)));
    } catch (error) { throw this.error(error, token); }
  }

  /** Normalize HTTP failures and clear revoked credentials only when the failed request used the current token. */
  private error(error: unknown, token: string | null): ApiError {
    if (!(error instanceof HttpErrorResponse)) return new ApiError('Unable to complete the request.', 0);
    // A stale request must not clear a newer login's credentials.
    if (error.status === 401 && token && this.token() === token) this.setToken(null);
    const message = typeof error.error?.message === 'string' ? error.error.message
      : error.status === 0 ? 'Cannot reach the server. Check that the backend is running and try again.'
      : error.status === 401 ? 'Your session has expired. Please log in again.'
      : error.status === 403 ? 'You do not have access to this resource.'
      : 'The request failed. Please try again.';
    return new ApiError(message, error.status);
  }
}
