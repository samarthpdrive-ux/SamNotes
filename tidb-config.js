// Same-origin in the deployed Node app; localhost fallback when using a separate static server.
window.TIDB_API_URL = location.port === '3000' ? '' : 'http://127.0.0.1:3000';
