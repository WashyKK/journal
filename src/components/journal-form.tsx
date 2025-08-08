"use client"
import { useCallback, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase, JOURNAL_BUCKET, IS_PRIVATE_BUCKET } from "@/lib/supabase"

type JournalEntry = {
  id?: string
  title: string
  content: string
  image_url?: string | null
  tags?: string[] | null
}

export default function JournalForm({ onSaved, userId }: { onSaved?: () => void; userId?: string }) {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [tagsInput, setTagsInput] = useState("")

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    setFile(f ?? null)
  }, [])

  const reset = () => {
    setTitle("")
    setContent("")
    setFile(null)
    setTagsInput("")
  }

  const handleSubmit = useCallback(async () => {
    if (!title.trim() && !content.trim() && !file) return
    setSubmitting(true)
    try {
      let publicUrl: string | null = null

      if (file) {
        const ext = file.name.split(".").pop() || "bin"
        const objectName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from(JOURNAL_BUCKET)
          .upload(objectName, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || undefined,
          })

        if (uploadErr) throw uploadErr

        if (IS_PRIVATE_BUCKET) {
          // Store the storage path when using private buckets
          publicUrl = objectName
        } else {
          const { data } = supabase.storage.from(JOURNAL_BUCKET).getPublicUrl(objectName)
          publicUrl = data.publicUrl
        }
      }

      const parsedTags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => t.toLowerCase())

      const uniqueTags = Array.from(new Set(parsedTags))

      const payload: JournalEntry = {
        title: title.trim(),
        content: content.trim(),
        image_url: publicUrl,
        tags: uniqueTags.length ? uniqueTags : null,
      }

      const row: any = { ...payload }
      if (userId) row.user_id = userId
      const { error: insertErr } = await supabase.from("journal_entries").insert(row)
      if (insertErr) throw insertErr

      reset()
      onSaved?.()
      alert("Saved journal entry")
    } catch (e: any) {
      console.error(e)
      alert(`Failed to save: ${e?.message || "Unknown error"}`)
    } finally {
      setSubmitting(false)
    }
  }, [title, content, file])

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>New Journal Entry</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" placeholder="A day to remember" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="content">Content</Label>
          <Textarea id="content" rows={6} placeholder="Write your thoughts..." value={content} onChange={(e) => setContent(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tags">Tags</Label>
          <Input
            id="tags"
            placeholder="Comma-separated e.g. travel, mood, work"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
          />
          {tagsInput.trim() && (
            <div className="text-xs text-muted-foreground">Parsed: {tagsInput.split(",").map((t) => t.trim()).filter(Boolean).join(", ")}</div>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="image">Image</Label>
          <Input id="image" type="file" accept="image/*" onChange={onFileChange} />
          {previewUrl && (
            <img src={previewUrl} alt="preview" className="mt-2 h-40 w-auto rounded-md border object-cover" />
          )}
        </div>
        <div className="flex gap-2">
          <Button disabled={submitting || !userId} onClick={handleSubmit}>
            {submitting ? "Saving..." : userId ? "Save Entry" : "Sign in to save"}
          </Button>
          <Button variant="outline" type="button" onClick={reset} disabled={submitting}>
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
