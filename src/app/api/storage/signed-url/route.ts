import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: Request) {
  try {
    const { path, expiresIn = 3600, bucket } = await req.json()
    if (!path) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const bkt = bucket || process.env.NEXT_PUBLIC_SUPABASE_BUCKET
    if (!url || !serviceKey || !bkt) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 })
    }

    const server = createClient(url, serviceKey)
    const { data, error } = await server.storage
      .from(bkt)
      .createSignedUrl(path, expiresIn)

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Failed to sign" }, { status: 400 })
    }

    return NextResponse.json({ url: data.signedUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 })
  }
}

