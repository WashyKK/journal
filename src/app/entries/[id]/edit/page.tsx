"use client"
import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase, IS_PRIVATE_BUCKET, JOURNAL_BUCKET } from "@/lib/supabase"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

type Entry = {
  id: string
  created_at: string
  title: string
  content: string
  image_url: string | null
  tags: string[] | null
}

export default function EditEntryPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [tagsInput, setTagsInput] = useState("")
  const [existingImage, setExistingImage] = useState<string | null>(null)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (!id) return
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from("journal_entries")
        .select("id, created_at, title, content, image_url, tags")
        .eq("id", id)
        .maybeSingle()
      if (error) {
        setError(error.message)
      } else if (data) {
        setTitle(data.title || "")
        setContent(data.content || "")
        setTagsInput((data.tags || []).join(", "))
        setExistingImage(data.image_url)
        if (IS_PRIVATE_BUCKET && data.image_url && !/^https?:\/\//i.test(data.image_url)) {
          try {
            const res = await fetch("/api/storage/signed-url", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path: data.image_url, bucket: JOURNAL_BUCKET, expiresIn: 3600 }),
            })
            const j = await res.json()
            if (res.ok && j.url) setSignedUrl(j.url)
          } catch (_) {}
        }
      }
      setLoading(false)
    }
    load()
  }, [id])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    setFile(f ?? null)
    if (f) setRemoveImage(false)
  }

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])

  const handleSave = async () => {
    if (!id) return
    setSaving(true)
    try {
      let newImage: string | null | undefined = undefined
      if (file) {
        const ext = file.name.split(".").pop() || "bin"
        const objectName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from(JOURNAL_BUCKET)
          .upload(objectName, file, { cacheControl: "3600", upsert: false, contentType: file.type || undefined })
        if (uploadErr) throw uploadErr
        if (IS_PRIVATE_BUCKET) {
          newImage = objectName
        } else {
          const { data } = supabase.storage.from(JOURNAL_BUCKET).getPublicUrl(objectName)
          newImage = data.publicUrl
        }
      } else if (removeImage) {
        newImage = null
      }

      const parsedTags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => t.toLowerCase())
      const uniqueTags = Array.from(new Set(parsedTags))

      const update: any = {
        title: title.trim(),
        content: content.trim(),
        tags: uniqueTags.length ? uniqueTags : null,
      }
      if (newImage !== undefined) update.image_url = newImage

      const { error: upErr } = await supabase.from("journal_entries").update(update).eq("id", id)
      if (upErr) throw upErr
      alert("Updated entry")
      router.back()
    } catch (e: any) {
      alert(e?.message || "Failed to update")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-dvh w-full py-10">
      <div className="container max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Edit Entry</h1>
          <Button variant="outline" onClick={() => router.back()}>Back</Button>
        </div>

        {loading ? (
          <div className="h-48 w-full animate-pulse rounded-md bg-muted" />
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="content">Content</Label>
              <Textarea id="content" rows={8} value={content} onChange={(e) => setContent(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tags">Tags</Label>
              <Input id="tags" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="Comma-separated" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="image">Image</Label>
              {(existingImage && !file && !removeImage) ? (
                <img src={signedUrl || existingImage} alt="current" className="h-40 w-auto rounded-md border object-contain" />
              ) : null}
              {file ? (
                <img src={previewUrl!} alt="preview" className="h-40 w-auto rounded-md border object-contain" />
              ) : null}
              <Input id="image" type="file" accept="image/*" onChange={onFileChange} />
              {existingImage && !file ? (
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={removeImage} onChange={(e) => setRemoveImage(e.target.checked)} />
                  Remove image
                </label>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
              <Button variant="outline" type="button" onClick={() => router.back()} disabled={saving}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

