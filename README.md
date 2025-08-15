Journal UI (Next.js + shadcn + Supabase)

What this is
- Next.js 14 + TypeScript app scaffolded manually (no generator).
- Tailwind and shadcn-style UI primitives (Button, Input, Textarea, Label, Card).
- A simple Journal form to save text and an optional image to Supabase Storage + row in a journal_entries table.

Quick start
1) Install deps
   npm install

2) Configure Supabase env vars
   - Copy .env.example to .env and set:
     NEXT_PUBLIC_SUPABASE_URL
     NEXT_PUBLIC_SUPABASE_ANON_KEY
     NEXT_PUBLIC_SUPABASE_BUCKET (defaults to journal-images)

3) Create Supabase resources
   - Storage bucket:
     Name: journal-images (or your custom name). You can make it public OR private.
   - SQL table:
     create extension if not exists pgcrypto;
     create table if not exists public.journal_entries (
       id uuid primary key default gen_random_uuid(),
       created_at timestamptz not null default now(),
       user_id uuid references auth.users(id) on delete cascade,
       title text not null default '',
       content text not null default '',
       -- image_url stores either a public URL (if public bucket) or a storage path (e.g. 171234-file.jpg) if private bucket
       image_url text
     );
     alter table public.journal_entries enable row level security;
     -- RLS policies (per-user isolation)
     create policy "journal_insert_own" on public.journal_entries
       for insert to authenticated
       with check (auth.uid() = user_id);
     create policy "journal_select_own" on public.journal_entries
       for select to authenticated
       using (auth.uid() = user_id);

     -- If you want to test without auth, you can also add a permissive policy for anon (not recommended for production):
     -- create policy "journal_select_anon" on public.journal_entries for select to anon using (true);

   - Storage policies:
     If PUBLIC bucket:
       - Make bucket public in dashboard; uploads can be allowed to authenticated with write policy.
     If PRIVATE bucket:
       - Keep bucket private. Allow authenticated users to upload to the bucket:
         -- Example: create policy "storage_upload_authenticated" on storage.objects
         -- for insert to authenticated with check ( bucket_id = 'journal-images' );
       - The app will store the object path in DB and request a short-lived signed URL from the server route when rendering.

4) Run the app
   npm run dev
   Open http://localhost:3000

Notes
- Client code uploads the image to Supabase Storage then inserts the row.
- Bucket name comes from NEXT_PUBLIC_SUPABASE_BUCKET.
- Private bucket support: set NEXT_PUBLIC_PRIVATE_BUCKET=true and provide SUPABASE_SERVICE_ROLE_KEY. The client stores the storage path and the API at /api/storage/signed-url signs and returns a temporary URL for display.
- Auth: Email magic link sign-in is provided (configure your Site URL and SMTP in Supabase). Entries are scoped per user via RLS.

Tags support
- Schema change (run in SQL editor):
  alter table public.journal_entries add column if not exists tags text[] default '{}'::text[];
- Insert/update: UI accepts comma-separated tags; stored as lowercased text[]
- Filtering: Home page has a tag filter input (comma-separated) that matches entries containing all listed tags.

Per-entry view
- View in a modal: Clicking a card title opens a modal with image, tags, and content.
- Edit page: /entries/[id]/edit provides editing with optional image replace/remove.

RLS for updates (required for editing)
- create policy "journal_update_own" on public.journal_entries
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

Delete entries
- UI shows a Delete button per entry when signed in.
- API: `/api/entries/delete` verifies ownership via RLS using your JWT, deletes the DB row, and best-effort removes the image from Storage using the service role key.
- Add RLS delete policy:
  create policy "journal_delete_own" on public.journal_entries
    for delete to authenticated using (auth.uid() = user_id);
# journal
