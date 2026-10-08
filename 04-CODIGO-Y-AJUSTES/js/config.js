/* Published games use their own API. Downloaded copies may point at the same
   HTTPS host by setting apiBase to that host (no key or password is public). */
export const ONLINE_CONFIG = Object.freeze({
  apiBase: 'https://mapache-cinema-lumera.codyworksoporte.chatgpt.site',
  sameOrigin: true,
  requestTimeoutMs: 6500,
});
