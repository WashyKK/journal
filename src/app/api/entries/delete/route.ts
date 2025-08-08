import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || ""
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY
    const bucket = process.env.NEXT_PUBLIC_SUPABASE_BUCKET
    if (!url || !anon || !bucket) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 })
    }

    // Client with the user's JWT for RLS enforcement
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    // 1) Verify the entry exists and belongs to the user (RLS enforced)
    const { data: found, error: findErr } = await userClient
      .from("journal_entries")
      .select("id, image_url")
      .eq("id", id)
      .maybeSingle()

    if (findErr) return NextResponse.json({ error: findErr.message }, { status: 400 })
    if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // 2) Delete the row (RLS enforced)
    const { error: delErr } = await userClient.from("journal_entries").delete().eq("id", id)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 })

    // 3) Best-effort storage cleanup using service role (if configured)
    if (service && found.image_url) {
      try {
        const server = createClient(url, service)
        const objectPath = resolveObjectPath(found.image_url, bucket)
        if (objectPath) {
          await server.storage.from(bucket).remove([objectPath])
        }
      } catch {
        // ignore cleanup errors
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 })
  }
}

function resolveObjectPath(imageUrlOrPath: string, bucket: string) {
  // If it's already a path (no http), return as-is
  if (!/^https?:\/\//i.test(imageUrlOrPath)) return imageUrlOrPath
  try {
    const u = new URL(imageUrlOrPath)
    // Expected public pattern: /storage/v1/object/public/<bucket>/<path>
    const parts = u.pathname.split("/")
    const idx = parts.findIndex((p) => p === "public")
    if (idx >= 0 && parts[idx + 1] === bucket) {
      const rest = parts.slice(idx + 2).join("/")
      return decodeURIComponent(rest)
    }
    // fallback: last path segment
    return decodeURIComponent(parts.pop() || "")
  } catch {
    return null
  }
}

