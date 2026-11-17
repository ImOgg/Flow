// 三種圖共用的 Ctrl+C／X／V：剪貼簿與復原的規則在這裡，各圖只提供複製、刪除、貼上
import { clipIds } from '../model/ops'
import type { Clip, Id, Project } from '../model/types'
import { useEditorStore } from '../store/editor'
import { useProjectStore } from '../store/project'

/** 連續貼上每次多偏移的距離 */
const PASTE_OFFSET = 20

type ClipOf<T extends Clip['type']> = Extract<Clip, { type: T }>

/** 是 Ctrl/Cmd + C/X/V 就處理並回傳 true；呼叫端須先排除輸入框 */
export function handleClipboardKey<T extends Clip['type']>(
  e: KeyboardEvent,
  type: T,
  h: {
    copy: (p: Project) => ClipOf<T> | null
    remove: (p: Project, ids: Id[]) => void
    paste: (p: Project, clip: ClipOf<T>, offset: number) => Id[]
  },
): boolean {
  const key = e.key.toLowerCase()
  if (!(e.ctrlKey || e.metaKey) || e.altKey || !['c', 'x', 'v'].includes(key)) return false
  const store = useProjectStore()
  const ed = useEditorStore()
  if (key === 'v') {
    const clip = ed.clipboard
    if (clip?.type !== type) return true
    e.preventDefault()
    const offset = PASTE_OFFSET * ++ed.pasteCount
    const ids = store.apply((p) => h.paste(p, clip as ClipOf<T>, offset))
    ed.clear()
    ed.selection = ids
    return true
  }
  const clip = h.copy(store.project)
  if (!clip) return true
  e.preventDefault()
  ed.setClipboard(clip)
  if (key === 'x') {
    store.apply((p) => h.remove(p, clipIds(clip)))
    ed.clear()
  }
  return true
}
