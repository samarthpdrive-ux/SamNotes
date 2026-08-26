import { token } from './_auth.js';
export default function handler(req,res){if(req.method!=='POST')return res.status(405).end();if(!process.env.VAULT_PASSWORD||!process.env.AUTH_SECRET)return res.status(500).json({error:'Server secrets missing'});if(req.body?.password!==process.env.VAULT_PASSWORD)return res.status(401).json({ok:false});return res.status(200).json({ok:true,token:token()});}
