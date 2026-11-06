// The demo's post ideas (Social planner → Ideas), with the `post_ideas` migration's rules: the whole team
// reads and adds them, says they'll make one, adds the photos or video and hands it in; only admins make
// the post from one, mark one done, give one to someone, or change or delete someone else's.
// Easy Beans starts with the owner's coffees idea, one Julio's making and one Maria handed in.
import type { Api } from './api'
import type { PostMedia } from '../../shared/types'
import { ideaProblem, type PostIdea } from '../../shared/postIdeas'

interface Who {
  isStaff: () => boolean; isAdmin: () => boolean; me: () => string | null
  /** Someone active on the team (an admin or an employee). */
  onTeam: (id: string) => boolean
  /** A post on the planner. */
  hasPost: (id: string) => boolean
  /** Google Drive or OneDrive is connected. */
  storage: () => boolean
  uid: () => string; nowIso: () => string
}
type IdeasApi = Pick<Api, 'postIdeas' | 'savePostIdea' | 'deletePostIdea' | 'uploadIdeaMedia'>

const clone = <T,>(x: T): T => structuredClone(x)
const refuse = (text: string): never => { throw new Error(text) }

export function demoPostIdeasApi(w: Who, seed: { aron: string; julio: string; maria: string; photo: string; hoursAgo: (h: number) => string }): IdeasApi {
  const idea = (p: Partial<PostIdea> & Pick<PostIdea, 'title'>, hours: number): PostIdea => ({
    id: w.uid(), details: null, wants: 'either', status: 'open', taken_by: null, media: [], post_id: null, created_by: seed.aron,
    created_at: seed.hoursAgo(hours), updated_at: seed.hoursAgo(hours), ...p })
  const ideas: PostIdea[] = [
    idea({ title: 'The coffees we have now', details: 'Puchero, Cocobrew and Santa Roaster’s decaf Colombia: the bags, a cup of each, and what each one tastes like.' }, 2),
    idea({ title: 'Opening up at 8', details: 'The first espresso of the day and the pastries going out.', wants: 'video', status: 'doing', taken_by: seed.julio, created_by: seed.maria }, 20),
    idea({ title: 'Our new autumn drinks', details: 'Pumpkin spice, chai and the ube latte on the counter.', wants: 'photo', status: 'ready', taken_by: seed.maria,
      media: [{ url: seed.photo, type: 'image' }] }, 48),
  ]
  const requireStaff = () => { if (!w.isStaff()) refuse('new row violates row-level security policy for table "post_ideas"') }

  return {
    async postIdeas() { return w.isStaff() ? clone(ideas).sort((a, b) => b.created_at.localeCompare(a.created_at)) : [] },
    async savePostIdea({ id, ...v }) {
      requireStaff()
      const me = w.me(), admin = w.isAdmin()
      const was = id ? ideas.find(x => x.id === id) : undefined
      if (id && !was) refuse('That idea isn’t here any more')
      const now = w.nowIso()
      const next: PostIdea = { ...(was ?? { id: w.uid(), title: '', details: null, wants: 'either', status: 'open', taken_by: null, media: [], post_id: null,
        created_by: me, created_at: now, updated_at: now }), ...v }
      next.title = next.title.trim()
      next.details = next.details?.trim() || null
      if (!admin) {
        if (next.post_id !== (was?.post_id ?? null)) refuse('Only an admin makes the post')
        if (next.status === 'done' && was?.status !== 'done') refuse('Only an admin marks an idea done')
        if (was?.status === 'done') refuse('This one’s done: an admin can open it again')
        if (next.taken_by !== (was?.taken_by ?? null) && ((next.taken_by && next.taken_by !== me) || (was?.taken_by && was.taken_by !== me))) refuse('Someone else is making this one')
        if (was && was.created_by !== me && (next.title !== was.title || next.details !== was.details || next.wants !== was.wants)) refuse('Only an admin or whoever added it changes the idea')
      } else {
        if (next.taken_by && next.taken_by !== was?.taken_by && !w.onTeam(next.taken_by)) refuse('Pick someone on the team')
        if (next.post_id && next.post_id !== was?.post_id) {
          if (!w.hasPost(next.post_id)) refuse('That post isn’t on the planner')
          next.status = 'done'
        }
      }
      if (next.status === 'doing' && !next.taken_by) next.status = 'open'
      const problem = ideaProblem(next)
      if (problem) refuse(problem)
      next.updated_at = now
      if (was) Object.assign(was, next)
      else ideas.unshift(next)
      return next.id
    },
    async deletePostIdea(id) {
      requireStaff()
      const i = ideas.findIndex(x => x.id === id)
      if (i < 0) return
      const x = ideas[i]
      if (!w.isAdmin() && (x.created_by !== w.me() || x.status !== 'open' || x.media.length)) refuse('Only an admin deletes an idea someone’s working on')
      ideas.splice(i, 1)
    },
    async uploadIdeaMedia(file): Promise<PostMedia> {
      if (!w.isStaff()) refuse('Only the team adds photos and videos to ideas')
      if (!w.storage()) refuse('Connect Google Drive or OneDrive on the Connections page to add photos and videos. They’re kept in its Business Agent folder.')
      if (!/^(image\/jpeg|video\/(mp4|quicktime))$/.test(file.type)) refuse('Use a JPEG photo, an MP4 or MOV video, or an MP3 or M4A track')
      return { url: URL.createObjectURL(file), type: file.type.startsWith('video/') ? 'video' : 'image' }
    },
  }
}
