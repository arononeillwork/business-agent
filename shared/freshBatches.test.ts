import { describe, expect, it } from 'vitest'
import {
  batchFromItem, batchesOf, defaultDiscountAt, freshItemProblem, freshOfferPrice, freshProblem, freshState, goodUntil, likeLastTime, newFreshBatch, newFreshItem, onCounter, shelfShare,
  squareShelfChanges, type FreshBatch,
  madeHere, menuShelfLife, type FreshItem, NO_SECOND_DISCOUNT, NO_SECOND_OFFER, discountNow, defaultSecondAt, DISCOUNT_LEADS,
} from './freshBatches'

const at = (hhmm: string, day = '2026-09-30') => new Date(`${day}T${hhmm}:00Z`).toISOString()
const batch = (x: Partial<FreshBatch> = {}): FreshBatch => ({
  id: 'b1', name: 'Banana bread', recipe_id: null, quantity: 12, made_at: at('08:00'), shelf_life_hours: 24, good_until: at('08:00', '2026-10-01'),
  discount_at: at('02:00', '2026-10-01'), discount: 'percent', percent_off: 30, price: null, ...NO_SECOND_DISCOUNT, cleared: null, cleared_at: null, notes: null, made_by: null, ...x,
})

describe('freshly made', () => {
  it('keeps until it’s made plus its shelf life', () => {
    expect(goodUntil(at('08:00'), 8)).toBe(at('16:00'))
    expect(goodUntil(at('20:00'), 24)).toBe(at('20:00', '2026-10-01'))
  })

  it('starts its discount a quarter of its shelf life before the end, on the hour, never before it’s made', () => {
    expect(defaultDiscountAt(at('08:00'), 24)).toBe(at('02:00', '2026-10-01'))
    expect(defaultDiscountAt(at('08:20'), 8)).toBe(at('14:00'))
    expect(defaultDiscountAt(at('08:00'), 1)).toBe(at('08:00'))
  })

  it('says what stops it being saved', () => {
    const now = Date.parse(at('09:00'))
    const ok = { ...batch(), name: ' Banana bread ' }
    expect(freshProblem(ok, now)).toBeNull()
    expect(freshProblem({ ...ok, name: ' ' }, now)).toBe('Say what was made')
    expect(freshProblem({ ...ok, quantity: 0 }, now)).toBe('Say how many were made, or leave it empty')
    expect(freshProblem({ ...ok, shelf_life_hours: 0 }, now)).toBe('Its shelf life is between 1 hour and 30 days')
    expect(freshProblem({ ...ok, shelf_life_hours: 721 }, now)).toBe('Its shelf life is between 1 hour and 30 days')
    expect(freshProblem({ ...ok, made_at: at('22:00') }, now)).toBe('It can’t be made more than 12 hours from now')
    expect(freshProblem({ ...ok, discount_at: at('07:00') }, now)).toBe('Start the discount after it’s made and before its shelf life ends')
    expect(freshProblem({ ...ok, discount_at: at('08:00', '2026-10-01') }, now)).toBe('Start the discount after it’s made and before its shelf life ends')
    expect(freshProblem({ ...ok, percent_off: 95 }, now)).toBe('Take between 5% and 90% off')
    expect(freshProblem({ ...ok, discount: 'price', price: ' ' }, now)).toBe('Say the offer price, e.g. 2 for €3')
    // No discount: its kind and amount don't matter.
    expect(freshProblem({ ...ok, discount_at: null, percent_off: 0 }, now)).toBeNull()
  })

  it('is fresh, then its discount is coming, then on offer, then past; gone when sold out or thrown away', () => {
    const b = batch()
    expect(freshState(b, Date.parse(at('09:00')))).toBe('discount_soon')
    expect(freshState({ ...b, discount_at: null }, Date.parse(at('09:00')))).toBe('fresh')
    expect(freshState(b, Date.parse(at('03:00', '2026-10-01')))).toBe('on_offer')
    expect(freshState(b, Date.parse(at('08:00', '2026-10-01')))).toBe('past')
    expect(freshState({ ...b, cleared: 'sold' }, Date.parse(at('09:00')))).toBe('sold')
    expect(onCounter(b, Date.parse(at('03:00', '2026-10-01')))).toBe(true)
    expect(onCounter({ ...b, cleared: 'binned' }, Date.parse(at('09:00')))).toBe(false)
    expect(shelfShare(b, Date.parse(at('20:00')))).toBeCloseTo(0.5)
  })

  it('puts it on offer at a % off its menu price, or a set price', () => {
    expect(freshOfferPrice(batch(), 3.5)).toEqual({ price: '€2.45', was_price: '€3.50' })
    expect(freshOfferPrice(batch(), null)).toEqual({ price: '-30%', was_price: null })
    expect(freshOfferPrice(batch({ discount: 'price', price: '2 for €5' }), 3.5)).toEqual({ price: '2 for €5', was_price: '€3.50' })
  })

  it('starts the next batch of the same thing like the last one, moved to its time', () => {
    const last = batch({ shelf_life_hours: 8, good_until: at('16:00'), discount_at: at('14:00'), quantity: 10 })
    expect(likeLastTime(' banana BREAD', [last], at('09:00', '2026-10-01'))).toMatchObject({
      shelf_life_hours: 8, quantity: 10, percent_off: 30, discount_at: at('15:00', '2026-10-01'),
    })
    expect(likeLastTime('Brownies', [last], at('09:00'))).toBeNull()
    expect(likeLastTime('Banana bread', [batch({ discount_at: null })], at('09:00'))).toMatchObject({ discount_at: null })
  })

  it('offers the discount from 2 hours to 4 days before the end (no hour: too short to sell anything)', () => {
    expect(DISCOUNT_LEADS.map(l => l.hours)).toEqual([2, 4, 8, 24, 48, 72, 96])
  })

  it('takes a second, deeper discount: after the first, before the end', () => {
    // Keeps 5 days from Wed 08:00: 30% off from Fri 08:00, then 50% off from Sun 08:00, gone Mon 08:00.
    const b = batch({ shelf_life_hours: 120, good_until: at('08:00', '2026-10-05'), discount_at: at('08:00', '2026-10-02'),
      discount2_at: at('08:00', '2026-10-04'), percent_off2: 50 })
    const now = Date.parse(at('08:00'))
    expect(freshProblem(b, now)).toBeNull()
    expect(freshProblem({ ...b, discount2_at: at('07:00', '2026-10-02') }, now)).toBe('Start the second discount after the first and before its shelf life ends')
    expect(freshProblem({ ...b, discount2_at: at('09:00', '2026-10-05') }, now)).toBe('Start the second discount after the first and before its shelf life ends')
    expect(freshProblem({ ...b, discount_at: null }, now)).toBe('Start the second discount after the first and before its shelf life ends')
    expect(freshProblem({ ...b, percent_off2: 95 }, now)).toBe('Take between 5% and 90% off')
    expect(freshProblem({ ...b, discount2: 'price', price2: ' ' }, now)).toBe('Say the second offer price, e.g. 2 for €3')
    // Which is on: none, the first, then the second.
    expect(discountNow(b, Date.parse(at('08:00', '2026-10-01')))).toBeNull()
    expect(discountNow(b, Date.parse(at('08:00', '2026-10-03')))).toMatchObject({ stage: 1, percent_off: 30 })
    expect(discountNow(b, Date.parse(at('09:00', '2026-10-04')))).toMatchObject({ stage: 2, percent_off: 50 })
    // Added in the dialog: halfway between the first and the end, on the hour.
    expect(defaultSecondAt(b)).toBe(at('20:00', '2026-10-03'))
    // The next batch keeps both, each as far before its end as last time.
    expect(likeLastTime('Banana bread', [b], at('10:00', '2026-10-06'))).toMatchObject({
      discount_at: at('10:00', '2026-10-08'), discount2_at: at('10:00', '2026-10-10'), percent_off2: 50,
    })
  })

  it('starts a new one made now, keeping a day, 30% off for its last 6 hours', () => {
    const b = newFreshBatch(new Date(at('08:00')))
    expect(b).toMatchObject({ made_at: at('08:00'), shelf_life_hours: 24, discount_at: at('02:00', '2026-10-01'), percent_off: 30 })
    expect(freshProblem({ ...b, name: 'Brownies' }, Date.parse(at('08:00')))).toBeNull()
  })
})

describe('items made here, with a set shelf life', () => {
  const cheesecake = { recipe_id: 'r-cake', shelf_life_hours: 120, offer_hours: 48, discount: 'percent' as const, percent_off: 25, price: null }

  it('starts a batch from its item: its shelf life, and its offer that long before the end (the last 2 days of 5)', () => {
    expect(batchFromItem(cheesecake, at('08:00'))).toEqual({ recipe_id: 'r-cake', shelf_life_hours: 120, discount: 'percent', percent_off: 25, price: null,
      discount_at: at('08:00', '2026-10-03'), ...NO_SECOND_DISCOUNT })
    expect(batchFromItem({ ...cheesecake, offer_hours: null }, at('08:00')).discount_at).toBeNull()
  })

  it('and its second offer: 25% off for its last 2 days, then 50% off for its last day', () => {
    const deeper = { ...cheesecake, offer2_hours: 24, discount2: 'percent' as const, percent_off2: 50, price2: null }
    expect(batchFromItem(deeper, at('08:00'))).toMatchObject({ discount_at: at('08:00', '2026-10-03'), discount2_at: at('08:00', '2026-10-04'), percent_off2: 50 })
    // No first offer, no second.
    expect(batchFromItem({ ...deeper, offer_hours: null }, at('08:00')).discount2_at).toBeNull()
    expect(freshItemProblem(deeper)).toBeNull()
    expect(freshItemProblem({ ...deeper, offer2_hours: 48 })).toBe('Start the second offer after the first and before its shelf life ends')
    expect(freshItemProblem({ ...deeper, offer_hours: null })).toBe('Start the second offer after the first and before its shelf life ends')
    expect(freshItemProblem({ ...deeper, discount2: 'price', price2: '' })).toBe('Say the second offer price, e.g. 2 for €3')
  })

  it('says what stops an item being saved', () => {
    expect(freshItemProblem(cheesecake)).toBeNull()
    expect(freshItemProblem({ ...cheesecake, recipe_id: '' })).toBe('Pick an item from the menu')
    expect(freshItemProblem({ ...cheesecake, shelf_life_hours: 721 })).toBe('Its shelf life is between 1 hour and 30 days')
    expect(freshItemProblem({ ...cheesecake, offer_hours: 120 })).toBe('Start the offer before its shelf life ends')
    expect(freshItemProblem({ ...cheesecake, percent_off: 95 })).toBe('Take between 5% and 90% off')
    expect(freshItemProblem({ ...cheesecake, discount: 'price', price: ' ' })).toBe('Say the offer price, e.g. 2 for €3')
    expect(freshItemProblem({ ...cheesecake, offer_hours: null, discount: 'price', price: null })).toBeNull()
    expect(newFreshItem('r-1')).toMatchObject({ recipe_id: 'r-1', shelf_life_hours: 24, offer_hours: 4 })
  })

  it('finds its batches, newest first: linked to its menu item, or by its name', () => {
    const list = [batch({ id: 'a', name: 'Cheesecake', recipe_id: 'r-cake', made_at: at('08:00') }), batch({ id: 'b', name: 'biscoff cheesecake ', made_at: at('10:00') }),
      batch({ id: 'c', name: 'Biscoff cheesecake', recipe_id: 'r-other', made_at: at('11:00') }), batch({ id: 'd', name: 'Brownies' })]
    expect(batchesOf({ id: 'r-cake', name: 'Biscoff cheesecake' }, list).map(b => b.id)).toEqual(['b', 'a'])
  })

  it('takes Square’s shelf lives: new ones, changed ones (an offer that no longer fits goes), and those Square no longer has kept as set here', () => {
    const recipes = [{ id: 'r-cake', square_id: 'sq-cake' }, { id: 'r-chia', square_id: 'sq-chia' }, { id: 'r-swirl', square_id: 'sq-swirl' }, { id: 'r-own', square_id: null }]
    const items = [
      { id: 'f-chia', recipe_id: 'r-chia', shelf_life_hours: 72, offer_hours: 48, from_square: false },
      { id: 'f-swirl', recipe_id: 'r-swirl', shelf_life_hours: 24, offer_hours: 4, from_square: true },
      { id: 'f-own', recipe_id: 'r-own', shelf_life_hours: 24, offer_hours: null, from_square: false },
    ]
    const read = [{ square_id: 'sq-cake', shelf_life_hours: 120 }, { square_id: 'sq-chia', shelf_life_hours: 48 }, { square_id: 'sq-swirl', shelf_life_hours: null },
      { square_id: 'sq-gone', shelf_life_hours: 24 }]
    expect(squareShelfChanges(read, recipes, items)).toEqual({
      add: [{ recipe_id: 'r-cake', shelf_life_hours: 120, from_square: true }],
      change: [{ id: 'f-chia', patch: { shelf_life_hours: 48, from_square: true, offer_hours: null, offer2_hours: null } }],
      release: ['f-swirl'],
    })
    // Already in step: nothing to do.
    expect(squareShelfChanges([{ square_id: 'sq-swirl', shelf_life_hours: 24 }], recipes, items.slice(1, 2))).toEqual({ add: [], change: [], release: [] })
  })
})

describe('what the menu says is made here', () => {
  const item = (name: string, category: string | null, on_menu = true) => ({ name, category, on_menu })

  it('finds the menu’s perishables, keeping as long as they usually do', () => {
    // Pastries keep a day; parfaits and fresh fruit two; chia puddings and yoghurt pots three; cakes three; cheesecakes and brownies five.
    expect(menuShelfLife(item('Croissant', 'Bakery'))).toBe(24)
    expect(menuShelfLife(item('Pain au Chocolat', 'Bakery'))).toBe(24)
    expect(menuShelfLife(item('Roasted ham & cheese croissant', 'Kitchen'))).toBe(24)
    expect(menuShelfLife(item('Raisin Butter Swirl', 'Bakery'))).toBe(24)
    expect(menuShelfLife(item('Chia Fruit Parfait', 'Food'))).toBe(48)
    expect(menuShelfLife(item('Fruit can', 'Sweet/Savoury'))).toBe(48)
    expect(menuShelfLife(item('Mango chia pudding', 'Sweet/Savoury'))).toBe(72)
    expect(menuShelfLife(item('Promotional Postre Chia (Yoghurt)', null))).toBe(72)
    expect(menuShelfLife(item('Banana bread', null))).toBe(72)
    expect(menuShelfLife(item('Pistachio Cheesecake', 'Bakery'))).toBe(120)
    expect(menuShelfLife(item('Gluten Free Brownie', 'Bakery'))).toBe(120)
    // In Spanish, accents or not; and whatever else is in the bakery keeps a day.
    expect(menuShelfLife(item('Bollería del día', null))).toBe(24)
    expect(menuShelfLife(item('Tarta de queso', 'Postres'))).toBe(120)
    expect(menuShelfLife(item('Pan de plátano', 'Panadería'))).toBe(24)
    // Wherever it's filed: a croissant left in Coffee, a muffin in a section that's drinks and cakes.
    expect(menuShelfLife(item('Croissant', 'Coffee'))).toBe(24)
    expect(menuShelfLife(item('Blueberry muffin', 'Smoothies & cakes'))).toBe(72)
  })

  it('leaves out drinks, extras, deals, what’s made to order and what’s off the menu', () => {
    for (const [name, section] of [['Flat White', 'Classics'], ['Biscoff latte', 'Speciality'], ['Chocolate cake shake', 'Smoothies'], ['Matcha Latte', 'Speciality'],
      ['Granola', 'Extras'], ['Topping Sauce', 'Extras'], ['Cake And Coffee Promo', 'deals'], ['PROMO ( Croissant + Cafe)', 'Classics'], ['Croissant combo', null],
      ['Eggs on toast', 'Kitchen'], ['Bacon sandwich', 'Kitchen'], ['Acai Bowl', 'Food'], ['Coco Brew 1kg', null], ['Brownie', 'Cold drinks'],
      ['Cookie monster', 'Shakes'], ['Affogato', 'Coffee']] as const) {
      expect(menuShelfLife(item(name, section)), name).toBeNull()
    }
    expect(menuShelfLife(item('Chocolate Cake', 'Food', false))).toBeNull()
  })

  it('lists what’s set and on the list, and the menu’s perishables not set yet (taken off the list counts as set)', () => {
    const menu = [{ id: 'r-croissant', ...item('Croissant', 'Bakery') }, { id: 'r-parfait', ...item('Chia Fruit Parfait', 'Food') },
      { id: 'r-cake', ...item('Biscoff cheesecake', 'Sweet things') }, { id: 'r-flat', ...item('Flat white', 'Classics') }, { id: 'r-toastie', ...item('Toastie', 'Kitchen') }]
    const set = (recipe_id: string, x: Partial<FreshItem> = {}): FreshItem => ({ id: `f-${recipe_id}`, recipe_id, shelf_life_hours: 24, from_square: false, offer_hours: 4,
      discount: 'percent', percent_off: 30, price: null, ...NO_SECOND_OFFER, made_here: true, ...x })
    const items = [set('r-croissant'), set('r-cake', { made_here: false }), set('r-toastie', { shelf_life_hours: 8, offer_hours: null }), set('r-gone')]
    expect(madeHere(menu, items)).toEqual([
      { ...items[0], suggested: false },
      { ...items[2], suggested: false },
      { id: 'menu-r-parfait', recipe_id: 'r-parfait', shelf_life_hours: 48, from_square: false, offer_hours: null, discount: 'percent', percent_off: 30, price: null,
        ...NO_SECOND_OFFER, made_here: true, suggested: true },
    ])
    // Nothing set: the menu's perishables, no offer until one's set.
    expect(madeHere(menu, []).map(i => [i.recipe_id, i.shelf_life_hours, i.offer_hours])).toEqual([['r-croissant', 24, null], ['r-parfait', 48, null], ['r-cake', 120, null]])
  })
})
