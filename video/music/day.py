"""The day-in-the-life video's music and its extra sound effects (video/src/day/).

120 bpm, a bar is 2 s (60 frames at 30 fps), the video's cuts on bar lines:
  bars 1-20  (0-40 s)    the day before Business Agent: a tense minor loop (Am F C E), an 8th-note
                         pulse and a ticking hi-hat that keep building, a clock under it all; stops dead
  bars 21-22 (40-44 s)   "Now the same day": a tape rewind, then warm chords swell
  bars 23-49 (44-98 s)   the day with Business Agent: the uplifting groove (F C Dm Bb), a bell melody
  bars 50-53 (98-106 s)  side by side: lighter, no drums
  bars 54-56 (106-112 s) the logo: home, rings out

    python3 video/music/day.py   ->  video/public/audio/day-music.mp3 and sfx-{vibrate,ring,alarm,rewind,stamp}.mp3
"""
from synth import *  # noqa: F401,F403 (the instruments)

LENGTH = 112.0
music = Track(LENGTH)
drums = Track(LENGTH)


def bar(n):
    return (n - 1) * BAR


TENSE = {
    'Am': dict(pad=['A2', 'E3', 'A3', 'C4'], root='A1'),
    'F': dict(pad=['F2', 'C3', 'A3', 'C4'], root='F1'),
    'C': dict(pad=['C3', 'E3', 'G3', 'C4'], root='C2'),
    'E': dict(pad=['E2', 'B2', 'G#3', 'B3'], root='E1'),
}
TENSE_CYCLE = ['Am', 'F', 'C', 'E']


def pulse(f, dur):
    """A tight, muted bass note for the 8th-note pulse."""
    n = int(dur * SR)
    t = t_of(n)
    sig = np.tanh((np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * 2 * f * t)) * 1.6)
    return lp(sig, 900) * np.exp(-t * 9) * 0.5


def hat(vel=1.0):
    n = int(0.05 * SR)
    t = t_of(n)
    return hp(rng.uniform(-1, 1, n), 8000) * np.exp(-t * 90) * 0.25 * vel


# ---------- bars 1-20: the day before ----------
for n in range(1, 21):
    name = TENSE_CYCLE[(n - 1) % 4]
    c = TENSE[name]
    k = (n - 1) / 19  # 0 → 1: the day piling up
    music.add(bar(n), pad([hz(x) for x in c['pad']], BAR + 0.4, bright=900 + 1400 * k), 0.32 + 0.18 * k)
    for s in range(8):
        music.add(bar(n) + s * BEAT / 2, pulse(hz(c['root']) * 2, BEAT / 2 * 0.9), 0.55 + 0.35 * k)
    # A clock, once a second, always there.
    for s in range(2):
        music.add(bar(n) + s * 1.0, tick(s % 2 == 0), 0.32)
    if n >= 3:
        for s in range(16 if n >= 9 else 8):
            step = BEAT / 4 if n >= 9 else BEAT / 2
            drums.add(bar(n) + s * step, hat(1.0 if s % 2 == 0 else 0.6), 0.45 + 0.4 * k, pan=0.35)
    if n >= 5:
        for b in (0, 2):
            drums.add(bar(n) + b * BEAT, kick(0.8), 0.45 + 0.4 * k)
    if n >= 11:
        for b in (1, 3):
            drums.add(bar(n) + b * BEAT, clap(0.7), 0.25 + 0.35 * k)
    if n >= 15:
        # A high, uneasy note on top as it all gets too much.
        music.add(bar(n), pad([hz('E5'), hz('F5')], BAR, bright=3000), 0.08 + 0.1 * k)
music.add(bar(19), riser(2 * BAR), 0.5)

# ---------- bars 21-22: "Now the same day" ----------
n = int(1.6 * SR)
t = t_of(n)
sweep = np.sin(2 * np.pi * np.cumsum(1400 * np.exp(-t * 2.2) + 120) / SR) * 0.25 + lp(rng.uniform(-1, 1, n), 2500) * 0.15
music.add(bar(21), sweep * np.minimum(1, t / 0.05) * np.exp(-t * 0.8), 0.6)
music.add(bar(21) + 1.0, pad([hz(x) for x in CHORDS['F']['pad']], BAR + 1.6, 2200), 0.55)
for i, x in enumerate(CHORDS['F']['pad']):
    music.add(bar(21) + 1.0 + 0.02 * i, ep(hz(x) * 2, 3.5), 0.28)
music.add(bar(22), pad([hz(x) for x in CHORDS['C']['pad']], BAR + 0.6, 2400), 0.55)
music.add(bar(22), riser(BAR), 0.7)

# ---------- bars 23-49: the day with Business Agent ----------
def chord_bar(n, name, pad_gain=0.5, arp_gain=0.3, ep_on=False):
    c = CHORDS[name]
    music.add(bar(n), pad([hz(x) for x in c['pad']], BAR + 0.6), pad_gain)
    r = hz(c['root'])
    for b, l in ((0, 1.4), (1.5, 0.45), (2, 1.4), (3.5, 0.45)):
        music.add(bar(n) + b * BEAT, bass(r, l * BEAT), 0.85)
    for i, k in enumerate([0, 1, 2, 3, 2, 1, 2, 3]):
        music.add(bar(n) + i * BEAT / 2, pluck(hz(c['arp'][k]), 0.9), arp_gain * (1.0 if i % 2 == 0 else 0.75), pan=(-0.35 if i % 2 else 0.35))
    if ep_on:
        for i, x in enumerate(c['pad']):
            music.add(bar(n) + i * 0.012, ep(hz(x) * 2, BAR * 1.5, 0.8), 0.22, pan=-0.2 + 0.13 * i)


def groove(n, full=True):
    for b in range(4):
        drums.add(bar(n) + b * BEAT, kick(), 0.9 * (1.0 if b in (0, 2) else (0.55 if full else 0.0)))
        if b in (1, 3):
            drums.add(bar(n) + b * BEAT, clap(), 0.55 if full else 0.35)
    for s in range(8):
        drums.add(bar(n) + s * BEAT / 2, shaker(1.0 if s % 2 else 0.6), 0.9 if full else 0.6, pan=0.4)


for n in range(23, 50):
    chord_bar(n, CYCLE[(n - 23) % 4], pad_gain=0.5 if n < 27 else 0.55, arp_gain=0.28 if n < 27 else 0.3, ep_on=(n % 4 == 3))
    groove(n, full=n >= 25)
for phrase, octave in ((27, 1.0), (31, 1.0), (39, 1.0), (43, 2.0)):
    for beat, note, length in MELODY:
        music.add(bar(phrase) + beat * BEAT, bell(hz(note) * octave, length * BEAT + 1.2), 0.4, pan=-0.15)

# ---------- bars 50-53: side by side ----------
for n, name in zip(range(50, 54), ['Dm', 'Bb', 'F', 'C']):
    c = CHORDS[name]
    music.add(bar(n), pad([hz(x) for x in c['pad']], BAR + 0.6), 0.5)
    for i, x in enumerate(c['pad']):
        music.add(bar(n) + 0.02 * i, ep(hz(x) * 2, BAR * 1.4, 0.7), 0.22)
music.add(bar(53) + 2 * BEAT, riser(2 * BEAT), 0.3)

# ---------- bars 54-56: home ----------
music.add(bar(54), pad([hz(x) for x in CHORDS['F']['pad']] + [hz('F4')], 2 * BAR + 1.5, 2600), 0.6)
for i, x in enumerate(['F3', 'C4', 'F4', 'A4', 'C5']):
    music.add(bar(54) + 0.03 * i, ep(hz(x), 6.0), 0.3)
music.add(bar(54), bass(hz('F2'), 2.5), 0.9)
drums.add(bar(54), kick(), 0.8)
for i, note in enumerate(['C5', 'A4', 'F4', 'C5', 'F5']):
    music.add(bar(54) + (0.5 + i * 0.5) * BEAT, bell(hz(note), 2.5), 0.32, pan=0.15)

# Mix: in the calm half, the kick pushes the chords a little; a room round everything but the kick.
kick_env = np.zeros(len(drums.buf))
for n in range(25, 50):
    for b in (0, 2):
        i = int((bar(n) + b * BEAT) * SR)
        m = int(0.35 * SR)
        kick_env[i:i + m] = np.maximum(kick_env[i:i + m], np.exp(-np.arange(m) / (0.09 * SR)))
duck = 1 - 0.28 * kick_env
mix = reverb(music.buf * duck[:, None], wet=0.22) + reverb(drums.buf, seconds=0.9, wet=0.08)
# The day before stops dead at 40 s, for the rewind.
s0, s1 = int(bar(21) * SR) - int(0.05 * SR), int(bar(21) * SR)
mix[s0:s1] *= np.linspace(1, 0, s1 - s0)[:, None]
write_wav('day-music', mix, LENGTH)
master('day-music')

# ---------- sound effects ----------
# A phone vibrating on a counter.
n = int(0.9 * SR); t = t_of(n)
gate = ((t % 0.3) < 0.2).astype(float)
save_sfx('vibrate', lp(np.sin(2 * np.pi * 160 * t) * (1 + 0.3 * np.sin(2 * np.pi * 30 * t)), 600) * gate * 0.8)
# A phone ringing (two rings).
n = int(1.6 * SR); t = t_of(n)
ring = (np.sin(2 * np.pi * 880 * t) + np.sin(2 * np.pi * 1320 * t)) * 0.4 * ((t % 0.8) < 0.5) * (np.sin(2 * np.pi * 20 * t) > -0.2)
save_sfx('ring', ring)
# An alarm clock: four quick beeps.
n = int(1.0 * SR); t = t_of(n)
save_sfx('alarm', np.sin(2 * np.pi * 2000 * t) * ((t % 0.25) < 0.12) * 0.5)
# A tape rewinding.
n = int(1.0 * SR); t = t_of(n)
save_sfx('rewind', bp(rng.uniform(-1, 1, n), 800, 6000) * (0.4 + 0.6 * t) * np.minimum(1, (1 - t) * 8)
         + np.sin(2 * np.pi * np.cumsum(400 + 2600 * t) / SR) * 0.2)
# A rubber stamp.
n = int(0.3 * SR); t = t_of(n)
save_sfx('stamp', lp(rng.uniform(-1, 1, n), 1800) * np.exp(-t * 30) + np.sin(2 * np.pi * 90 * t) * np.exp(-t * 25))
print('day music and sound effects written to', os.path.abspath(OUT))
