import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ioyixenqdshxqgqoocwj.supabase.co'
const supabaseAnonKey = 'sb_publishable_VzFuv2sbiKQotJNjeq8l6Q_-MP7kSnY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types
export interface User {
  id: string
  name_tag: string
  created_at: string
  timezone: string
}

export interface SugarLog {
  id: string
  user_id: string
  date: string // YYYY-MM-DD format
  sugar_grams: number
  updated_at: string
}

