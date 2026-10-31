"""The landing video's music and sound effects, made from scratch (no samples, no licence needed).

120 bpm, so a bar is 2 s (60 frames at 30 fps) and the video's cuts land on beats:
  bars 1-5   (0-10 s)    18:00, everything still to do: a quiet clock, once a second, over a soft minor chord
  bars 6-7   (10-14 s)   "What if you changed it in one place?": warm chords swell, a riser
  bars 8-21  (14-42 s)   onboarding: the groove starts (F C Dm Bb)
  bars 22-38 (42-76 s)   opening hours and the menu: fuller, a bell melody on top
  bars 39-48 (76-96 s)   the team, your day, the advisor: lighter
  bars 49-52 (96-104 s)  "Home by half past" / "How much is your time worth?": drums out, a question
  bars 53-54 (104-109 s) the logo: resolves home, rings out

    python3 video/music/compose.py   ->  video/public/audio/music.mp3 and sfx-*.mp3 (needs numpy, scipy, ffmpeg)
"""
from synth import *  # noqa: F401,F403 (the instruments)

LENGTH = 109.0

# ---------- the arrangement ----------

def bar(n):
    """Start time of bar n (1-based)."""
    return (n - 1) * BAR


music = Track(LENGTH)
drums = Track(LENGTH)


def chord_bar(n, name, pad_gain=0.5, arp=True, arp_gain=0.32, bass_on=True, ep_on=False):
    c = CHORDS[name]
    music.add(bar(n), pad([hz(x) for x in c['pad']], BAR + 0.6), pad_gain)
    if bass_on:
        r = hz(c['root'])
        for b, l in ((0, 1.4), (1.5, 0.45), (2, 1.4), (3.5, 0.45)):
            music.add(bar(n) + b * BEAT, bass(r, l * BEAT), 0.85)
    if arp:
        notes = c['arp']
        order = [0, 1, 2, 3, 2, 1, 2, 3]
        for i, k in enumerate(order):
            music.add(bar(n) + i * BEAT / 2, pluck(hz(notes[k]), 0.9), arp_gain * (1.0 if i % 2 == 0 else 0.75), pan=(-0.35 if i % 2 else 0.35))
    if ep_on:
        for i, x in enumerate(c['pad']):
            music.add(bar(n) + i * 0.012, ep(hz(x) * 2, BAR * 1.5, 0.8), 0.22, pan=-0.2 + 0.13 * i)


def groove(n, full=True, kick_gain=0.9):
    for b in range(4):
        drums.add(bar(n) + b * BEAT, kick(), kick_gain * (1.0 if b in (0, 2) else (0.55 if full else 0.0)))
        if b in (1, 3):
            drums.add(bar(n) + b * BEAT, clap(), 0.55 if full else 0.35)
    for s in range(8):
        drums.add(bar(n) + s * BEAT / 2, shaker(1.0 if s % 2 else 0.6), 0.9 if full else 0.6, pan=0.4)
    if full:
        for s in (1.75, 3.75):
            drums.add(bar(n) + s * BEAT, shaker(1.2), 0.8, pan=0.4)


# Bars 1-5: a quiet clock, once a second, over a soft A minor chord.
for sec in range(10):
    music.add(sec * 1.0, tick(sec % 2 == 0), 0.5 * (1 - 0.06 * max(0, sec - 7)))
music.add(0, pad([hz('A2'), hz('E3'), hz('C4')], 10.3, bright=900), 0.28)
for at, note in ((0.0, 'E4'), (2.0, 'C4'), (4.0, 'D4'), (6.0, 'B3')):
    music.add(at, ep(hz(note), 3.0, 0.6), 0.14, pan=0.2)

# Bars 6-7: the turn. Warm chords swell, a riser into the groove.
music.add(bar(6), pad([hz(x) for x in CHORDS['F']['pad']], BAR + 0.8, 2200), 0.6)
for i, x in enumerate(CHORDS['F']['pad']):
    music.add(bar(6) + 0.02 * i, ep(hz(x) * 2, 3.5), 0.3)
music.add(bar(7), pad([hz(x) for x in CHORDS['C']['pad']], BAR + 0.6, 2400), 0.6)
for i, x in enumerate(['E4', 'G4', 'C5']):
    music.add(bar(7) + 0.02 * i, ep(hz(x), 3.0), 0.28)
music.add(bar(7), riser(BAR), 0.9)

# Bars 8-21: onboarding. The groove.
for n in range(8, 22):
    chord_bar(n, CYCLE[(n - 8) % 4], arp_gain=0.28)
    groove(n, full=n > 8)

# Bars 22-38: opening hours and the menu. Fuller, the bell melody on top.
for n in range(22, 39):
    chord_bar(n, CYCLE[(n - 22) % 4], pad_gain=0.55, arp_gain=0.3, ep_on=(n % 4 == 2))
    groove(n, full=True)
for phrase, octave in ((22, 1.0), (26, 1.0), (30, 1.0), (34, 2.0)):
    for beat, note, length in MELODY:
        music.add(bar(phrase) + beat * BEAT, bell(hz(note) * octave, length * BEAT + 1.2), 0.42, pan=-0.15)

# Bars 39-48: the team, your day, the advisor. Lighter, the melody once more, softly.
for n in range(39, 49):
    chord_bar(n, CYCLE[(n - 39) % 4], pad_gain=0.5, arp_gain=0.24)
    groove(n, full=False, kick_gain=0.7)
for beat, note, length in MELODY:
    music.add(bar(43) + beat * BEAT, bell(hz(note), length * BEAT + 1.2), 0.3, pan=-0.15)

# Bars 49-50: "Home by half past." Drums out.
chord_bar(49, 'Dm', pad_gain=0.55, arp=False, bass_on=False, ep_on=True)
chord_bar(50, 'Bb', pad_gain=0.55, arp=False, bass_on=False, ep_on=True)
# Bars 51-52: "How much is your time worth?" A question, left open.
music.add(bar(51), pad([hz(x) for x in CHORDS['Csus']['pad']], 2 * BAR + 0.5, 1400), 0.42)
for i, x in enumerate(['C4', 'F4', 'G4', 'D5']):
    music.add(bar(51) + 0.05 * i, ep(hz(x), 4.0, 0.7), 0.26)
music.add(bar(52) + 2 * BEAT, riser(2 * BEAT), 0.35)
# Bars 53-54: home. The logo.
music.add(bar(53), pad([hz(x) for x in CHORDS['F']['pad']] + [hz('F4')], 2 * BAR + 1.5, 2600), 0.6)
for i, x in enumerate(['F3', 'C4', 'F4', 'A4', 'C5']):
    music.add(bar(53) + 0.03 * i, ep(hz(x), 6.0), 0.3)
music.add(bar(53), bass(hz('F2'), 2.5), 0.9)
drums.add(bar(53), kick(), 0.8)
for i, n in enumerate(['C5', 'A4', 'F4', 'C5', 'F5']):
    music.add(bar(53) + (0.5 + i * 0.5) * BEAT, bell(hz(n), 2.5), 0.32, pan=0.15)

# Mix: the drums push the chords a little (side-chain), a room around everything but the kick.
kick_env = np.zeros(len(drums.buf))
for n in list(range(8, 49)):
    for b in (0, 2):
        i = int((bar(n) + b * BEAT) * SR)
        m = int(0.35 * SR)
        kick_env[i:i + m] = np.maximum(kick_env[i:i + m], np.exp(-np.arange(m) / (0.09 * SR)))
duck = 1 - 0.28 * kick_env
mix = reverb(music.buf * duck[:, None], wet=0.24) + reverb(drums.buf, seconds=0.9, wet=0.08)
# Fade the very end.
end = int(LENGTH * SR)
fade = int(2.0 * SR)
mix[end - fade:end] *= np.linspace(1, 0, fade)[:, None]
mix = mix[:end]
mix /= np.max(np.abs(mix)) * 1.12
os.makedirs(OUT, exist_ok=True)
wavfile.write(os.path.join(OUT, 'music.wav'), SR, (mix * 32767).astype(np.int16))


# ---------- sound effects ----------

def save(name, sig):
    if sig.ndim == 1:
        sig = np.stack([sig, sig], axis=1)
    sig = sig / (np.max(np.abs(sig)) * 1.05)
    wavfile.write(os.path.join(OUT, f'sfx-{name}.wav'), SR, (sig * 32767).astype(np.int16))


# A soft UI click.
n = int(0.05 * SR); t = t_of(n)
save('click', lp(hp(rng.uniform(-1, 1, n), 1500), 7000) * np.exp(-t * 180) * 0.6 + np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 220) * 0.4)
# A notification ping (two notes).
n = int(0.7 * SR); t = t_of(n)
p = np.sin(2 * np.pi * hz('E6') * t) * np.exp(-t * 7)
p[int(0.08 * SR):] += np.sin(2 * np.pi * hz('B6') * t[:n - int(0.08 * SR)]) * np.exp(-t[:n - int(0.08 * SR)] * 6)
save('ping', reverb(np.stack([p, p], axis=1), 0.8, 0.2))
# A low buzz (the 1-star review).
n = int(0.35 * SR); t = t_of(n)
save('buzz', lp(np.sign(np.sin(2 * np.pi * 110 * t)) * 0.5 + np.sin(2 * np.pi * 220 * t) * 0.3, 1200) * env_adsr(n, 0.01, 0.05, 0.8, 0.1))
# A pop (a card arriving).
n = int(0.18 * SR); t = t_of(n)
f = 380 + 900 * np.exp(-t * 40)
save('pop', np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 26))
# A whoosh (between scenes).
n = int(0.7 * SR); t = t_of(n)
noise = rng.uniform(-1, 1, n); w = np.zeros(n)
for k in range(20):
    a, b = k * n // 20, (k + 1) * n // 20
    c = 300 * (5000 / 300) ** (np.sin(np.pi * k / 20))
    w[a:b] = bp(noise, c * 0.6, c * 1.5)[a:b]
save('whoosh', w * np.sin(np.pi * t / t[-1]) ** 2)
# A soft chime (done / all set).
n = int(1.6 * SR); t = t_of(n)
ch = sum(np.sin(2 * np.pi * hz(x) * t) * np.exp(-t * 3) for x in ('C6', 'E6', 'G6'))
save('chime', reverb(np.stack([ch, ch], axis=1), 1.4, 0.3))
print('music and sound effects written to', os.path.abspath(OUT))

# Master for the web (no sub rumble, a touch less boom, gently compressed, -17 LUFS) and keep MP3s.
import glob
import subprocess
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(OUT, 'music.wav'), '-af',
                'highpass=f=38,equalizer=f=90:t=q:w=1.0:g=-3,equalizer=f=3500:t=q:w=1.2:g=1.5,'
                'acompressor=threshold=-18dB:ratio=2.5:attack=15:release=200:makeup=2,loudnorm=I=-17:TP=-1.5:LRA=11',
                '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k', os.path.join(OUT, 'music.mp3')], check=True)
for wav in glob.glob(os.path.join(OUT, 'sfx-*.wav')):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '160k', wav[:-4] + '.mp3'], check=True)
for wav in glob.glob(os.path.join(OUT, '*.wav')):
    os.remove(wav)
