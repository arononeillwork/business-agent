"""The Google reviews & opening hours video's music ("Right on Google.", video/src/listing/).

120 bpm, a bar is 2 s (60 frames at 30 fps), the video's cuts on bar lines:
  bars 1-2   (0-4 s)     the title: warm electric piano, a bell, no drums
  bars 3-8   (4-16 s)    Sunday, 16:10: Google says open, the door says closed; low chords and the clock, no drums
  bars 9-26  (16-52 s)   1 opening hours, 2 reviews: the uplifting groove (F C Dm Bb), the melody at each, a riser into each
  bars 27-32 (52-64 s)   the listing put right: lighter, no kick
  bars 33-36 (64-72 s)   the logo: home, rings out

    python3 video/music/listing.py   ->  video/public/audio/listing-music.mp3
"""
from synth import *  # noqa: F401,F403 (the instruments)

LENGTH = 72.0
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


def clock(n, gain=0.5):
    """A wall clock, once a beat (tick, tock)."""
    for b in range(4):
        drums.add(bar(n) + b * BEAT, tick(b % 2 == 0), gain, pan=-0.3)


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

# ---------- bars 3-8: Sunday, 16:10 ----------
for n, name in zip(range(3, 9), ['Dm', 'Bb', 'Dm', 'Bb', 'Dm', 'Csus']):
    c = CHORDS[name]
    music.add(bar(n), pad([hz(x) for x in c['pad']], BAR + 0.8, 1100), 0.42)
    music.add(bar(n), bass(hz(c['root']), BAR * 0.9), 0.5)
    clock(n, 0.5)
    if n >= 5:
        for i, k in enumerate([0, 2, 1, 3]):
            music.add(bar(n) + i * BEAT, pluck(hz(c['arp'][k]), 1.2), 0.16, pan=(-0.3 if i % 2 else 0.3))
music.add(bar(8), riser(BAR), 0.55)

# ---------- bars 9-26: opening hours, reviews ----------
for n in range(9, 27):
    chord_bar(n, CYCLE[(n - 9) % 4], pad_gain=0.5, arp_gain=0.3, ep_on=(n % 4 == 1))
    groove(n)
melody(9, 1.0, 0.38)
melody(18, 2.0, 0.36)
music.add(bar(17), riser(BAR), 0.45)

# ---------- bars 27-32: the listing, right ----------
for n, name in zip(range(27, 33), ['Dm', 'Bb', 'F', 'C', 'Bb', 'Csus']):
    chord_bar(n, name, pad_gain=0.5, arp_gain=0.18, ep_on=True)
    for s in range(8):
        drums.add(bar(n) + s * BEAT / 2, shaker(1.0 if s % 2 else 0.6), 0.6, pan=0.4)
music.add(bar(32) + 2 * BEAT, riser(2 * BEAT), 0.3)

# ---------- bars 33-36: home ----------
music.add(bar(33), pad([hz(x) for x in CHORDS['F']['pad']] + [hz('F4')], 2 * BAR + 1.5, 2600), 0.6)
for i, x in enumerate(['F3', 'C4', 'F4', 'A4', 'C5']):
    music.add(bar(33) + 0.03 * i, ep(hz(x), 6.0), 0.3)
music.add(bar(33), bass(hz('F2'), 2.5), 0.9)
drums.add(bar(33), kick(), 0.8)
for i, note in enumerate(['C5', 'A4', 'F4', 'C5', 'F5']):
    music.add(bar(33) + (0.5 + i * 0.5) * BEAT, bell(hz(note), 2.5), 0.32, pan=0.15)
music.add(bar(35), pad([hz(x) for x in CHORDS['F']['pad']], 2 * BAR + 1.0, 2000), 0.4)

# Mix: the kick pushes the chords a little; a room round everything but the kick.
kick_env = np.zeros(len(drums.buf))
for n in range(9, 27):
    for b in (0, 2):
        i = int((bar(n) + b * BEAT) * SR)
        m = int(0.35 * SR)
        kick_env[i:i + m] = np.maximum(kick_env[i:i + m], np.exp(-np.arange(m) / (0.09 * SR)))
duck = 1 - 0.28 * kick_env
mix = reverb(music.buf * duck[:, None], wet=0.22) + reverb(drums.buf, seconds=0.9, wet=0.08)
write_wav('listing-music', mix, LENGTH)
master('listing-music')
print('listing music written to', os.path.abspath(OUT))
