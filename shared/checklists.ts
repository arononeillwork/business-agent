// Daily checklists: what the team does to open the shop at the start of the day and to close it at the
// end, each thing in English and Spanish (each person reads it in the language they use the app in),
// some with steps under them. Everyone on the team reads them and ticks things off for the day; the
// next day starts clear. Admins change them. Easy Beans starts with the owners' own ("Employee
// Checklist", Google Drive), put in by the `day_checklists` migration (the test checks the two agree).
import { msg, type Language } from './i18n'
import { DAY_KEYS, type OpeningHours } from './types'

export type ChecklistList = 'opening' | 'closing'
export const CHECKLISTS: { id: ChecklistList; label: string }[] = [
  { id: 'opening', label: msg('Start of the day') },
  { id: 'closing', label: msg('End of the day') },
]
export const isChecklistList = (s: unknown): s is ChecklistList => s === 'opening' || s === 'closing'

export interface ChecklistItem {
  id: string
  list: ChecklistList
  /** The item it's a step of (steps have no steps of their own), or null. */
  parent_id: string | null
  /** What to do in English and in Spanish; at least one. */
  text_en: string | null
  text_es: string | null
  sort: number
}
export type ChecklistItemInput = Partial<Omit<ChecklistItem, 'id'>> & { id?: string }

/** Someone ticked a thing off for a day. */
export interface ChecklistTick { item_id: string; day: string; done_by: string | null; done_at: string }

/** The same limit as the database's. */
export const CHECKLIST_TEXT_MAX = 300

/** The words in a language: the other language's when it has none yet. */
export const itemText = (i: Pick<ChecklistItem, 'text_en' | 'text_es'>, lang: Language) =>
  (lang === 'es' ? i.text_es ?? i.text_en : i.text_en ?? i.text_es) ?? ''

/** What's wrong with an item before it's saved (the database says the same), or null. */
export function checklistItemProblem(i: Pick<ChecklistItemInput, 'text_en' | 'text_es'>): string | null {
  const en = (i.text_en ?? '').trim(), es = (i.text_es ?? '').trim()
  if (!en && !es) return msg('Write what to do, in English or Spanish')
  if (en.length > CHECKLIST_TEXT_MAX || es.length > CHECKLIST_TEXT_MAX) return msg('Keep it to 300 characters')
  return null
}

const bySort = (a: ChecklistItem, b: ChecklistItem) => a.sort - b.sort || a.id.localeCompare(b.id)

export interface ChecklistNode { item: ChecklistItem; steps: ChecklistItem[] }
/** One list's items in order, each with its steps in order. */
export function checklistTree(items: ChecklistItem[], list: ChecklistList): ChecklistNode[] {
  const mine = items.filter(i => i.list === list)
  return mine.filter(i => !i.parent_id).sort(bySort)
    .map(item => ({ item, steps: mine.filter(s => s.parent_id === item.id).sort(bySort) }))
}

/** What gets ticked: each item without steps, and each step (an item with steps is done when they all are). */
export const tickable = (tree: ChecklistNode[]) => tree.flatMap(n => (n.steps.length ? n.steps : [n.item]))

/** How much of a list is done. */
export function checklistProgress(tree: ChecklistNode[], ticked: ReadonlySet<string>) {
  const all = tickable(tree)
  return { done: all.filter(i => ticked.has(i.id)).length, total: all.length }
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/**
 * The list to open on at a time of day (HH:mm): the start of the day until halfway through the day's
 * opening hours, then the end of it; noon on a day without hours.
 */
export function checklistFor(date: string, time: string, hours: OpeningHours | null | undefined): ChecklistList {
  const day = hours?.[DAY_KEYS[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7]]
  let middle = 12 * 60
  if (day) {
    const open = minutes(day.open)
    let close = minutes(day.close)
    if (close <= open) close += 24 * 60
    middle = (open + close) / 2
  }
  return minutes(time) < middle ? 'opening' : 'closing'
}

/** A checklist as written: each thing in both languages, with its steps. */
export interface ChecklistPreset { en: string; es: string; steps?: { en: string; es: string }[] }

/**
 * Easy Beans' own, from the owners' "Employee Checklist": the English as written (tidied a little) and
 * the Spanish beside it. Clocking in and out was "coming soon" there; the app does it now.
 */
export const EASY_BEANS_CHECKLISTS: Record<ChecklistList, ChecklistPreset[]> = {
  opening: [
    { en: 'Open the 2 shutters', es: 'Abrir las 2 persianas' },
    { en: 'Turn off the alarm', es: 'Apagar la alarma' },
    { en: 'Take out and lay out the tables outside', es: 'Sacar y colocar las mesas afuera', steps: [
      { en: 'Make sure the fabric above is tight, but not too tight, as they are not the best', es: 'Asegurarse de que la tela de arriba esté bien tensa, pero no demasiado, ya que no es la mejor' },
      { en: 'Flower pots and menus on the tables, facing up in Spanish', es: 'Colocar las macetas y los menús en las mesas, en español y hacia arriba' },
      { en: 'Put one ashtray out the front of the café', es: 'Colocar un cenicero delante de la cafetería' },
    ] },
    { en: 'Turn on:', es: 'Encender:', steps: [
      { en: 'Coffee machine', es: 'Cafetera' },
      { en: 'Ice machine', es: 'Máquina de hielo' },
      { en: 'Lights under the counter', es: 'Luces debajo del mostrador' },
      { en: 'Till system', es: 'Sistema de caja' },
    ] },
    { en: 'Set up the awnings outside (front and back)', es: 'Instalar los toldos exteriores (delantero y trasero)' },
    { en: 'Clock in on the app', es: 'Fichar la entrada en la app' },
    { en: 'Turn on the lights for:', es: 'Encender las luces de:', steps: [
      { en: 'The front 2 fridges', es: 'Los 2 refrigeradores delanteros' },
      { en: 'The back 2 fridges', es: 'Los 2 refrigeradores traseros' },
      { en: 'The outside lights (logo light), from the fuse board (box of electrics)', es: 'Las luces exteriores (luz del logo), desde el cuadro eléctrico' },
      { en: 'The sign in front of the coffee machine', es: 'El letrero frente a la cafetera' },
      { en: 'Under the counter', es: 'Debajo del mostrador' },
    ] },
    { en: 'Check the stock of bakery items, and bake more if needed', es: 'Revisar el inventario de productos de panadería y hornear más si es necesario', steps: [
      { en: 'Turn the oven on to 175 degrees for 5 minutes', es: 'Precalentar el horno a 175 grados durante 5 minutos' },
      { en: 'Prep the pastries', es: 'Preparar los pasteles' },
      { en: 'Place the pastries on a tray (put the tray upside down)', es: 'Colocar los pasteles en una bandeja (con la bandeja boca abajo)' },
      { en: 'Start a timer for 18 minutes (check at 17 minutes)', es: 'Poner el temporizador 18 minutos (revisar a los 17 minutos)' },
      { en: 'Leave to rest for 5 minutes on the trays', es: 'Dejar reposar 5 minutos en las bandejas' },
    ] },
    { en: 'Stock the fridges with pastries', es: 'Reponer los refrigeradores con pasteles', steps: [
      { en: 'Make sure the sign words and prices are correct', es: 'Asegurarse de que los letreros y los precios sean correctos' },
    ] },
    { en: 'Stock check the fridges: soda and milk', es: 'Revisar el inventario de los refrigeradores: refrescos y leche', steps: [
      { en: 'Place an order if needed', es: 'Hacer un pedido si es necesario' },
    ] },
    { en: 'Put music on', es: 'Poner música' },
    { en: 'Stock check and update the system', es: 'Revisar el inventario y actualizar el sistema' },
    { en: 'Water the plants', es: 'Regar las plantas' },
    { en: 'Put the chalkboard sign out', es: 'Colocar el cartel de pizarra', steps: [
      { en: 'Update the message if needed', es: 'Actualizar el mensaje si es necesario' },
      { en: 'The sign always has to have a Spanish and an English message', es: 'El cartel siempre debe tener un mensaje en español y en inglés' },
    ] },
    { en: 'Check the toilets are clean, and clean them if needed', es: 'Revisar que los baños estén limpios y limpiarlos si es necesario' },
    { en: 'Check and clean the display fridges', es: 'Revisar y limpiar los refrigeradores de exhibición' },
    { en: 'Fill up the dog bowl and put it outside, on the corner', es: 'Llenar el bebedero del perro y colocarlo afuera, en la esquina' },
    { en: 'Cockroach sweep: kill and remove', es: 'Revisar si hay cucarachas y eliminarlas' },
    { en: 'Brush the front of the shop, in front of the shutter', es: 'Barrer la entrada de la tienda, delante de la persiana' },
    { en: 'Clean and wipe each table', es: 'Limpiar cada mesa' },
  ],
  closing: [
    { en: 'Make sure all the dishes are cleaned', es: 'Asegurarse de que todos los platos estén limpios' },
    { en: 'Restock the fridge drinks so that they are full', es: 'Reponer las bebidas del refrigerador hasta que esté lleno', steps: [
      { en: 'Check the stock levels and tell Mark what is needed', es: 'Revisar las existencias y decirle a Mark lo que se necesita' },
    ] },
    { en: 'Turn off the outside lights for the logo (at the back of the shop)', es: 'Apagar las luces exteriores del logo (en la parte trasera de la tienda)' },
    { en: 'Turn off the front display fridge light for the bakery items', es: 'Apagar la luz del refrigerador de exhibición delantero de los productos de panadería' },
    { en: 'Move the plant and everything else inside', es: 'Meter la planta y todo lo demás dentro' },
    { en: 'Turn off:', es: 'Apagar:', steps: [
      { en: 'Coffee machine', es: 'Cafetera' },
      { en: 'Grinder', es: 'Molinillo' },
      { en: 'Lights under the counter', es: 'Luces debajo del mostrador' },
      { en: 'Coffee station light', es: 'Luz de la estación de café' },
      { en: 'All fans and the AC', es: 'Todos los ventiladores y el aire acondicionado' },
      { en: 'The black extension lead under the smoothie machine desk', es: 'El cable alargador negro debajo del mostrador de la máquina de batidos' },
      { en: 'TV and music', es: 'TV y música' },
    ] },
    { en: 'Remove the bakery items from the front display unit', es: 'Retirar los productos de panadería del expositor delantero' },
    { en: 'Pull down both shutters', es: 'Bajar las dos persianas' },
    { en: 'Clock out on the app', es: 'Fichar la salida en la app' },
    { en: 'Turn on the alarm', es: 'Activar la alarma' },
  ],
}
