"""The music of "Just say it" (video/src/say/), and its two sounds: a key pressed, and the microphone on.

120 bpm, a bar is 2 s (60 frames at 30 fps), the video's cuts on bar lines:
  bars 1-2   (0-4 s)     the title: warm electric piano and a bell, no drums
  bars 3-8   (4-16 s)    connecting it once: plucked arps join, a soft kick from bar 5, a riser into the chat
  bars 9-15  (16-30 s)   typed: a light groove (no clap) so the typing reads
  bars 16-20 (30-40 s)   everywhere it shows: the full groove and the bell melody
  bars 21-27 (40-54 s)   said: the light groove again, under the voice
  bars 28-32 (54-64 s)   everywhere it shows: the full groove and the melody an octave up
  bars 33-40 (64-80 s)   ask it anything: the groove, the melody in its second half
  bars 41-45 (80-90 s)   the usual way, or one sentence: lighter, no kick; a riser
  bars 46-47 (90-94 s)   "How much is your time worth?": drums out, the chords alone
  bars 48-53 (94-106 s)  the brand under it: home on F, the bell, ringing out

    python3 video/music/say.py   ->  video/public/audio/say-music.mp3, sfx-key.mp3, sfx-mic.mp3
"""
from synth import *  # noqa: F401,F403 (the instruments)

LENGTH = 106.0
music = Track(LENGTH)
drums = Track(LENGTH)


def bar(n):
    return (n - 1) * BAR


def chord_bar(n, name, pad_gain=0.5, arp_gain=0.3, ep_on=False, bass_on=True):
    c = CHORDS[name]
    music.add(bar(n), pad([hz(x) for x in c['pad']], BAR + 0.6), pad_gain)
    if bass_on:
        r = hz(c['root'])
        for b, l in ((0, 1.4), (1.5, 0.45), (2, 1.4), (3.5, 0.45)):
            music.add(bar(n) + b * BEAT, bass(r, l * BEAT), 0.85)
    if arp_gain:
        for i, k in enumerate([0, 1, 2, 3, 2, 1, 2, 3]):
            music.add(bar(n) + i * BEAT / 2, pluck(hz(c['arp'][k]), 0.9), arp_gain * (1.0 if i % 2 == 0 else 0.75), pan=(-0.35 if i % 2 else 0.35))
    if ep_on:
        for i, x in enumerate(c['pad']):
            music.add(bar(n) + i * 0.012, ep(hz(x) * 2, BAR * 1.5, 0.8), 0.22, pan=-0.2 + 0.13 * i)


def groove(n, kick_on=True, clap_on=True, shaker_gain=0.9):
    for b in range(4):
        if kick_on:
            drums.add(bar(n) + b * BEAT, kick(), 0.9 * (1.0 if b in (0, 2) else 0.55))
        if clap_on and b in (1, 3):
            drums.add(bar(n) + b * BEAT, clap(), 0.55)
    for s in range(8):
        drums.add(bar(n) + s * BEAT / 2, shaker(1.0 if s % 2 else 0.6), shaker_gain, pan=0.4)


def melody(phrase, octave=1.0, gain=0.4):
    for beat, note, length in MELODY:
        music.add(bar(phrase) + beat * BEAT, bell(hz(note) * octave, length * BEAT + 1.2), gain, pan=-0.15)


# ---------- bars 1-2: the title ----------
for n, name in ((1, 'F'), (2, 'C')):
    c = CHORDS[name]
    music.add(bar(n), pad([hz(x) for x in c['pad']], BAR + 0.8, 1500), 0.45)
    for i, x in enumerate(c['pad']):
        music.add(bar(n) + 0.03 * i, ep(hz(x) * 2, BAR * 1.6, 0.7), 0.26, pan=-0.2 + 0.13 * i)
for i, note in enumerate(['A4', 'C5', 'F5', 'E5']):
    music.add(bar(1) + (1 + i) * BEAT, bell(hz(note), 2.0), 0.28, pan=0.15)

# ---------- bars 3-8: connecting it ----------
for n, name in zip(range(3, 9), ['Dm', 'Bb', 'F', 'C', 'Dm', 'Csus']):
    chord_bar(n, name, pad_gain=0.45, arp_gain=0.2 + 0.02 * (n - 3), ep_on=(n == 3), bass_on=n >= 5)
    if n >= 5:
        for b in (0, 2):
            drums.add(bar(n) + b * BEAT, kick(0.8), 0.6)
        for s in range(8):
            drums.add(bar(n) + s * BEAT / 2, shaker(1.0 if s % 2 else 0.6), 0.6, pan=0.4)
music.add(bar(8), riser(BAR), 0.5)

# ---------- bars 9-45: the chats, everywhere it shows, asking, the usual way ----------
LIGHT = set(range(9, 16)) | set(range(21, 28))   # the typing and the voice: no clap, a softer shaker
SOFT = set(range(41, 46))                         # the usual way, or one sentence: no kick
for n in range(9, 46):
    name = CYCLE[(n - 9) % 4]
    chord_bar(n, name, pad_gain=0.5, arp_gain=0.22 if n in LIGHT else 0.3, ep_on=(n % 4 == 1) or n in SOFT, bass_on=n not in SOFT)
    groove(n, kick_on=n not in SOFT, clap_on=n not in LIGHT and n not in SOFT, shaker_gain=0.6 if n in LIGHT else 0.9)
for phrase, octave in ((16, 1.0), (28, 2.0), (37, 1.0)):
    melody(phrase, octave, 0.38)
for n in (15, 27, 45):
    music.add(bar(n), riser(BAR), 0.45)

# ---------- bars 46-47: "How much is your time worth?" ----------
for n, name in ((46, 'Dm'), (47, 'Bb')):
    c = CHORDS[name]
    music.add(bar(n), pad([hz(x) for x in c['pad']], BAR + 0.8, 1400), 0.5)
    for i, x in enumerate(c['pad']):
        music.add(bar(n) + 0.03 * i, ep(hz(x) * 2, BAR * 1.6, 0.6), 0.22, pan=-0.2 + 0.13 * i)
music.add(bar(47) + 2 * BEAT, riser(2 * BEAT), 0.3)

# ---------- bars 48-53: home, the brand under the question ----------
music.add(bar(48), pad([hz(x) for x in CHORDS['F']['pad']] + [hz('F4')], 2 * BAR + 1.5, 2600), 0.6)
for i, x in enumerate(['F3', 'C4', 'F4', 'A4', 'C5']):
    music.add(bar(48) + 0.03 * i, ep(hz(x), 6.0), 0.3)
music.add(bar(48), bass(hz('F2'), 2.5), 0.9)
drums.add(bar(48), kick(), 0.8)
for i, note in enumerate(['C5', 'A4', 'F4', 'C5', 'F5']):
    music.add(bar(48) + (0.5 + i * 0.5) * BEAT, bell(hz(note), 2.5), 0.32, pan=0.15)
for n, name in ((50, 'Dm'), (51, 'Bb'), (52, 'F')):
    c = CHORDS[name]
    music.add(bar(n), pad([hz(x) for x in c['pad']], BAR + 0.8, 1800), 0.4)
    for i, k in enumerate([0, 2, 1, 3]):
        music.add(bar(n) + i * BEAT, pluck(hz(c['arp'][k]), 1.2), 0.16, pan=(-0.3 if i % 2 else 0.3))
music.add(bar(53), pad([hz(x) for x in CHORDS['F']['pad']], BAR + 1.0, 2000), 0.38)
music.add(bar(53), bell(hz('F5'), 3.0), 0.26)

# Mix: the kick pushes the chords a little; a room round everything but the kick.
kick_env = np.zeros(len(drums.buf))
for n in range(5, 46):
    if n in SOFT:
        continue
    for b in (0, 2):
        i = int((bar(n) + b * BEAT) * SR)
        m = int(0.35 * SR)
        kick_env[i:i + m] = np.maximum(kick_env[i:i + m], np.exp(-np.arange(m) / (0.09 * SR)))
duck = 1 - 0.28 * kick_env
mix = reverb(music.buf * duck[:, None], wet=0.22) + reverb(drums.buf, seconds=0.9, wet=0.08)
write_wav('say-music', mix, LENGTH)
master('say-music')

# A key pressed: a short, soft click with a little body.
n = int(0.05 * SR)
t = t_of(n)
save_sfx('key', bp(rng.uniform(-1, 1, n), 1800, 6500) * np.exp(-t * 180) * 0.8 + np.sin(2 * np.pi * 220 * t) * np.exp(-t * 120) * 0.3)
# The microphone on: two quick rising tones.
n = int(0.32 * SR)
t = t_of(n)
f = np.where(t < 0.12, 880, 1320)
gate = ((t < 0.1) | ((t > 0.14) & (t < 0.28))).astype(float)
save_sfx('mic', np.sin(2 * np.pi * f * t) * gate * np.exp(-((t % 0.14) * 9)) * 0.7)
print('say music written to', os.path.abspath(OUT))
