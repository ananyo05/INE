import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Normalize URL in case /rest/v1 or trailing slash was pasted
const rawUrl = process.env.SUPABASE_URL;
const supabaseUrl = rawUrl ? rawUrl.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '') : null;
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY)?.trim();

const isJwt = Boolean(supabaseKey && (supabaseKey.startsWith('eyJ') || supabaseKey.startsWith('sb_secret_')));

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseKey && 
  isJwt &&
  !supabaseUrl.includes('your-supabase-project') &&
  !supabaseKey.includes('your-supabase-service-role-key')
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    })
  : null;

if (!isSupabaseConfigured) {
  if (supabaseKey && !isJwt) {
    console.warn(
      `[DB Warning] Supabase API key in .env does not look like a valid API key (should start with 'eyJ' for legacy keys or 'sb_secret_' for new-format keys). Falling back to local in-memory store. Get the correct key from Supabase Dashboard -> Project Settings -> API Keys.`
    );
  } else {
    console.warn(
      '[DB Warning] Supabase credentials not set or contain default placeholders in .env. Falling back to local in-memory persistence store.'
    );
  }
} else {
  console.log('[DB Info] Connected to Supabase at:', supabaseUrl);
}
