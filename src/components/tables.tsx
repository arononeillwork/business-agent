import { Button, ListItemIcon, ListItemText, Menu, MenuItem, TableCell, TableSortLabel, type TableCellProps } from '@mui/material'
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined'
import ExpandIcon from '@mui/icons-material/ExpandMore'
import ExcelIcon from '@mui/icons-material/GridOnOutlined'
import CsvIcon from '@mui/icons-material/DescriptionOutlined'
import PdfIcon from '@mui/icons-material/PictureAsPdfOutlined'
import CopyIcon from '@mui/icons-material/ContentCopyOutlined'
import CloudUploadIcon from '@mui/icons-material/CloudUploadOutlined'
import { useMemo, useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { copyTsv, csvContent, exportCsv, exportXlsx, printPdf, type ExportTable } from '../lib/export'
import { formatMoney } from '../../shared/time'

// ---------------------------------------------------------------------------------------------
// Sorting: click a column heading to sort by it, click again to reverse.
// ---------------------------------------------------------------------------------------------

export type SortDir = 'asc' | 'desc'
type SortValue = string | number | boolean | null | undefined
export interface Sort { by: string | null; dir: SortDir; toggle: (key: string) => void }

const blank = (v: SortValue) => v === null || v === undefined || v === ''
const compare = (a: SortValue, b: SortValue) => {
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  return Number(a) - Number(b)
}

/**
 * Rows in the order the person picked. `by` gives each sortable column's value; a column sorts
 * ascending first, and the keys in `descFirst` (amounts, dates) start biggest or newest first.
 */
export function useSort<T>(rows: T[], by: Record<string, (r: T) => SortValue>, initial?: { by: string; dir: SortDir }, descFirst: string[] = []) {
  const [state, setState] = useState<{ by: string | null; dir: SortDir }>(initial ?? { by: null, dir: 'asc' })
  const get = state.by ? by[state.by] : undefined
  const sorted = useMemo(() => {
    if (!get) return rows
    const sign = state.dir === 'asc' ? 1 : -1
    // Blanks always go last, whichever way round.
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b)
      if (blank(x) || blank(y)) return Number(blank(x)) - Number(blank(y))
      return sign * compare(x, y)
    })
  }, [rows, state.dir, get])
  const toggle = (key: string) => setState(s => (s.by === key
    ? { by: key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
    : { by: key, dir: descFirst.includes(key) ? 'desc' : 'asc' }))
  return { rows: sorted, sort: { ...state, toggle } satisfies Sort }
}

/** A column heading with the sort arrow. */
export function SortCell({ sort, id, children, ...cell }: { sort: Sort; id: string; children: ReactNode } & Omit<TableCellProps, 'id' | 'children'>) {
  const active = sort.by === id
  return (
    <TableCell {...cell} sortDirection={active ? sort.dir : false}>
      <TableSortLabel active={active} direction={active ? sort.dir : 'asc'} onClick={() => sort.toggle(id)}>{children}</TableSortLabel>
    </TableCell>
  )
}

// ---------------------------------------------------------------------------------------------
// Export: one button, a menu of formats.
// ---------------------------------------------------------------------------------------------

/** "Export" with Excel, CSV, PDF, copy for Google Sheets, and (when connected) save to Drive or OneDrive. */
export function ExportButton({ table, disabled, folder }: { table: () => ExportTable; disabled?: boolean; folder?: string }) {
  const { api, isAdmin } = useApp()
  const run = useAction()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const links = useAsync('integrations', () => (isAdmin ? api.integrations() : Promise.resolve(null)), [])
  const storage = folder ? links.data?.integrations.find(i => (i.provider === 'google_drive' || i.provider === 'onedrive') && i.status === 'connected') : undefined
  const where = storage?.provider === 'onedrive' ? 'OneDrive' : 'Google Drive'
  const pick = (f: () => void | Promise<void>, done?: string) => { setAnchor(null); void run(async () => { await f() }, done) }
  const item = (icon: ReactNode, label: string, hint: string, onClick: () => void) => (
    <MenuItem onClick={onClick}>
      <ListItemIcon>{icon}</ListItemIcon>
      <ListItemText primary={label} secondary={hint} />
    </MenuItem>
  )
  return (
    <>
      <Button variant="outlined" startIcon={<DownloadIcon />} endIcon={<ExpandIcon />} disabled={disabled}
        onClick={e => setAnchor(e.currentTarget)} aria-haspopup="menu" aria-expanded={!!anchor}>
        Export
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 240, borderRadius: '14px' } } }}>
        {item(<ExcelIcon fontSize="small" />, 'Excel', '.xlsx spreadsheet', () => pick(() => exportXlsx(table())))}
        {item(<CsvIcon fontSize="small" />, 'CSV', 'For any spreadsheet or accounts app', () => pick(() => exportCsv(table())))}
        {item(<PdfIcon fontSize="small" />, 'PDF', 'Print, or save as PDF', () => pick(() => printPdf(table(), formatMoney)))}
        {item(<CopyIcon fontSize="small" />, 'Copy', 'Paste into Google Sheets or Numbers', () => pick(() => copyTsv(table()), 'Copied: paste it into a spreadsheet'))}
        {storage && item(<CloudUploadIcon fontSize="small" />, `Save to ${storage.provider === 'onedrive' ? 'OneDrive' : 'Drive'}`, 'As a CSV file', () => pick(async () => {
          const t = table()
          const r = await api.saveFile({ folder: folder!, name: `${t.filename}.csv`, content: csvContent(t), type: 'text/csv;charset=utf-8' })
          window.open(r.link, '_blank', 'noopener')
        }, `Saved to ${where} › Business Agent › ${folder}`))}
      </Menu>
    </>
  )
}
