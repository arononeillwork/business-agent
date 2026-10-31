"""The owner video's music ("Run your café from one place", video/src/owner/).

120 bpm, a bar is 2 s (60 frames at 30 fps), the video's cuts on bar lines:
  bars 1-2   (0-4 s)     the title: warm electric piano, a morning bell, no drums
  bars 3-5   (4-10 s)    the map of it: plucked arps join, a soft kick, a riser into the app
  bars 6-14  (10-28 s)   Today and the advisor: the uplifting groove (F C Dm Bb), the bell melody
  bars 15-16 (28-32 s)   the four things to do: drums out but the shaker, so the list reads
  bars 17-49 (32-98 s)   the four chapters: the groove, the melody at the start of each chapter, a riser into each
  bars 50-53 (98-106 s)  four changes made once, and the rest: lighter, no kick
  bars 54-57 (106-114 s) the logo: home, rings out

    python3 video/music/owner.py   ->  video/public/audio/owner-music.mp3
"""
from synth import *  # noqa: F401,F403 (the instruments)

LENGTH = 114.0
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


def groove(n, kick_on=True, clap_on=True):
    for b in range(4):
        if kick_on:
            drums.add(bar(n) + b * BEAT, kick(), 0.9 * (1.0 if b in (0, 2) else 0.55))
        if clap_on and b in (1, 3):
            drums.add(bar(n) + b * BEAT, clap(), 0.55)
    for s in range(8):
        drums.add(bar(n) + s * BEAT / 2, shaker(1.0 if s % 2 else 0.6), 0.9, pan=0.4)


def melody(phrase, octave=1.0, gain=0.4):
    for beat, note, length in MELODY:
        music.add(bar(phrase) + beat * BEAT, bell(hz(note) * octave, length * BEAT + 1.2), gain, pan=-0.15)


# ---------- bars 1-2: the title ----------
for n, name in ((1, 'F'), (2, 'C')):
    c = CHORDS[name]
    music.add(bar(n), pad([hz(x) for x in c['pad']], BAR + 0.8, 1500), 0.45)
    for i, x in enumerate(c['pad']):
        music.add(bar(n) + 0.03 * i, ep(hz(x) * 2, BAR * 1.6, 0.7), 0.26, pan=-0.2 + 0.13 * i)
for i, note in enumerate(['C5', 'F5', 'A5', 'G5']):
    music.add(bar(1) + (1 + i) * BEAT, bell(hz(note), 2.0), 0.28, pan=0.15)

# ---------- bars 3-5: the map ----------
for n, name in ((3, 'Dm'), (4, 'Bb'), (5, 'Csus')):
    chord_bar(n, name, pad_gain=0.45, arp_gain=0.22 + 0.04 * (n - 3), ep_on=(n == 3), bass_on=n >= 4)
    if n >= 4:
        for b in (0, 2):
            drums.add(bar(n) + b * BEAT, kick(0.8), 0.6)
        for s in range(8):
            drums.add(bar(n) + s * BEAT / 2, shaker(1.0 if s % 2 else 0.6), 0.6, pan=0.4)
music.add(bar(5), riser(BAR), 0.55)

# ---------- bars 6-49: Today, the advisor, the four chapters ----------
CHAPTERS = (17, 25, 34, 42)
for n in range(6, 50):
    name = CYCLE[(n - 6) % 4]
    calm = n in (15, 16)  # the list of four: let it read
    chord_bar(n, name, pad_gain=0.5, arp_gain=0.2 if calm else 0.3, ep_on=(n % 4 == 1) or calm)
    groove(n, kick_on=not calm, clap_on=not calm)
for phrase, octave in ((6, 1.0), (11, 1.0)):
    melody(phrase, octave, 0.34)
for i, phrase in enumerate(CHAPTERS):
    melody(phrase, 2.0 if i % 2 else 1.0, 0.4)
    music.add(bar(phrase - 1), riser(BAR), 0.4)
music.add(bar(16), riser(BAR), 0.55)

# ---------- bars 50-53: made once, and the rest ----------
for n, name in zip(range(50, 54), ['Dm', 'Bb', 'F', 'C']):
    chord_bar(n, name, pad_gain=0.5, arp_gain=0.18, ep_on=True)
    for s in range(8):
        drums.add(bar(n) + s * BEAT / 2, shaker(1.0 if s % 2 else 0.6), 0.6, pan=0.4)
music.add(bar(53) + 2 * BEAT, riser(2 * BEAT), 0.3)

# ---------- bars 54-57: home ----------
music.add(bar(54), pad([hz(x) for x in CHORDS['F']['pad']] + [hz('F4')], 2 * BAR + 1.5, 2600), 0.6)
for i, x in enumerate(['F3', 'C4', 'F4', 'A4', 'C5']):
    music.add(bar(54) + 0.03 * i, ep(hz(x), 6.0), 0.3)
music.add(bar(54), bass(hz('F2'), 2.5), 0.9)
drums.add(bar(54), kick(), 0.8)
for i, note in enumerate(['C5', 'A4', 'F4', 'C5', 'F5']):
    music.add(bar(54) + (0.5 + i * 0.5) * BEAT, bell(hz(note), 2.5), 0.32, pan=0.15)
music.add(bar(56), pad([hz(x) for x in CHORDS['F']['pad']], 2 * BAR + 1.0, 2000), 0.4)

# Mix: the kick pushes the chords a little; a room round everything but the kick.
kick_env = np.zeros(len(drums.buf))
for n in range(4, 50):
    if n in (15, 16):
        continue
    for b in (0, 2):
        i = int((bar(n) + b * BEAT) * SR)
        m = int(0.35 * SR)
        kick_env[i:i + m] = np.maximum(kick_env[i:i + m], np.exp(-np.arange(m) / (0.09 * SR)))
duck = 1 - 0.28 * kick_env
mix = reverb(music.buf * duck[:, None], wet=0.22) + reverb(drums.buf, seconds=0.9, wet=0.08)
write_wav('owner-music', mix, LENGTH)
master('owner-music')
print('owner music written to', os.path.abspath(OUT))
