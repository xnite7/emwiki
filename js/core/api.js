/* =============================================================================
   api.js — the ONE fetch wrapper for every /api call.
   JSON in/out, optional bearer auth (waits for the session check), optional
   error toast, and GET retries. New and migrated code must use this instead
   of raw fetch().

     const data = await api('/api/trades', { method: 'POST', body: {...},
                                             auth: true, toastOnError: true });
   Throws ApiError { status, code, message } on any failure.
   ========================================================================== */

import { Utils } from './utils.js';

export class ApiError extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
}

export async function api(path, options = {}) {
    const {
        method = 'GET',
        body = undefined,
        auth = false,
        toastOnError = false,
        retries = method === 'GET' ? 1 : 0,
        headers: extraHeaders = {},
        signal,
    } = options;

    const headers = { ...extraHeaders };

    if (auth) {
        // Wait for the session check so we don't race it with a stale token.
        if (window.Auth?.waitForSession) {
            await window.Auth.waitForSession();
        }
        const token = localStorage.getItem('auth_token');
        if (!token) {
            const err = new ApiError(401, 'not_authenticated', 'You must be signed in to do that.');
            if (toastOnError) Utils.showToast('Sign in required', err.message, 'warning');
            throw err;
        }
        headers['Authorization'] = `Bearer ${token}`;
    }

    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }

    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(path, {
                method,
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal,
            });

            if (!res.ok) {
                let code = 'http_error';
                let message = `Request failed (${res.status})`;
                try {
                    const data = await res.json();
                    code = data.code || data.error || code;
                    message = data.message || data.error || message;
                } catch { /* non-JSON error body */ }
                // Only retry server errors, never 4xx.
                if (res.status >= 500 && attempt < retries) {
                    lastError = new ApiError(res.status, code, message);
                    continue;
                }
                const err = new ApiError(res.status, code, message);
                if (toastOnError) Utils.showToast('Error', err.message, 'error');
                throw err;
            }

            if (res.status === 204) return null;
            return await res.json();
        } catch (e) {
            if (e instanceof ApiError) throw e;
            if (e.name === 'AbortError') throw e;
            // Network failure — retry if allowed.
            lastError = new ApiError(0, 'network_error', 'Network error — check your connection.');
            if (attempt < retries) continue;
            if (toastOnError) Utils.showToast('Error', lastError.message, 'error');
            throw lastError;
        }
    }
    throw lastError;
}
