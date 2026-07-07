export function assetPath(filename) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base}${filename}`.replace(/\/+/g, "/");
}
