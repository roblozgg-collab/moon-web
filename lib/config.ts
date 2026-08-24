export const APP_NAME = "Moon";
export const APP_DESCRIPTION = `${APP_NAME} — чаты, серверы и голосовое общение без VPN`;
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function withBasePath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${normalized}`;
}
