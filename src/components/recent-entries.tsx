"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { IS_PRIVATE_BUCKET, JOURNAL_BUCKET, supabase } from "@/lib/supabase"
import { Trash2 } from "lucide-react"

type Entry = {
  id: string
  created_at: string
  title: string
  content: string
  image_url: string | null
}

export default function RecentEntries({
  refreshKey = 0,
  pageSize = 12,
  query = "",
  imagesOnly = false,
  userId,
}: {
  refreshKey?: number
  pageSize?: number
  query?: string
  imagesOnly?: boolean
  userId?: string
}) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const offsetRef = useRef(0)
  const [urlMap, setUrlMap] = useState<Record<string, string>>({})
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const baseQuery = () => {
    let q = supabase
      .from("journal_entries")
      .select("id, created_at, title, content, image_url", { count: "exact" })
      .order("created_at", { ascending: false })

    if (query.trim()) {
      // Simple ilike match on title or content
      // Supabase JS needs or() as a filter
      q = q.or(
        `title.ilike.%${query.replace(/%/g, "").replace(/\s+/g, "%")}%,content.ilike.%${query
          .replace(/%/g, "")
          .replace(/\s+/g, "%")}%`
      )
    }
    if (imagesOnly) {
      q = q.not("image_url", "is", null)
    }
    if (userId) {
      q = q.eq("user_id", userId)
    }
    return q
  }

  const loadInitial = async () => {
    setLoading(true)
    setError(null)
    offsetRef.current = 0
    const from = 0
    const to = Math.max(pageSize - 1, 0)
    const { data, error } = await baseQuery().range(from, to)
    if (error) {
      setError(error.message)
      setEntries([])
      setHasMore(false)
    } else {
      const list = data ?? []
      setEntries(list)
      if (IS_PRIVATE_BUCKET) await hydrateSignedUrls(list)
      setHasMore((data?.length ?? 0) === pageSize)
      offsetRef.current = (data?.length ?? 0)
    }
    setLoading(false)
  }

  const loadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const from = offsetRef.current
    const to = from + pageSize - 1
    const { data, error } = await baseQuery().range(from, to)
    if (error) {
      setError(error.message)
      setHasMore(false)
    } else {
      const batch = data ?? []
      setEntries((prev) => [...prev, ...batch])
      if (IS_PRIVATE_BUCKET) await hydrateSignedUrls(batch)
      setHasMore(batch.length === pageSize)
      offsetRef.current += batch.length
    }
    setLoadingMore(false)
  }

  const hydrateSignedUrls = async (items: Entry[]) => {
    const updates: Record<string, string> = {}
    for (const e of items) {
      const val = e.image_url
      if (!val) continue
      const isHttp = /^https?:\/\//i.test(val)
      if (isHttp) continue
      // treat as storage path
      try {
        const res = await fetch("/api/storage/signed-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: val, bucket: JOURNAL_BUCKET, expiresIn: 3600 }),
        })
        const j = await res.json()
        if (res.ok && j.url) {
          updates[e.id] = j.url
        }
      } catch (_) {
        // ignore
      }
    }
    if (Object.keys(updates).length) {
      setUrlMap((prev) => ({ ...prev, ...updates }))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this entry?")) return
    try {
      setDeletingId(id)
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      const res = await fetch("/api/entries/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Delete failed (${res.status})`)
      }
      setEntries((prev) => prev.filter((e) => e.id !== id))
      setUrlMap((prev) => {
        const { [id]: _, ...rest } = prev
        return rest
      })
    } catch (e: any) {
      alert(e?.message || "Failed to delete")
    } finally {
      setDeletingId(null)
    }
  }

  useEffect(() => {
    loadInitial()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, pageSize, query, imagesOnly])

  const grid = useMemo(() => {
    if (loading) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <div className="aspect-video w-full bg-muted rounded-t-lg" />
              <CardContent className="space-y-2">
                <div className="h-4 bg-muted rounded w-2/3 mt-4" />
                <div className="h-3 bg-muted rounded w-full" />
                <div className="h-3 bg-muted rounded w-5/6" />
              </CardContent>
            </Card>
          ))}
        </div>
      )
    }
    if (error) {
      return <p className="text-sm text-destructive">Failed to load: {error}</p>
    }
    if (!entries.length) {
      return <p className="text-sm text-muted-foreground">No entries yet.</p>
    }
    return (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {entries.map((e) => (
            <Card key={e.id}>
              {e.image_url ? (
                <img
                  src={urlMap[e.id] || e.image_url}
                  alt={e.title || "image"}
                  className="aspect-video w-full object-cover rounded-t-lg"
                  loading="lazy"
                />
              ) : (
                <div className="aspect-video w-full bg-muted rounded-t-lg" />
              )}
              <CardContent className="pt-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold truncate">{e.title || "Untitled"}</h3>
                  <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground overflow-hidden text-ellipsis">
                  {e.content}
                </p>
                {userId && (
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => handleDelete(e.id)}
                      disabled={deletingId === e.id}
                      className="inline-flex items-center gap-1 text-xs text-destructive hover:opacity-80"
                    >
                      <Trash2 size={14} />
                      {deletingId === e.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="mt-4 flex justify-center">
          {hasMore && (
            <button
              onClick={loadMore}
              className="px-4 py-2 rounded-md border text-sm hover:bg-accent"
              disabled={loadingMore}
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          )}
        </div>
      </>
    )
  }, [loading, error, entries, hasMore, loadingMore])

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-xl font-semibold">Recent entries</h2>
      {grid}
    </section>
  )
}
