#!/usr/bin/env node
/**
 * Builds one day's batch from a content file, in the PaceShark post look (black #0D0D0D, green #3DFF6E, Poppins-style bold
 * type, faint grid, shark logo top left, www.paceshark.com bottom left).
 *
 *   node tools/build.js queue/2026-11-18/content.json
 *
 * Writes next to the content file: post1.mp4 + post1.txt (reel, 06:30), post2.mp4 + post2.txt (reel, 12:30),
 * post3-01.png ... + post3.txt (carousel, 18:30) and plan.json (reels "manual", carousel "auto").
 * Needs Playwright (chromium) and ffmpeg. Reels are silent on purpose: Ruan adds a trending sound in Instagram.
 *
 * content.json:
 * {
 *   "reel1":    { "frames": [ { "s": "SMALL LINE", "b": "BIG WHITE WORDS", "h": "GREEN HIGHLIGHT", "u": "optional line under" } ], "caption": "..." },
 *   "reel2":    { "frames": [ ... ], "caption": "..." },
 *   "carousel": { "slides": [
 *       { "kind": "cover", "small": "...", "big": "...", "hl": "...", "sub": "..." },
 *       { "n": 1, "tag": "Topic", "title": "SHORT TITLE", "head": "One bold line", "body": "One or two sentences." },
 *       { "kind": "cta", "small": "...", "big": "...", "hl": "...", "sub": "..." } ], "caption": "..." }
 * }
 * 4-6 frames per reel (about 3 s each), 5-8 carousel slides. Keep each frame/slide to one idea.
 *
 * PHOTOS (18 Nov 2026): add "photo": "2-4 search words" to reel1, reel2 and/or carousel. The first reel frame and the
 * carousel cover then get a faded Pexels photo behind the text. Needs PEXELS_API_KEY in the environment (the GitHub
 * Action .github/workflows/build-posts.yml has it as a repo secret and rebuilds a day when its content.json is pushed).
 * Without the key the posts build exactly as before. A downloaded photo is kept as photo-<post>.jpg next to the content
 * file, so rebuilding a day reuses it; delete that file to get a different photo. Photos already used on another day
 * (tools/used-photos.json) are skipped, so the same picture never comes back.
 */
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(path.join(execFileSync("npm", ["root", "-g"]).toString().trim(), "playwright"))); }

const file = process.argv[2];
if (!file) { console.error("usage: node tools/build.js queue/YYYY-MM-DD/content.json"); process.exit(1); }
const dir = path.dirname(path.resolve(file));
const c = JSON.parse(fs.readFileSync(file, "utf8"));
for (const k of ["reel1", "reel2", "carousel"]) if (!c[k]) { console.error(`content.json needs "${k}"`); process.exit(1); }
const logo = fs.readFileSync(path.join(__dirname, "logo.png")).toString("base64");
const esc = t => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const base = `
*{box-sizing:border-box;margin:0}
body{background:#0d0d0d;color:#fff;font-family:'Poppins','Montserrat','Helvetica Neue',Arial,sans-serif;position:relative;overflow:hidden;
 background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:54px 54px}
body:after{content:"";position:absolute;right:-200px;bottom:-250px;width:800px;height:800px;background:radial-gradient(circle,rgba(61,255,110,.10),transparent 65%)}
.brand{position:absolute;left:56px;top:52px;display:flex;align-items:center;gap:18px}
.brand img{width:96px;height:96px;object-fit:cover;mix-blend-mode:screen;margin:-18px}
.brand span{font-weight:800;font-size:44px;letter-spacing:1px}.brand b{color:#3DFF6E}
.url{position:absolute;left:56px;bottom:44px;font-weight:600;font-size:26px}
.hint{position:absolute;right:56px;bottom:44px;font-size:24px;color:#8a8a8a}
.tag{position:absolute;left:90px;top:150px;font-size:26px;color:#9a9a9a}
.main{position:absolute;left:90px;right:90px;top:260px}
.num{color:#3DFF6E;font-weight:800;font-size:150px;line-height:1}
h1{font-weight:800;font-size:96px;line-height:1.02;text-transform:uppercase;letter-spacing:-1px;color:#3DFF6E;margin-top:10px}
h2{font-weight:700;font-size:44px;line-height:1.25;margin-top:44px}
p{font-size:36px;line-height:1.5;color:#c9c9c9;margin-top:28px}
.cover{position:absolute;left:70px;right:70px;text-align:center}
.cover .s{font-weight:700;font-size:34px;letter-spacing:3px}
.cover .b{font-weight:800;font-size:84px;line-height:1.08;text-transform:uppercase;margin-top:22px;letter-spacing:-1px}
.cover .h{display:inline-block;background:#3DFF6E;color:#0d0d0d;padding:2px 26px;margin-top:6px}
.cover .u{font-size:38px;color:#cfcfcf;margin-top:44px;line-height:1.4}
.dots{position:absolute;left:0;right:0;display:flex;justify-content:center;gap:14px}
.dots i{width:14px;height:14px;border-radius:7px;background:#3a3a3a}.dots i.on{background:#3DFF6E;width:44px}`;
const brand = `<div class="brand"><img src="data:image/png;base64,${logo}"><span>PACE<b>SHARK</b></span></div>`;
const dots = (n, i) => `<div class="dots">${Array.from({ length: n }, (_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>`;
const cover = (small, big, hl, sub) => `<div class="cover"><div class="s">${esc(small)}</div><div class="b">${esc(big)}<br><span class="h">${esc(hl)}</span></div>${sub ? `<div class="u">${esc(sub)}</div>` : ""}</div>`;

// ── Faded Pexels photo behind the first frame / cover ─────────────────────────────────────────────────────────────
const usedFile = path.join(__dirname, "used-photos.json");
const used = (() => { try { return JSON.parse(fs.readFileSync(usedFile, "utf8")); } catch { return {}; } })();
const credits = [];
async function photoFor(key, query, w, h) {
  const local = path.join(dir, `photo-${key}.jpg`);
  if (fs.existsSync(local)) return fs.readFileSync(local).toString("base64");
  const apiKey = (process.env.PEXELS_API_KEY || "").trim();
  if (!query || !apiKey) return null;
  try {
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=20`, { headers: { Authorization: apiKey } });
    if (!r.ok) { console.warn(`Pexels search "${query}" failed: ${r.status}`); return null; }
    const list = ((await r.json()).photos || []).filter(p => !used[p.id]);
    if (!list.length) { console.warn(`Pexels: nothing new for "${query}"`); return null; }
    const p = list[Math.floor(Math.random() * Math.min(5, list.length))]; // one of the 5 best matches, so it isn't always the same
    const img = await fetch(`${p.src.original}?auto=compress&cs=tinysrgb&fit=crop&w=${w}&h=${h}`);
    if (!img.ok) return null;
    const buf = Buffer.from(await img.arrayBuffer());
    fs.writeFileSync(local, buf);
    used[p.id] = { day: path.basename(dir), query, url: p.url };
    credits.push({ post: key, query, photographer: p.photographer, url: p.url });
    return buf.toString("base64");
  } catch (e) { console.warn(`Pexels "${query}": ${e.message}`); return null; }
}
// Faded: the photo at ~45%, darkened top and bottom so the brand, hook and URL stay easy to read.
const photoBg = b64 => b64 ? `<div style="position:absolute;inset:0;background:url(data:image/jpeg;base64,${b64}) center/cover;opacity:.5;filter:saturate(.85) contrast(1.05)"></div>
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,13,13,.75) 0%,rgba(13,13,13,.35) 30%,rgba(13,13,13,.45) 60%,rgba(13,13,13,.9) 100%)"></div>` : "";

(async () => {
  const b = await chromium.launch();
  const coverPhoto = await photoFor("carousel", c.carousel.photo, 1080, 1350);
  const reelPhoto = { reel1: await photoFor("reel1", c.reel1.photo, 1080, 1920), reel2: await photoFor("reel2", c.reel2.photo, 1080, 1920) };
  // Carousel, 1080x1350
  const slides = c.carousel.slides;
  let pg = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  const shots = [];
  for (const [i, s] of slides.entries()) {
    const inner = s.kind ? cover(s.small, s.big, s.hl, s.sub)
      : `<div class="tag">${esc(s.tag)}</div><div class="main"><div class="num">${esc(s.n ?? i)}</div><h1>${esc(s.title)}</h1><h2>${esc(s.head)}</h2><p>${esc(s.body)}</p></div>`;
    await pg.setContent(`<style>${base}body{width:1080px;height:1350px}.cover{top:430px}.dots{bottom:130px}</style><body>${i === 0 ? photoBg(coverPhoto) : ""}${brand}${inner}${dots(slides.length, i)}<div class="url">www.paceshark.com</div><div class="hint">${i < slides.length - 1 ? "Swipe →" : ""}</div></body>`);
    await pg.waitForTimeout(150);
    const name = `post3-${String(i + 1).padStart(2, "0")}.png`;
    await pg.screenshot({ path: path.join(dir, name) }); shots.push(name);
  }
  // Reel frames, 1080x1920
  pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  for (const r of ["reel1", "reel2"]) {
    const fr = c[r].frames;
    for (const [i, f] of fr.entries()) {
      await pg.setContent(`<style>${base}body{width:1080px;height:1920px}.cover{top:576px}.dots{bottom:160px}</style><body>${i === 0 ? photoBg(reelPhoto[r]) : ""}${brand}${cover(f.s, f.b, f.h, f.u)}${dots(fr.length, i)}<div class="url">www.paceshark.com</div></body>`);
      await pg.waitForTimeout(150);
      await pg.screenshot({ path: path.join(dir, `.${r}-${i + 1}.png`) });
    }
  }
  await b.close();
  // Reels: ~2.8 s a frame with a 0.4 s crossfade, H.264, no audio
  for (const [r, out] of [["reel1", "post1.mp4"], ["reel2", "post2.mp4"]]) {
    const n = c[r].frames.length, d = 2.8, x = 0.4, args = ["-y", "-loglevel", "error"];
    for (let i = 1; i <= n; i++) args.push("-loop", "1", "-t", String(d + x), "-i", path.join(dir, `.${r}-${i}.png`));
    const f = []; let last = "[0:v]";
    for (let i = 1; i < n; i++) { f.push(`${last}[${i}:v]xfade=transition=fade:duration=${x}:offset=${(i * d).toFixed(2)}[v${i}]`); last = `[v${i}]`; }
    f.push(`${last}format=yuv420p,fps=30[out]`);
    args.push("-filter_complex", f.join(";"), "-map", "[out]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart", "-an", path.join(dir, out));
    execFileSync("ffmpeg", args, { stdio: "inherit" });
    for (let i = 1; i <= n; i++) fs.rmSync(path.join(dir, `.${r}-${i}.png`), { force: true });
  }
  fs.writeFileSync(path.join(dir, "post1.txt"), c.reel1.caption.trim() + "\n");
  fs.writeFileSync(path.join(dir, "post2.txt"), c.reel2.caption.trim() + "\n");
  fs.writeFileSync(path.join(dir, "post3.txt"), c.carousel.caption.trim() + "\n");
  fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify({ posts: [
    { slot: 1, time: "06:30", type: "reel", mode: "manual", files: ["post1.mp4"], caption: "post1.txt" },
    { slot: 2, time: "12:30", type: "reel", mode: "manual", files: ["post2.mp4"], caption: "post2.txt" },
    { slot: 3, time: "18:30", type: "carousel", mode: "auto", files: shots, caption: "post3.txt" },
  ], ...(credits.length ? { photos: credits } : {}) }, null, 2) + "\n");
  if (credits.length) fs.writeFileSync(usedFile, JSON.stringify(used, null, 1) + "\n");
  console.log(`Built ${dir}: 2 reels, ${shots.length} carousel slides, captions, plan.json`);
})().catch(e => { console.error(e); process.exit(1); });
