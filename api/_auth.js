import crypto from 'node:crypto';
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = value => crypto.createHmac('sha256', process.env.AUTH_SECRET).update(value).digest('base64url');
export function token() { const p=b64({sub:'samarthp2727',exp:Date.now()+1000*60*60*24*14}); return `${p}.${sign(p)}`; }
export function allowed(req) { try { const [p,s]=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').split('.'); const expected=sign(p); return Boolean(p&&s&&s.length===expected.length&&crypto.timingSafeEqual(Buffer.from(s),Buffer.from(expected))&&JSON.parse(Buffer.from(p,'base64url')).exp>Date.now()); } catch { return false; } }
