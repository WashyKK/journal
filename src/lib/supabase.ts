import { createClient } from "@supabase/supabase-js"

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const JOURNAL_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "journal-images"
export const IS_PRIVATE_BUCKET = process.env.NEXT_PUBLIC_PRIVATE_BUCKET === "true"
