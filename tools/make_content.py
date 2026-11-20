#!/usr/bin/env python3
"""Writes tomorrow's content.json with the Claude API, used by the daily GitHub workflow (.github/workflows/daily-batch.yml) so
the 18:00 email never depends on a Claude chat session having usage left (20 Nov 2026: the scheduled task failed with
"usage limit reached" and nothing was made). Needs ANTHROPIC_API_KEY. Skips when queue/<day>/ already has a plan.json or content.json.
    python3 tools/make_content.py            # tomorrow in South African time
    python3 tools/make_content.py 2026-11-21
Prints the day it made, or "exists" when there was nothing to do."""
import json, os, sys, re, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL = os.environ.get("POSTS_MODEL", "claude-sonnet-5-5")
SAST = timezone(timedelta(hours=2))
FLAVOUR = ["Monday: training tip", "Tuesday: race spotlight", "Wednesday: fuelling and hydration", "Thursday: mindset or a myth busted",
           "Friday: race week and kit", "Saturday: long runs and the weekend", "Sunday: fun and community"]

RULES = """You write tomorrow's three Instagram posts for PaceShark (www.paceshark.com, @pace.shark), a race-specific running training
platform from Cape Town run by Ruan, an ultra runner. Ruan's earlier posts got 30-40 views each against 200-1,000 before. Likely causes:
every post about the same race, every post looking the same, weak first frames and several calls to action. So: variety, broad appeal,
a first frame that stops the scroll, ONE call to action per post. Ruan also wants to reach running CLUBS.

Pick three topics with this mix:
- AT MOST ONE post tied to a specific race (South African races first: UTCT, Two Oceans, Comrades, Otter, backyard ultras; then big
  international ones). Do NOT state dates, cut-offs, times or results unless you are certain; prefer training advice for that kind of course.
- AT LEAST ONE post any runner relates to whatever their race: pacing, easy runs, the long run, shoes, niggles and recovery, classic mistakes,
  funny runner habits, signs you're a runner, running in heat, wind or the dark. Broad appeal is what gets shown to non-followers.
- ONE club post: run clubs in general, so club runners share it and tag their club (tag your run club, signs you've found your club, club
  etiquette, the people at every club run, why club runners stick with it, how a club's Tuesday session fits a race plan, club vs club
  because PaceShark has a club leaderboard, starting a run club). Never name or praise a real club, person or result.
Any of reel1, reel2 or the carousel can be the club post; rotate which. Reels (06:30 and 12:30) and one carousel (18:30).

REELS: 3 to 8 frames, one short idea per frame. Frame keys: s (small line in capitals), b (big white words), h (green highlight words),
u (optional short line under). The FIRST frame must stop the scroll on its own: a big, bold, curious or relatable hook (never a
near-empty frame). Last frame: ONE call to action.
KEEP EVERY PROMISE: if a hook says "6 people", "5 mistakes" or "3 signs", there must be exactly that many items, each on its OWN frame
or slide, numbered 1, 2, 3. Never squeeze several items into one frame. If it does not fit, promise fewer (a reel is at most 8 frames:
hook, up to 6 items, call to action).
CAROUSEL: 5 to 8 slides: a cover {"kind":"cover","small","big","hl","sub"}, numbered slides {"n","tag","title","head","body"}, and a last
{"kind":"cta","small","big","hl","sub"} slide.
ONE call to action per post, rotating through: "Save this for your next long run" / "Running [race]? Your course plan: link in bio" /
"Which race are you training for? Tell me below." / for club posts "Tag your run club" or "Run with a club? Add it on PaceShark: link in bio"
or "Send this to your club's WhatsApp group".
CAPTIONS: a hook on line 1, one or two short lines, the one call to action, a blank line, then 3 to 5 hashtags that fit THIS post (club posts:
#runclub #runningclub #runningcommunity; others #runningSA #trailrunningsa #runningtips; the race hashtag only on the race post; and
#PaceShark). Do not reuse the same hashtag set as the recent posts.
PHOTO: reel1, reel2 and carousel each get "photo": 2 to 4 English search words for a stock photo that matches the hook, specific and visual
(what is in the picture), relatable and where it fits funny, e.g. "exhausted runner lying on grass", "runner eating pasta", "group of
runners laughing", "muddy trail shoes". Never anything that looks like a real race, brand or famous person.
HARD RULES: never mention AI. Never say "free program" or "free plan". Only www.paceshark.com links, or "link in bio". No emojis anywhere.
Never invent statistics, quotes, results or names. General training advice only, no medical claims. Plain, confident, runner-to-runner
voice with some humour. Do not repeat any topic, hook, angle or race from the recent posts listed below, and never the same race as yesterday.
Answer with ONLY the JSON object, no markdown, in this shape:
{"reel1": {"photo": "...", "frames": [{"s": "", "b": "", "h": "", "u": ""}], "caption": "..."},
 "reel2": {"photo": "...", "frames": [], "caption": "..."},
 "carousel": {"photo": "...", "slides": [], "caption": "..."}}"""


def recent_captions():
    out = []
    for d in sorted((ROOT / "queue").glob("20*"))[-21:]:
        for f in sorted(d.glob("post*.txt")):
            out.append(f"[{d.name} {f.stem}] " + f.read_text(encoding="utf-8").strip().split("\n")[0])
    return "\n".join(out) or "(none yet)"


def valid(c):
    try:
        for k in ("reel1", "reel2"):
            fr = c[k]["frames"]
            assert 3 <= len(fr) <= 8 and all(f.get("b") for f in fr) and c[k]["caption"].strip() and c[k].get("photo")
        sl = c["carousel"]["slides"]
        assert 5 <= len(sl) <= 9 and sl[0].get("kind") == "cover" and sl[-1].get("kind") == "cta"
        assert c["carousel"]["caption"].strip() and c["carousel"].get("photo")
        blob = json.dumps(c, ensure_ascii=False)
        assert not re.search(r"[\U0001F300-\U0001FAFF☀-➿]", blob)
        assert not re.search(r"free (program|plan)|\bAI\b|intervals\.icu", blob, re.I)
        # a hook that promises N items must have N numbered frames (hook + N + call to action)
        for k in ("reel1", "reel2"):
            m = re.search(r"\b(\d)\b", c[k]["frames"][0].get("b", "") + " " + c[k]["frames"][0].get("h", ""))
            if m and int(m.group(1)) >= 3:
                assert len(c[k]["frames"]) == int(m.group(1)) + 2, "promise count"
        return True
    except Exception:
        return False


def ask(prompt):
    body = json.dumps({"model": MODEL, "max_tokens": 5000, "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, headers={
        "content-type": "application/json", "x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.load(r)
    txt = "".join(b.get("text", "") for b in data["content"])
    return json.loads(txt[txt.index("{"): txt.rindex("}") + 1])


def main():
    day = sys.argv[1] if len(sys.argv) > 1 else (datetime.now(SAST) + timedelta(days=1)).strftime("%Y-%m-%d")
    folder = ROOT / "queue" / day
    if (folder / "plan.json").exists() or (folder / "content.json").exists():
        print("exists"); return
    wd = FLAVOUR[datetime.strptime(day, "%Y-%m-%d").weekday()]
    prompt = f"{RULES}\n\nThe posts are for {day} ({wd}). Weekly flavour: blend it in, do not force it.\n\nRecent posts (first lines of captions):\n{recent_captions()}"
    for attempt in range(4):
        try:
            c = ask(prompt)
            if valid(c):
                folder.mkdir(parents=True, exist_ok=True)
                (folder / "content.json").write_text(json.dumps(c, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
                print(day); return
            print("attempt", attempt + 1, "invalid, retrying", file=sys.stderr)
        except Exception as e:
            print("attempt", attempt + 1, "failed:", repr(e)[:200], file=sys.stderr)
    sys.exit("could not make content")


main()
