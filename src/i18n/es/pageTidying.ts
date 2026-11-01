// Spanish for the owner's November round: inactive roles, automatic tracking on Timecards, the main suppliers
// on Invoices, the website shown on Website & SEO, and the bank holiday reminders' choices.
export default {
  // Roles & responsibilities → Inactive (a role, a puesto: masculine).
  'roles|Inactive ({n})': 'Inactivos ({n})',
  'roles|Inactive': 'Inactivo',
  '{name} moved to Inactive': '{name} pasa a Inactivos',
  'Inactive roles': 'Puestos inactivos',
  'No inactive roles. A role that isn’t in use right now moves here from Active, with its duties kept.':
    'No hay puestos inactivos. Un puesto que ahora no se usa pasa aquí desde Activos, con sus tareas guardadas.',
  'Make {name} active': 'Activar {name}',
  'Make active': 'Activar',
  'Make {name} inactive': 'Pasar {name} a inactivos',
  'Make inactive': 'Pasar a inactivos',
  // Timecards.
  'Automatic tracking': 'Registro automático',
  'Automatic tracking is on': 'Registro automático activado',
  'Automatic tracking is off': 'Registro automático desactivado',
  'On: anyone on the rota who doesn’t clock in has their timecard filled from the rota overnight, marked for you to check.':
    'Activado: si alguien del cuadrante no ficha, su fichaje se rellena desde el cuadrante por la noche, marcado para que lo revises.',
  'Off: only clock-ins make timecards; missing ones are added by hand or with Fill from rota.':
    'Desactivado: solo los fichajes crean registros; los que falten se añaden a mano o con Completar desde el cuadrante.',
  // Invoices.
  'Main suppliers': 'Proveedores principales',
  // Website & SEO.
  'The website': 'La web',
  'Show it as': 'Verla como',
  'Reload': 'Recargar',
  'Open in a new tab': 'Abrir en una pestaña nueva',
  'As it is now: check that a change made here (opening hours, the menu, the details) has reached it. If it stays blank, the website doesn’t let itself be shown inside another site: open it in a new tab.':
    'Tal como está ahora: comprueba que un cambio hecho aquí (el horario, la carta, los datos) ha llegado. Si se queda en blanco, la web no deja mostrarse dentro de otra: ábrela en una pestaña nueva.',
  'The website: {site}': 'La web: {site}',
  // Notifications → Bank holiday reminders.
  'Which holidays': 'Qué festivos',
} satisfies Record<string, string>
