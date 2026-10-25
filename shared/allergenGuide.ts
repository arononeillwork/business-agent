// What a stock item usually contains, from its name: the standard recipe of the things a café buys
// (a butter croissant is wheat flour, butter and eggs; oat milk has oats, so gluten unless it says
// gluten free), checked against the EU's 14 allergens (Regulation 1169/2011, Annex II) and the
// usual "may contain" warnings on those products. It suggests; an admin applies it on the Allergens
// page and checks it against the label or the supplier's sheet, since recipes differ.
import { msg } from './i18n'
import { dietsFor, type Allergen, type Diet } from './allergens'

export interface AllergenRule {
  /** Matched against the item's name, lower case and without accents (English or Spanish). */
  match: RegExp
  contains: Allergen[]
  may?: Allergen[]
  diet: Diet
  /** What it's usually made of, said plainly. */
  usually: string
}

// The first rule that matches wins, so the particular comes before the general (almond milk before
// milk, peanut butter before butter, almond croissant before croissant).
export const ALLERGEN_RULES: AllergenRule[] = [
  // Plant milks and other drinks with milk in the name.
  { match: /\b(oat|avena)\b.*\b(gluten[ -]?free|sin gluten)\b|\b(gluten[ -]?free|sin gluten)\b.*\b(oat|avena)\b/, contains: [], diet: 'vegan', usually: msg('Gluten-free oats, water, oil') },
  { match: /\b(oat|avena)\b.*\b(milk|drink|bebida|leche)\b|\b(bebida|leche) de avena\b|\boatly\b/, contains: ['gluten'], diet: 'vegan', usually: msg('Oats, water, rapeseed oil') },
  { match: /\b(almond|almendra)s?\b.*\b(milk|drink|bebida|leche)\b|\b(bebida|leche) de almendras?\b/, contains: ['nuts'], diet: 'vegan', usually: msg('Almonds, water') },
  { match: /\b(hazelnut|avellana|cashew|anacardo|macadamia|walnut|nuez|pistachio|pistacho)s?\b.*\b(milk|drink|bebida|leche)\b|\b(bebida|leche) de (avellana|anacardo|macadamia)s?\b/, contains: ['nuts'], diet: 'vegan', usually: msg('Nuts, water') },
  { match: /\b(soy|soya|soja)\b.*\b(milk|drink|bebida|leche)\b|\b(bebida|leche) de soja\b/, contains: ['soy'], diet: 'vegan', usually: msg('Soya beans, water') },
  { match: /\b(coconut|coco)\b.*\b(milk|drink|bebida|leche|cream|nata)\b|\b(bebida|leche) de coco\b/, contains: [], diet: 'vegan', usually: msg('Coconut, water (coconut isn’t one of the 14)') },
  { match: /\b(rice|arroz|pea|guisante)\b.*\b(milk|drink|bebida|leche)\b|\b(bebida|leche) de arroz\b/, contains: [], diet: 'vegan', usually: msg('Rice or peas, water, oil') },
  { match: /\b(peanut|cacahuete|mani)\b.*\b(butter|crema|spread)\b|\bpeanut\b/, contains: ['peanuts'], diet: 'vegan', usually: msg('Peanuts') },
  { match: /\b(almond|almendra|cashew|anacardo|hazelnut|avellana)\b.*\b(butter|crema|spread)\b/, contains: ['nuts'], diet: 'vegan', usually: msg('Nuts') },
  { match: /\b(nutella|nocilla)\b|\b(hazelnut|avellana)\b.*\b(cocoa|cacao|chocolate|spread|crema)\b/, contains: ['nuts', 'milk', 'soy'], diet: 'vegetarian', usually: msg('Sugar, palm oil, hazelnuts, skimmed milk powder, cocoa, soya lecithin') },
  { match: /\b(biscoff|lotus|speculoos)\b/, contains: ['gluten', 'soy'], diet: 'vegan', usually: msg('Wheat flour, sugar, vegetable oil, soya flour') },

  // Bakery: the particular pastries first.
  { match: /\b(almond|almendra)s?\b.*\b(croissant|cruasan)\b|\b(croissant|cruasan)\b.*\b(almond|almendra)s?\b/, contains: ['gluten', 'milk', 'eggs', 'nuts'], may: ['soy', 'sesame'], diet: 'vegetarian', usually: msg('Wheat flour, butter, eggs, almond cream') },
  { match: /\b(pistach|pistache|pistacho)\w*\b.*\b(croissant|cruasan)\b|\b(croissant|cruasan)\b.*\b(pistach|pistache|pistacho)\w*/, contains: ['gluten', 'milk', 'eggs', 'nuts'], may: ['soy', 'sesame'], diet: 'vegetarian', usually: msg('Wheat flour, butter, eggs, pistachio cream') },
  { match: /\bpain au chocolat\b|\bnapolitana\b|\b(chocolate|choco)\b.*\b(croissant|cruasan)\b/, contains: ['gluten', 'milk', 'eggs', 'soy'], may: ['nuts'], diet: 'vegetarian', usually: msg('Wheat flour, butter, eggs, chocolate (soya lecithin)') },
  { match: /\b(croissant|cruasan|viennoiserie|bolleria|danish|pain aux raisins|caracola)\w*/, contains: ['gluten', 'milk', 'eggs'], may: ['soy', 'nuts', 'sesame'], diet: 'vegetarian', usually: msg('Wheat flour, butter, eggs, yeast') },
  { match: /\bbrownie|\bblondie/, contains: ['gluten', 'milk', 'eggs', 'soy'], may: ['nuts'], diet: 'vegetarian', usually: msg('Chocolate, butter, eggs, sugar, wheat flour') },
  { match: /\b(cookie|galleta|biscuit)s?\b/, contains: ['gluten', 'milk', 'eggs', 'soy'], may: ['nuts', 'peanuts'], diet: 'vegetarian', usually: msg('Wheat flour, butter, sugar, eggs, chocolate') },
  { match: /\bbanana (bread|loaf)\b|\bpan de platano\b|\bcarrot cake\b|\btarta de zanahoria\b/, contains: ['gluten', 'milk', 'eggs'], may: ['nuts'], diet: 'vegetarian', usually: msg('Wheat flour, eggs, butter or oil, sugar') },
  { match: /\bcheesecake\b|\btarta de queso\b/, contains: ['gluten', 'milk', 'eggs'], may: ['nuts', 'soy'], diet: 'vegetarian', usually: msg('Cream cheese, eggs, sugar, a biscuit base') },
  { match: /\bpavlova\b|\bmeringue\b|\bmerengue\b/, contains: ['eggs', 'milk'], may: ['nuts'], diet: 'vegetarian', usually: msg('Egg whites, sugar, cream, fruit') },
  { match: /\b(milhojas|mille[ -]?feuille|eclair|profiterol\w*|choux)\b/, contains: ['gluten', 'milk', 'eggs'], may: ['nuts'], diet: 'vegetarian', usually: msg('Puff or choux pastry, butter, custard cream') },
  { match: /\b(tart|tarta|tartaleta|tartlet|quiche|pie)\b/, contains: ['gluten', 'milk', 'eggs'], may: ['nuts', 'soy'], diet: 'vegetarian', usually: msg('Shortcrust pastry (wheat flour, butter), eggs, cream') },
  { match: /\b(muffin|magdalena|cupcake|cake|bizcocho|sponge|donut|doughnut|rosquilla|scone|pancake|tortita|waffle|gofre|brioche|cinnamon roll|rollo de canela)s?\b/, contains: ['gluten', 'milk', 'eggs'], may: ['nuts', 'soy'], diet: 'vegetarian', usually: msg('Wheat flour, eggs, butter or milk, sugar') },
  { match: /\b(bagel)s?\b/, contains: ['gluten'], may: ['sesame', 'soy', 'milk'], diet: 'vegan', usually: msg('Wheat flour, water, yeast (seeds on top)') },
  { match: /\b(bread|pan|sourdough|masa madre|loaf|hogaza|baguette|barra|ciabatta|focaccia|toast|tostada|wrap|tortilla de trigo|pita|chapata|bollo|roll)s?\b/, contains: ['gluten'], may: ['sesame', 'soy', 'milk'], diet: 'vegan', usually: msg('Wheat flour, water, yeast, salt') },
  { match: /\b(granola|muesli)\b/, contains: ['gluten'], may: ['nuts', 'peanuts', 'sesame', 'soy', 'milk'], diet: 'vegetarian', usually: msg('Oats, honey, seeds, sometimes nuts') },
  { match: /\b(oats?|avena|porridge|copos de avena|oatmeal)\b/, contains: ['gluten'], diet: 'vegan', usually: msg('Oats (gluten unless labelled gluten free)') },
  { match: /\b(flour|harina)\b.*\b(almond|almendra)\b/, contains: ['nuts'], diet: 'vegan', usually: msg('Ground almonds') },
  { match: /\b(flour|harina|semolina|semola|couscous|cuscus|pasta|noodle|fideo|cracker)s?\b/, contains: ['gluten'], diet: 'vegan', usually: msg('Wheat') },

  // Dairy and eggs.
  { match: /\b(whey|suero)\b|\bprotein\b.*\b(milk|leche|whey)\b/, contains: ['milk'], may: ['soy'], diet: 'vegetarian', usually: msg('Milk protein') },
  { match: /\b(cheese|queso|mozzarella|cheddar|parmesan|parmigiano|feta|halloumi|ricotta|mascarpone|burrata|brie|manchego|philadelphia)\b/, contains: ['milk'], diet: 'vegetarian', usually: msg('Milk') },
  { match: /\b(milk|leche|lactose|lactosa|cream|nata|butter|mantequilla|yog(h)?urt|yogur|kefir|skyr|ice cream|helado|condensed|condensada|evaporated|evaporada|dulce de leche|custard|natillas|creme fraiche|whipped|montada)\b/, contains: ['milk'], diet: 'vegetarian', usually: msg('Milk') },
  { match: /\b(mayo|mayonnaise|mayonesa|aioli|alioli)\b/, contains: ['eggs'], may: ['mustard'], diet: 'vegetarian', usually: msg('Oil, egg yolk, vinegar, mustard') },
  { match: /\b(eggs?|huevos?)\b/, contains: ['eggs'], diet: 'vegetarian', usually: msg('Eggs') },

  // Chocolate and cocoa.
  { match: /\b(hot chocolate|chocolate caliente|cola cao|colacao|chocolate a la taza|drinking chocolate)\b/, contains: ['milk'], may: ['soy', 'gluten', 'nuts'], diet: 'vegetarian', usually: msg('Sugar, cocoa, milk powder') },
  { match: /\b(chocolate|choc)\b.*\b(sauce|salsa|syrup|sirope|topping)\b/, contains: ['milk'], may: ['soy', 'nuts'], diet: 'vegetarian', usually: msg('Sugar, cocoa, milk') },
  { match: /\b(white chocolate|chocolate blanco|milk chocolate|chocolate con leche)\b/, contains: ['milk', 'soy'], may: ['nuts', 'gluten'], diet: 'vegetarian', usually: msg('Sugar, cocoa butter, milk powder, soya lecithin') },
  { match: /\b(chocolate|choco|cacao nibs)\b/, contains: ['soy'], may: ['milk', 'nuts'], diet: 'vegetarian', usually: msg('Cocoa, sugar, soya lecithin (made where there’s milk)') },
  { match: /\b(cocoa|cacao)\b/, contains: [], diet: 'vegan', usually: msg('Cocoa') },

  // Coffee, tea and the bar.
  { match: /\bchai\b.*\b(powder|polvo|latte mix|mix)\b/, contains: ['milk'], diet: 'vegetarian', usually: msg('Sugar, milk powder, black tea, spices') },
  { match: /\bchai\b/, contains: [], diet: 'vegetarian', usually: msg('Black tea, spices, sugar, sometimes honey') },
  { match: /\b(caramel|caramelo)\b.*\b(sauce|salsa)\b|\b(toffee|butterscotch)\b/, contains: ['milk'], diet: 'vegetarian', usually: msg('Sugar, cream, butter') },
  { match: /\b(syrup|sirope|jarabe|monin|torani|1883)\b/, contains: [], diet: 'vegan', usually: msg('Sugar, water, flavouring') },
  { match: /\b(coffee|cafe|espresso|decaf|descafeinado|beans|grano|blend|cold brew|filter)\b/, contains: [], diet: 'vegan', usually: msg('Coffee') },
  { match: /\b(matcha|tea|te|infusion|tisana|rooibos|camomile|manzanilla|hojicha|earl grey|chamomile)\b/, contains: [], diet: 'vegan', usually: msg('Tea leaves') },
  { match: /\b(honey|miel)\b/, contains: [], diet: 'vegetarian', usually: msg('Honey') },
  { match: /\b(sugar|azucar|sweetener|edulcorante|stevia|agave|maple|arce|panela)\b/, contains: [], diet: 'vegan', usually: msg('Sugar') },
  { match: /\b(beer|cerveza|lager|ale)\b/, contains: ['gluten'], diet: 'vegan', usually: msg('Barley, hops, water') },
  { match: /\b(wine|vino|cava|prosecco|champagne|sangria|vermut|vermouth|cider|sidra)\b/, contains: ['sulphites'], diet: 'vegetarian', usually: msg('Grapes or apples (sulphites added)') },
  { match: /\b(water|agua|soda|tonic|tonica|cola|coke|lemonade|limonada|juice|zumo|kombucha|smoothie|batido de fruta)\b/, contains: [], diet: 'vegan', usually: msg('Water, fruit, sugar') },

  // Meat, fish and other food.
  { match: /\b(prawn|gamba|langostino|shrimp|crab|cangrejo|lobster|bogavante)s?\b/, contains: ['crustaceans'], diet: 'neither', usually: msg('Shellfish') },
  { match: /\b(mussel|mejillon|clam|almeja|squid|calamar|octopus|pulpo)\w*\b/, contains: ['molluscs'], diet: 'neither', usually: msg('Molluscs') },
  { match: /\b(tuna|atun|salmon|anchov\w*|anchoa|boqueron|cod|bacalao|sardin\w*|fish|pescado)\b/, contains: ['fish'], diet: 'neither', usually: msg('Fish') },
  { match: /\b(ham|jamon|bacon|beicon|chicken|pollo|turkey|pavo|chorizo|salami|salchich\w*|sausage|lomo|pork|cerdo|beef|ternera|serrano|iberico|pastrami|pepperoni)\b/, contains: [], may: ['milk', 'soy'], diet: 'neither', usually: msg('Meat') },
  { match: /\b(hummus|humus|tahini|tahin)\b/, contains: ['sesame'], diet: 'vegan', usually: msg('Chickpeas, sesame paste, lemon') },
  { match: /\b(sesame|sesamo)\b/, contains: ['sesame'], diet: 'vegan', usually: msg('Sesame seeds') },
  { match: /\b(tofu|tempeh|edamame|miso)\b/, contains: ['soy'], diet: 'vegan', usually: msg('Soya beans') },
  { match: /\b(soy sauce|salsa de soja|tamari)\b/, contains: ['soy', 'gluten'], diet: 'vegan', usually: msg('Soya beans, wheat, salt') },
  { match: /\b(mustard|mostaza)\b/, contains: ['mustard'], diet: 'vegan', usually: msg('Mustard seeds, vinegar') },
  { match: /\b(pesto)\b/, contains: ['milk', 'nuts'], diet: 'vegetarian', usually: msg('Basil, cheese, pine nuts or cashews, oil') },
  { match: /\b(celery|apio|celeriac)\b/, contains: ['celery'], diet: 'vegan', usually: msg('Celery') },
  { match: /\b(raisin|pasa|sultana|dried apricot|orejones|dried fruit|fruta deshidratada|fruta seca)s?\b/, contains: ['sulphites'], diet: 'vegan', usually: msg('Dried fruit (often kept with sulphites)') },
  { match: /\b(nutmeg|nuez moscada)\b/, contains: [], diet: 'vegan', usually: msg('Seasoning') },
  { match: /\b(almond|almendra|hazelnut|avellana|walnut|nuez|nueces|cashew|anacardo|pecan|pecana|pistachio|pistacho|macadamia|brazil nut|praline|nut|frutos secos)s?\b/, contains: ['nuts'], diet: 'vegan', usually: msg('Tree nuts') },
  { match: /\b(lupin|altramuz)\w*/, contains: ['lupin'], diet: 'vegan', usually: msg('Lupin') },
  { match: /\b(chia|flax|linaza|sunflower|girasol|pumpkin seed|pipas|seeds|semillas|quinoa|rice|arroz|coconut|coco)\b/, contains: [], diet: 'vegan', usually: msg('Seeds or grains') },
  { match: /\b(acai|banana|platano|strawberr\w*|fresa|blueberr\w*|arandano|raspberr\w*|frambuesa|berry|berries|frutos rojos|mango|pineapple|pina|avocado|aguacate|lemon|limon|lime|lima|orange|naranja|apple|manzana|kiwi|passion fruit|maracuya|pitaya|dragon fruit|peach|melocoton|melon|watermelon|sandia|grape|uva|pear|pera|fig|higo|pomegranate|granada|cherry|cereza|fruit|fruta)s?\b/, contains: [], diet: 'vegan', usually: msg('Fruit') },
  { match: /\b(spinach|espinaca|kale|lettuce|lechuga|rocket|rucula|tomato|tomate|cucumber|pepino|carrot|zanahoria|onion|cebolla|pepper|pimiento|beetroot|remolacha|ginger|jengibre|mint|menta|basil|albahaca|herb|hierba|garlic|ajo|potato|patata|courgette|calabacin|mushroom|champinon|seta|vegetable|verdura)s?\b/, contains: [], diet: 'vegan', usually: msg('Vegetables') },
  { match: /\b(jam|mermelada|compote|compota|fruit puree|pure de fruta)\b/, contains: [], diet: 'vegan', usually: msg('Fruit, sugar') },
  { match: /\b(salt|sal|pepper|pimienta|cinnamon|canela|vanilla|vainilla|spice|especia|turmeric|curcuma|cardamom|cardamomo|nutmeg|nuez moscada|oil|aceite|vinegar|vinagre|ice|hielo)\b/, contains: [], diet: 'vegan', usually: msg('Seasoning') },
]

// Things a café buys that aren't eaten: no allergens to enter.
const NOT_FOOD_CATEGORIES = ['Packaging', 'Cleaning']
const NOT_FOOD = /\b(cup|vaso|lid|napkin|servilleta|straw|pajita|tote|glove|guante|detergent|detergente|soap|jabon|bleach|lejia|sponge|esponja|label|etiqueta|sleeve|stirrer|removedor|cutlery|cubierto|fork|tenedor|spoon|cuchara|knife|cuchillo|filter paper|bin bag|bin liner|bolsa de basura|kitchen roll|toilet roll|papel higienico|sanitiser|sanitizer|desinfectante|mug|t-shirt|camiseta|candle|vela|paper bag|bolsa de papel|carrier bag|takeaway box|caja para llevar)(e?s)?\b/

const unaccented = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Is it eaten or drunk (so it has allergens to enter)? Cups, napkins and cleaning things aren't. */
export function isFoodItem(item: { name: string; category: string | null }) {
  if (item.category && NOT_FOOD_CATEGORIES.includes(item.category)) return false
  return !NOT_FOOD.test(unaccented(item.name))
}

export interface AllergenSuggestion { contains: Allergen[]; may: Allergen[]; diet: Diet; usually: string }

/** What an item usually contains, from its name; null when it's not food or there's nothing to go on. */
export function suggestAllergens(item: { name: string; category: string | null }): AllergenSuggestion | null {
  if (!isFoodItem(item)) return null
  const name = unaccented(item.name)
  const rule = ALLERGEN_RULES.find(r => r.match.test(name))
  if (!rule) return null
  const contains = [...rule.contains].sort()
  const may = (rule.may ?? []).filter(a => !contains.includes(a)).sort()
  // Never a diet the allergens rule out (the database refuses one: stock_items_diet_fits).
  const diet = dietsFor(contains).includes(rule.diet) ? rule.diet : dietsFor(contains)[0]
  return { contains, may, diet, usually: rule.usually }
}
