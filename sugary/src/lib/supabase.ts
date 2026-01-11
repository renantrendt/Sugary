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
  longest_streak: number
}

export interface SugarLog {
  id: string
  user_id: string
  date: string // YYYY-MM-DD format
  sugar_grams: number
  updated_at: string
}

export interface Group {
  id: string
  name: string
  created_by: string
  created_at: string
  invite_code: string
}

export interface GroupMember {
  id: string
  group_id: string
  user_id: string
  joined_at: string
  users?: User
}

export interface Tracker {
  id: string
  group_id: string
  name: string
  type: 'yes_no' | 'amount'
  unit: string | null
  created_by: string
  created_at: string
}

export interface TrackerEntry {
  id: string
  tracker_id: string
  user_id: string
  date: string
  value: { answer: boolean } | { amount: number }
  created_at: string
  users?: User
}

// Helper to generate invite codes
export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}
