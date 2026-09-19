import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseKey && 
  !supabaseUrl.includes('your-supabase-project') &&
  !supabaseKey.includes('your-supabase-service-role-key')
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    })
  : null;

if (!isSupabaseConfigured) {
  console.warn(
    '[DB Warning] Supabase credentials not set or contain default placeholders in .env. Falling back to local in-memory persistence store.'
  );
} else {
  console.log('[DB Info] Connected to Supabase at:', supabaseUrl);
}
