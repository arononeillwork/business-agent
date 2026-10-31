// Spanish for the Email page (the business's Gmail or Outlook as a list, with filters). Gmail's own
// Spanish names are used for its labels where there is one ("Destacados", "Importantes").
export default {
  // The chips (shared/email.ts), shown with tc('email', …) where the Spanish differs from elsewhere.
  'email|All': 'Todos',
  'email|Starred': 'Destacados',
  'email|Important': 'Importantes',
  'Unread': 'Sin leer',
  'Important': 'Importante',
  'With attachments': 'Con adjuntos',
  'Invoices & receipts': 'Facturas y recibos',
  'Customers & bookings': 'Clientes y reservas',
  'Last 90 days': 'Últimos 90 días',

  // How often it's read (Connections → How often things update).
  'Your email (Email page)': 'Tu correo (página Email)',
  'every 5 minutes': 'cada 5 minutos',
  'Each filter and search is kept 5 minutes, so going back and forth between them doesn’t read the mailbox again each time.':
    'Cada filtro y búsqueda se guarda 5 minutos, así que pasar de uno a otro no vuelve a leer el buzón cada vez.',

  // The page.
  'Open {mailbox}': 'Abrir {mailbox}',
  'Open in {mailbox}': 'Abrir en {mailbox}',
  'Connect Gmail or Outlook on Connections to see the business’s email here.':
    'Conecta Gmail u Outlook en Conexiones para ver aquí el correo del negocio.',
  '{mailbox} is connected to send email only. Allow Business Agent to read it too, to see the business’s email here. Nothing is changed or deleted in the mailbox.':
    '{mailbox} está conectado solo para enviar correos. Permite que Business Agent también lo lea para ver aquí el correo del negocio. No se cambia ni se borra nada del buzón.',
  'Filter emails': 'Filtrar correos',
  'Search {mailbox}': 'Buscar en {mailbox}',
  'Search email': 'Buscar en el correo',
  'From supplier': 'De un proveedor',
  'Anyone': 'Cualquiera',
  'Emails': 'Correos',
  'No emails match. Try All, a longer period or another search.': 'Ningún correo coincide. Prueba con Todos, un periodo más largo u otra búsqueda.',
  'No emails in this period.': 'No hay correos en este periodo.',
  'Show all emails': 'Ver todos los correos',
  'Show more': 'Mostrar más',
  '{supplier} has no email or website on the Suppliers page, so their emails can’t be found. Add one there.':
    '{supplier} no tiene email ni web en la página Proveedores, así que no se pueden encontrar sus correos. Añade uno allí.',
  'Emails are matched to suppliers by the email or website on the Suppliers page. None has one yet.':
    'Los correos se asocian a los proveedores por el email o la web de la página Proveedores. Ninguno tiene uno todavía.',
}
