import React, { useCallback, useEffect, useMemo, useState } from "react"
import { SafeAreaView, View, Text, TextInput, Button, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator, Alert } from "react-native"
import { StatusBar } from "expo-status-bar"
import * as ImagePicker from "expo-image-picker"
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

const JOURNAL_BUCKET = process.env.EXPO_PUBLIC_JOURNAL_BUCKET || "journal"
const IS_PRIVATE_BUCKET = (process.env.EXPO_PUBLIC_JOURNAL_PRIVATE || "false").toLowerCase() === "true"

const supabase = createClient(SUPABASE_URL || "", SUPABASE_ANON_KEY || "")

export default function App() {
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState("")
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let mounted = true
    const init = async () => {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return
      setUser(data.user)
    }
    init()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>Journal</Text>
      {!user ? (
        <Auth email={email} setEmail={setEmail} sending={sending} setSending={setSending} />
      ) : (
        <Journal userId={user.id} />
      )}
    </SafeAreaView>
  )
}

function Auth({ email, setEmail, sending, setSending }) {
  const sendMagicLink = async () => {
    if (!email) return
    try {
      setSending(true)
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: "journal://" } })
      if (error) throw error
      Alert.alert("Check your email", "Open the link on this device to sign in.")
    } catch (e) {
      Alert.alert("Failed to send link", e?.message || "Unknown error")
    } finally {
      setSending(false)
    }
  }

  return (
    <View style={{ gap: 12, width: "100%" }}>
      <Text style={styles.muted}>Sign in to save and view your entries</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        inputMode="email"
        placeholder="you@example.com"
        style={styles.input}
      />
      <Button title={sending ? "Sending..." : "Email sign-in"} onPress={sendMagicLink} disabled={sending || !email} />
    </View>
  )
}

function Journal({ userId }) {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [tagsInput, setTagsInput] = useState("")
  const [image, setImage] = useState(null)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const pageSize = 12

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== "granted") {
      Alert.alert("Permission required", "We need access to your photos to upload images.")
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
    if (!result.canceled) {
      const asset = result.assets[0]
      setImage(asset)
    }
  }

  const load = useCallback(async (reset = false) => {
    if (reset) {
      setLoading(true)
      setOffset(0)
    } else if (loadingMore || !hasMore) return

    const from = reset ? 0 : offset
    const to = from + pageSize - 1
    let q = supabase
      .from("journal_entries")
      .select("id, created_at, title, content, image_url, tags")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to)

    const { data, error } = await q
    if (error) {
      Alert.alert("Failed to load", error.message)
      setLoading(false)
      setLoadingMore(false)
      return
    }
    const list = data || []
    if (reset) {
      setEntries(list)
    } else {
      setEntries((prev) => [...prev, ...list])
    }
    setHasMore(list.length === pageSize)
    setOffset(from + list.length)
    setLoading(false)
    setLoadingMore(false)
  }, [userId, offset, loadingMore, hasMore])

  useEffect(() => {
    load(true)
  }, [userId])

  const onSave = useCallback(async () => {
    if (!title.trim() && !content.trim() && !image) return
    setSaving(true)
    try {
      let publicUrl = null
      if (image) {
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
        const res = await fetch(image.uri)
        const blob = await res.blob()
        const { error: uploadErr } = await supabase.storage.from(JOURNAL_BUCKET).upload(fileName, blob, {
          cacheControl: "3600",
          upsert: false,
          contentType: blob.type || "image/jpeg",
        })
        if (uploadErr) throw uploadErr
        if (IS_PRIVATE_BUCKET) {
          publicUrl = fileName
        } else {
          const { data } = supabase.storage.from(JOURNAL_BUCKET).getPublicUrl(fileName)
          publicUrl = data.publicUrl
        }
      }

      const parsedTags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => t.toLowerCase())
      const uniqueTags = Array.from(new Set(parsedTags))

      const row = {
        title: title.trim(),
        content: content.trim(),
        image_url: publicUrl,
        tags: uniqueTags.length ? uniqueTags : null,
        user_id: userId,
      }
      const { error: insertErr } = await supabase.from("journal_entries").insert(row)
      if (insertErr) throw insertErr
      setTitle("")
      setContent("")
      setTagsInput("")
      setImage(null)
      Alert.alert("Saved", "Your entry was saved")
      load(true)
    } catch (e) {
      Alert.alert("Failed to save", e?.message || "Unknown error")
    } finally {
      setSaving(false)
    }
  }, [title, content, image, tagsInput, userId])

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.image} />
      ) : null}
      <View style={{ padding: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title || "Untitled"}</Text>
          <Text style={styles.mutedSmall}>{new Date(item.created_at).toLocaleDateString()}</Text>
        </View>
        {!!item.content && (
          <Text style={styles.muted} numberOfLines={3}>{item.content}</Text>
        )}
        {item.tags && item.tags.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {item.tags.map((t) => (
              <Text key={t} style={styles.tag}>{t}</Text>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  )

  return (
    <View style={{ flex: 1, width: "100%", gap: 16 }}>
      <View style={styles.cardForm}>
        <Text style={styles.sectionTitle}>New Entry</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Title" />
        <TextInput
          style={[styles.input, { height: 100 }]}
          value={content}
          onChangeText={setContent}
          placeholder="Write your thoughts..."
          multiline
        />
        <TextInput style={styles.input} value={tagsInput} onChangeText={setTagsInput} placeholder="Tags (comma-separated)" />
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Button title={image ? "Change image" : "Pick image"} onPress={pickImage} />
          {image ? <Text style={styles.mutedSmall}>{image.fileName || "selected"}</Text> : null}
        </View>
        <Button disabled={saving} title={saving ? "Saving..." : "Save Entry"} onPress={onSave} />
      </View>

      <Text style={styles.sectionTitle}>Recent entries</Text>

      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          onEndReached={() => {
            if (!loadingMore && hasMore) {
              setLoadingMore(true)
              load(false)
            }
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 12 }} /> : null}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    gap: 16,
    padding: 16,
    backgroundColor: "#f7f4ff",
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    backgroundImage: "linear-gradient(90deg, #7c3aed, #f472b6, #f59e0b)",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#6d28d9",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "white",
  },
  muted: {
    color: "#6b7280",
  },
  mutedSmall: {
    color: "#6b7280",
    fontSize: 12,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "white",
    overflow: "hidden",
    marginBottom: 12,
  },
  cardForm: {
    width: "100%",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "white",
    padding: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
    marginRight: 12,
  },
  image: {
    width: "100%",
    height: 180,
  },
  tag: {
    fontSize: 10,
    textTransform: "uppercase",
    color: "#0f766e",
    backgroundColor: "#ccfbf1",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
})

