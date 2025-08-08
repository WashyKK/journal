"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function AuthBar({ onAuthChange }: { onAuthChange?: () => void }) {
  const [email, setEmail] = useState("")
  const [sending, setSending] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const init = async () => {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return
      setUserEmail(data.user?.email ?? null)
    }
    init()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserEmail(session?.user?.email ?? null)
      onAuthChange?.()
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [onAuthChange])

  const sendMagicLink = async () => {
    if (!email) return
    setSending(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } })
      if (error) throw error
      alert("Check your email for the sign-in link.")
    } catch (e: any) {
      alert(e?.message || "Failed to send link")
    } finally {
      setSending(false)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-muted-foreground">
        {userEmail ? (
          <span>Signed in as {userEmail}</span>
        ) : (
          <span>Not signed in</span>
        )}
      </div>
      {userEmail ? (
        <Button variant="outline" onClick={signOut}>Sign out</Button>
      ) : (
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-64"
          />
          <Button onClick={sendMagicLink} disabled={sending || !email}>
            {sending ? "Sending..." : "Email sign-in"}
          </Button>
        </div>
      )}
    </div>
  )
}

