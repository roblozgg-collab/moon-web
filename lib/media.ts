"use client";

import { getSupabaseBrowserClient, isSupabaseConfigured } from "./supabase/client";

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "file";
}

async function uploadSupabaseImage(file: File, purpose: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) throw new Error("You must be logged in to upload media.");

  const ext = (file.name.split(".").pop() || (file.type === "image/gif" ? "gif" : "bin")).toLowerCase();
  const base = safeName(file.name.replace(/\.[^.]+$/, ""));
  const path = `${user.id}/${safeName(purpose)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${base}.${safeName(ext)}`;
  const { error } = await supabase.storage.from("moon-media").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("moon-media").getPublicUrl(path);
  if (!data.publicUrl) throw new Error("Could not create a public media URL.");
  return data.publicUrl;
}

export async function uploadLocalImage(file: File, purpose: string) {
  if (isSupabaseConfigured()) return uploadSupabaseImage(file, purpose);

  const form = new FormData();
  form.append("file", file);
  form.append("purpose", purpose);
  const response = await fetch("/api/local-media", { method: "POST", body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.url) throw new Error(String(data?.error ?? "Could not upload image."));
  return String(data.url);
}

export function isInlineImage(value?: string) {
  return Boolean(value && /^data:image\//i.test(value));
}

export async function inlineImageToUploadedUrl(value: string, purpose: string) {
  const response = await fetch(value);
  const blob = await response.blob();
  const ext = blob.type === "image/gif" ? "gif" : blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  return uploadLocalImage(new File([blob], `legacy.${ext}`, { type: blob.type || `image/${ext}` }), purpose);
}
