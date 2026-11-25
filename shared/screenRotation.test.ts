// A screen's turn: the Rotate button a quarter at a time, and how far a TV turns the picture.
import { describe, expect, it } from 'vitest'
import { rotateOnce, rotationOf, screenTurn } from './screens'

describe('a screen’s turn', () => {
  it('is none on a screen from before there was one, or anything that isn’t a quarter turn', () => {
    expect(rotationOf({})).toBe(0)
    expect(rotationOf({ rotation: null })).toBe(0)
    expect(rotationOf({ rotation: 45 })).toBe(0)
    expect(rotationOf({ rotation: 270 })).toBe(270)
    expect(rotationOf({ rotation: -90 })).toBe(270)
    expect(rotationOf({ rotation: 450 })).toBe(90)
  })

  it('turns a quarter clockwise each time, and is upright again after four', () => {
    expect(rotateOnce(0)).toBe(90)
    expect(rotateOnce(90)).toBe(180)
    expect(rotateOnce(180)).toBe(270)
    expect(rotateOnce(270)).toBe(0)
  })

  it('goes on top of the quarter turn that stands a portrait screen upright on a landscape TV', () => {
    expect(screenTurn(0)).toBe(0)
    expect(screenTurn(180)).toBe(180)
    expect(screenTurn(0, 90)).toBe(90)
    expect(screenTurn(0, 270)).toBe(270)
    expect(screenTurn(90, 90)).toBe(180)
    expect(screenTurn(180, 270)).toBe(90)
    expect(screenTurn(90, 270)).toBe(0)
  })
})
