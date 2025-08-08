"use client"
import { useEffect, useState } from "react"
import JournalForm from "@/components/journal-form"
import RecentEntries from "@/components/recent-entries"
import AuthBar from "@/components/auth-bar"
import { supabase } from "@/lib/supabase"
import { useDebounce } from "@/hooks/use-debounce"

export default function Page() {
  const [refreshTick, setRefreshTick] = useState(0)
  const [search, setSearch] = useState("")
  const [imagesOnly, setImagesOnly] = useState(false)
  const [userId, setUserId] = useState<string | undefined>(undefined)
  const debouncedSearch = useDebounce(search, 350)

  useEffect(() => {
    let mounted = true
    const init = async () => {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return
      setUserId(data.user?.id)
    }
    init()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id)
      setRefreshTick((t) => t + 1)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])
  return (
    <main className="min-h-dvh w-full py-10">
      <div className="container">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Journal</h1>
        <AuthBar onAuthChange={() => setRefreshTick((t) => t + 1)} />
        <JournalForm onSaved={() => setRefreshTick((t) => t + 1)} userId={userId} />

        <section className="mt-10 mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="text"
              placeholder="Search title or content..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-2/3 rounded-md border px-3 py-2 text-sm"
            />
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={imagesOnly}
                onChange={(e) => setImagesOnly(e.target.checked)}
                className="h-4 w-4"
              />
              Images only
            </label>
          </div>
        </section>

        {userId ? (
          <RecentEntries
            refreshKey={refreshTick}
            query={debouncedSearch}
            imagesOnly={imagesOnly}
            userId={userId}
          />
        ) : (
          <p className="mt-10 text-sm text-muted-foreground">Sign in to view your entries.</p>
        )}
      </div>
    </main>
  )
}
