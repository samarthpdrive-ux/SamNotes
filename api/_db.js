import { connect } from '@tidbcloud/serverless';
let ready=false;
export async function db(){ if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL missing'); const conn=connect({url:process.env.DATABASE_URL}); if(!ready){await conn.execute('CREATE TABLE IF NOT EXISTS daily_notes_drafts (draft_id VARCHAR(100) PRIMARY KEY, content JSON NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)');ready=true;} return conn; }
export const rows=result=>Array.isArray(result)?result:(result?.rows||[]);
