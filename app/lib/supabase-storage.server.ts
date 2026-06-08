const DEFAULT_BUCKET = "player-cards";
const MAX_CARD_IMAGE_SIZE = 5 * 1024 * 1024;

function getSupabaseConfig() {
  const url =
    process.env.SUPABASE_URL?.replace(/\/$/, "") ?? getSupabaseUrlFromDbUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_PLAYER_CARDS_BUCKET || DEFAULT_BUCKET;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return { url, serviceRoleKey, bucket };
}

function getSupabaseUrlFromDbUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  const projectRef = databaseUrl?.match(/postgres\.([a-z0-9]+):/i)?.[1];

  return projectRef ? `https://${projectRef}.supabase.co` : undefined;
}

function getExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();

  if (fromName && /^[a-z0-9]+$/.test(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }

  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";

  return "jpg";
}

export function canUploadPlayerCardImages() {
  return Boolean(getSupabaseConfig());
}

export async function uploadPlayerCardImage({
  gameId,
  userId,
  file,
}: {
  gameId: string;
  userId: string;
  file: File;
}) {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error(
      "Supabase Storage не налаштований. Додай SUPABASE_URL і SUPABASE_SERVICE_ROLE_KEY в .env."
    );
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Файл має бути зображенням.");
  }

  if (file.size > MAX_CARD_IMAGE_SIZE) {
    throw new Error("Фото завелике. Максимум 5 MB.");
  }

  const extension = getExtension(file);
  const path = `${gameId}/${userId}-${Date.now()}.${extension}`;
  const uploadUrl = `${config.url}/storage/v1/object/${config.bucket}/${path}`;

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      apikey: config.serviceRoleKey,
      "Content-Type": file.type || "application/octet-stream",
      "Cache-Control": "31536000",
      "x-upsert": "true",
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    const message = await uploadResponse.text();
    throw new Error(
      message || "Не вдалось завантажити фото в Supabase Storage."
    );
  }

  return `${config.url}/storage/v1/object/public/${config.bucket}/${path}`;
}
