import { access, writeFile } from "node:fs/promises";
import { constants } from "node:fs";

try {
  await access("out/index.html", constants.R_OK);
  const rawBase = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const base = rawBase ? `/${rawBase.replace(/^\/+|\/+$/g, "")}` : "";
  const root = `${base}/`;
  const fallback = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Moon</title></head>
<body style="margin:0;background:#111214;color:#f2f3f5;font-family:system-ui,sans-serif">
<script>
(function(){
  var pending = location.pathname + location.search + location.hash;
  try { sessionStorage.setItem("moon:pending-route:v2", pending); } catch (e) {}
  location.replace(${JSON.stringify(root)});
})();
</script>
</body></html>`;
  await writeFile("out/404.html", fallback, "utf8");
  console.log(`Moon Pages fallback: dynamic routes redirect through ${root}`);
} catch (error) {
  console.error("Moon Pages fallback failed:", error);
  process.exitCode = 1;
}
