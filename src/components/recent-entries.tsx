"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { IS_PRIVATE_BUCKET, JOURNAL_BUCKET, supabase } from "@/lib/supabase"
import { Trash2 } from "lucide-react"
import { Modal } from "@/components/ui/modal"

type Entry = {
  id: string
  created_at: string
  title: string
  content: string
  image_url: string | null
  tags: string[] | null
}

export default function RecentEntries({
  refreshKey = 0,
  pageSize = 12,
  query = "",
  imagesOnly = false,
  userId,
  tagsFilter = [],
}: {
  refreshKey?: number
  pageSize?: number
  query?: string
  imagesOnly?: boolean
  userId?: string
  tagsFilter?: string[]
}) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const offsetRef = useRef(0)
  const [urlMap, setUrlMap] = useState<Record<string, string>>({})
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [viewId, setViewId] = useState<string | null>(null)
  const viewed = entries.find((e) => e.id === viewId) || null
  const viewedUrl = (viewed && (urlMap[viewed.id] || viewed.image_url)) || null

  const baseQuery = () => {
    let q = supabase
      .from("journal_entries")
      .select("id, created_at, title, content, image_url, tags", { count: "exact" })
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
    if (tagsFilter && tagsFilter.length) {
      q = q.contains("tags", tagsFilter.map((t) => t.toLowerCase()))
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
                  <button onClick={() => setViewId(e.id)} className="font-semibold truncate hover:underline text-left">{e.title || "Untitled"}</button>
                  <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground overflow-hidden text-ellipsis">
                  {e.content}
                </p>
                {e.tags && e.tags.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {e.tags.map((t) => (
                      <span key={t} className="inline-flex rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}
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
        <Modal
          open={!!viewId}
          onOpenChange={(o) => !o && setViewId(null)}
          title={viewed ? viewed.title || "Untitled" : "Entry"}
        >
          {!viewed ? (
            <div className="h-48 w-full animate-pulse rounded-md bg-muted" />
          ) : (
            <div className="space-y-4">
              {viewed.image_url ? (
                <img
                  src={viewedUrl || undefined}
                  alt={viewed.title || "image"}
                  className="w-full max-h-[60vh] rounded-md object-contain"
                />
              ) : null}
              {viewed.tags && viewed.tags.length ? (
                <div className="flex flex-wrap gap-2">
                  {viewed.tags.map((t) => (
                    <span key={t} className="inline-flex rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="whitespace-pre-wrap text-sm leading-6">{viewed.content}</div>
              <div className="flex justify-end gap-2">
                {userId && (
                  <a
                    className="inline-flex rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
                    href={`/entries/${viewed.id}/edit`}
                  >
                    Edit
                  </a>
                )}
                <button className="inline-flex rounded-md border px-3 py-1.5 text-sm" onClick={() => setViewId(null)}>
                  Close
                </button>
              </div>
            </div>
          )}
        </Modal>
      </>
    )
  }, [loading, error, entries, hasMore, loadingMore, viewId, urlMap, userId, deletingId])

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-xl font-semibold">Recent entries</h2>
      {grid}
    </section>
  )
}
