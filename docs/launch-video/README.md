# Launch video

`docs/video/launch.mp4`: 21 seconds, 1920x1080, 30fps, made with the [/brag-slim](https://github.com/latent-spaces/brag) playbook in its `cinematic` tone. The storyboard is in [plan.md](plan.md).

Remake it (macOS, Google Chrome, Node 20+, ffmpeg):

```bash
cd docs/launch-video
python3 synth.py                                             # music.wav: 120 BPM, every cut on a beat
node --experimental-websocket capture.mjs frames 30 0 21     # 630 frames of video.html via headless Chrome
cp frames/f00180.png frames/f00000.png                       # poster as frame 0
ffmpeg -framerate 30 -i frames/f%05d.png -i music.wav -c:v libx264 -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -movflags +faststart -shortest ../video/launch.mp4
```

`video.html` draws every frame as a pure function of time (`render(t)`) from the real screenshots in `docs/screenshots`. Check a few stills before a full render: `node --experimental-websocket capture.mjs stills stills 1,5.5,9.5,13.5,16.9,19.8`.
