// Photos and videos picked in the browser, made ready for posting before they're uploaded:
// photos become JPEG (the only kind Instagram takes), no wider than 1440 px (Instagram's own
// size), and feed photos are cropped to a shape Instagram accepts (between 4:5 and 1.91:1).
import { MAX_PHOTO_BYTES, MAX_VIDEO_BYTES, feedCrop } from '../../shared/social'

const VIDEO = /^video\/(mp4|quicktime)$/

/** A photo as a JPEG ready to post; `crop`: fit Instagram's feed shapes (posts and carousels). `maxWidth`: bigger for printing (a menu). */
export async function readyPhoto(file: File, crop: boolean, maxWidth = 1440): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('That isn’t a photo')
  const img = await createImageBitmap(file).catch(() => { throw new Error('That photo can’t be read here. Use a JPEG or PNG.') })
  const area = crop ? feedCrop(img.width, img.height) : { width: img.width, height: img.height }
  const scale = Math.min(1, maxWidth / area.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(area.width * scale)
  canvas.height = Math.round(area.height * scale)
  const g = canvas.getContext('2d')!
  // Cropped from the middle.
  g.drawImage(img, (img.width - area.width) / 2, (img.height - area.height) / 2, area.width, area.height, 0, 0, canvas.width, canvas.height)
  img.close()
  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.9))
  if (!blob) throw new Error('That photo can’t be read here. Use a JPEG or PNG.')
  if (blob.size > MAX_PHOTO_BYTES) throw new Error('That photo is too big (over 8 MB). Try a smaller one.')
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
}

/** A video's length in seconds (null when the browser can't tell). */
export function videoSeconds(file: File): Promise<number | null> {
  return new Promise(resolve => {
    const v = document.createElement('video')
    const url = URL.createObjectURL(file)
    const done = (n: number | null) => { URL.revokeObjectURL(url); resolve(n) }
    v.preload = 'metadata'
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null)
    v.onerror = () => done(null)
    v.src = url
  })
}

/** A video checked for posting: MP4 or MOV, up to 100 MB. */
export function readyVideo(file: File): File {
  if (!VIDEO.test(file.type)) throw new Error('Use an MP4 or MOV video')
  if (file.size > MAX_VIDEO_BYTES) throw new Error('That video is too big (over 100 MB). Trim it or export it smaller.')
  return file
}
