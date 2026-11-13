# PaceShark daily Instagram posts

The website (www.paceshark.com) reads this repo and posts each day's batch to Instagram @pace.shark.
Everything here goes public on Instagram anyway, so the repo is public. Never put keys or private files here.

## One folder per day

```
queue/2026-11-14/
  plan.json
  post1.mp4        post1.txt      (animated reel, 06:30)
  post2.mp4        post2.txt      (slideshow reel, 12:30)
  post3-01.png ... post3-07.png   post3.txt   (carousel, 18:30)
```

`plan.json`:

```json
{
  "posts": [
    { "slot": 1, "time": "06:30", "type": "reel",     "mode": "manual", "files": ["post1.mp4"], "caption": "post1.txt" },
    { "slot": 2, "time": "12:30", "type": "reel",     "mode": "manual", "files": ["post2.mp4"], "caption": "post2.txt" },
    { "slot": 3, "time": "18:30", "type": "carousel", "mode": "auto",   "files": ["post3-01.png", "post3-02.png", "post3-03.png", "post3-04.png", "post3-05.png", "post3-06.png", "post3-07.png"], "caption": "post3.txt" }
  ]
}
```

- Times are Cape Town time. `type`: `reel` (one mp4), `carousel` (2-10 png/jpg, in order) or `image` (one png/jpg).
- `mode`:
  - `auto`: posted by the website at that time, with the caption.
  - `manual`: 5 minutes before, Ruan gets an email with the file and the caption, and posts it himself with a trending sound.
  - Ruan's choice (13 Nov 2026): both reels `manual`, the carousel `auto`.
- Captions are plain text files (UTF-8), exactly as they should appear on Instagram, with the 5 hashtags at the end.
- File names: letters, numbers, `.`, `_`, `-` only.
- Reels: mp4 (H.264), 1080x1920, under 90 seconds and 100 MB. Carousel slides: png or jpg, 1080x1350, under 8 MB each.
- Push the batch the evening before. Each post goes out once; a later change to a posted day does nothing.
