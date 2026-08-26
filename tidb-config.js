// Vercel uses the deployed website API automatically.
// file:// preview uses the local Node API.
window.TIDB_API_URL =
  location.protocol === "file:" ? "http://127.0.0.1:3000" : "";
