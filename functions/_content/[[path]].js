// Cloudflare Pages serves static files without byte ranges, and Safari (iPhone, iPad, Mac)
// will not play a video unless the server answers Range requests with 206.
// This answers ranges for guide media; every other request goes straight to the static file.
const MEDIA = /\.(mp4|m4v|mov|webm|mp3|m4a|wav|ogg)$/i;

export async function onRequestGet({ request, env, next }) {
  const range = request.headers.get("range");
  if (!range || !MEDIA.test(new URL(request.url).pathname)) return next();
  const full = await env.ASSETS.fetch(new Request(request.url, { method: "GET" }));
  if (!full.ok) return full;
  const buf = await full.arrayBuffer();
  const size = buf.byteLength;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m || (m[1] === "" && m[2] === "")) return new Response(buf, { status: 200, headers: full.headers });
  let start = m[1] === "" ? size - Number(m[2]) : Number(m[1]);
  const end = m[1] === "" || m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start < 0) start = 0;
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  const h = new Headers(full.headers);
  h.set("Content-Range", `bytes ${start}-${end}/${size}`);
  h.set("Content-Length", String(end - start + 1));
  h.set("Accept-Ranges", "bytes");
  return new Response(buf.slice(start, end + 1), { status: 206, headers: h });
}
