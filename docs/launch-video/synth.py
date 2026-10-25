# The soundtrack, written as one piece on a 120 BPM grid (beat 0.5s, bar 2s),
# A minor: pad chords Am-F-C-G per bar, a riser into the reveal, low impacts
# on each cut, sub pulses on the beat, a kick and soft hats as it builds.
import math, random, struct, wave

SR, DUR = 44100, 21.0
N = int(SR * DUR)
BEAT = 0.5
CUTS = [3.0, 7.0, 11.0, 15.0, 18.0]
mix = [0.0] * N
random.seed(7)

def hz(midi): return 440.0 * 2 ** ((midi - 69) / 12)
def add(i, v):
    if 0 <= i < N: mix[i] += v

# Pad: soft saw-ish (5 harmonics), slow attack per chord, louder after the hook.
CHORDS = [[45, 57, 60, 64], [41, 53, 57, 60], [48, 55, 60, 64], [43, 55, 59, 62]]  # Am F C G
for bar in range(11):
    start = bar * 2.0
    notes = CHORDS[bar % 4] if bar < 9 else [45, 57, 60, 64, 69]
    length = 2.0 if bar < 9 else 3.0
    level = 0.05 if start < 3.0 else 0.085
    if bar == 10: break
    for n in notes:
        f = hz(n)
        for i in range(int(length * SR)):
            t = i / SR
            env = min(1, t / 0.35) * min(1, (length - t) / 0.4)
            if bar == 9: env *= min(1, (length - t) / 1.6)
            s = sum(math.sin(2 * math.pi * f * k * (start + t) * (1 + 0.0015 * (k % 2))) / (k * 1.6) for k in range(1, 6))
            add(int((start + t) * SR), level * env * s / len(notes) * 2.2)

# Riser into the reveal: filtered noise and a rising tone, 1.5s to 3.0s.
lp = 0.0
for i in range(int(1.5 * SR)):
    t = i / SR; k = t / 1.5
    lp += (random.uniform(-1, 1) - lp) * (0.02 + 0.25 * k)
    tone = math.sin(2 * math.pi * (220 + 660 * k * k) * t) * 0.15
    add(int((1.5 + t) * SR), (lp * 0.5 + tone) * 0.18 * k ** 2)

# Impacts on the cuts: a falling sub boom and a short soft noise burst.
for c in CUTS:
    lp = 0.0
    for i in range(int(1.4 * SR)):
        t = i / SR
        f = 58 * math.exp(-t * 1.2) + 32
        boom = math.sin(2 * math.pi * f * t) * math.exp(-t * 3.2)
        lp += (random.uniform(-1, 1) - lp) * 0.08
        add(int(c * SR) + i, (boom * 0.42 + lp * math.exp(-t * 9) * 0.25) * (1.0 if c == 3.0 else 0.75))

# Sub pulse on each beat from the reveal to the outro, on the chord's root.
for b in range(int(3.0 / BEAT), int(18.0 / BEAT)):
    t0 = b * BEAT
    root = hz(CHORDS[int(t0 // 2.0) % 4][0] - 12)
    for i in range(int(0.42 * SR)):
        t = i / SR
        add(int(t0 * SR) + i, math.sin(2 * math.pi * root * t) * math.exp(-t * 7) * 0.16)

# Kick on every beat from 7s, hats on the off-beats from 11s, both soft.
for b in range(int(7.0 / BEAT), int(18.0 / BEAT)):
    t0 = b * BEAT
    for i in range(int(0.3 * SR)):
        t = i / SR
        f = 120 * math.exp(-t * 30) + 45
        add(int(t0 * SR) + i, math.sin(2 * math.pi * f * t) * math.exp(-t * 14) * 0.22)
    if t0 >= 11.0:
        hp = prev = 0.0
        for i in range(int(0.06 * SR)):
            x = random.uniform(-1, 1); hp = 0.7 * (hp + x - prev); prev = x
            add(int((t0 + BEAT / 2) * SR) + i, hp * math.exp(-i / SR * 70) * 0.05)

# Master: gentle tanh glue, normalise to -1 dBFS, 20ms fade in, 1s fade out.
peak = max(abs(math.tanh(v * 1.2)) for v in mix) or 1
gain = 10 ** (-1 / 20) / peak
out = []
for i, v in enumerate(mix):
    t = i / SR
    fade = min(1, t / 0.02) * min(1, (DUR - t) / 1.0)
    out.append(int(max(-1, min(1, math.tanh(v * 1.2) * gain * fade)) * 32767))
with wave.open('music.wav', 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(struct.pack(f'<{len(out)}h', *out))
print('music.wav', DUR, 's')
