// 所有修改專案的操作。每個函式就地修改傳入的草稿（由 store.apply 負責 clone），
// 因此這裡不處理不可變性，也不依賴 Vue。
import type {
  Attribute,
  ClassDiagram,
  Classifier,
  ClassifierKind,
  Diagram,
  Fragment,
  FragmentType,
  Id,
  InsertPos,
  Message,
  Operation,
  Point,
  Project,
  RelationKind,
  SeqItem,
  SequenceDiagram,
} from './types'

export const newId = (): Id => crypto.randomUUID()

export function emptyProject(): Project {
  return { version: 2, model: { elements: {}, relations: {} }, diagrams: [] }
}

const DEFAULT_NAMES: Record<ClassifierKind, string> = {
  class: 'Class',
  interface: 'Interface',
  enum: 'Enum',
}

// ---------- 分類元素 ----------

export function addElement(p: Project, kind: ClassifierKind, name = DEFAULT_NAMES[kind]): Id {
  const id = newId()
  p.model.elements[id] = { id, kind, name, attributes: [], operations: [] }
  return id
}

export function renameElement(p: Project, id: Id, name: string) {
  getElement(p, id).name = name
}

type MemberList = 'attributes' | 'operations'
type Member<L extends MemberList> = L extends 'attributes' ? Attribute : Operation

/** index 省略時加在最後 */
export function addMember<L extends MemberList>(p: Project, id: Id, list: L, member: Member<L>, index?: number) {
  const arr = getElement(p, id)[list] as Member<L>[]
  arr.splice(index ?? arr.length, 0, member)
}

export function updateMember<L extends MemberList>(p: Project, id: Id, list: L, index: number, member: Member<L>) {
  ;(getElement(p, id)[list] as Member<L>[])[index] = member
}

export function removeMember(p: Project, id: Id, list: MemberList, index: number) {
  getElement(p, id)[list].splice(index, 1)
}

/** 從模型刪除元素：連帶移除相連關係、所有類別圖上的節點（含 Note 連結、套件成員），並解除生命線綁定 */
export function deleteElement(p: Project, id: Id) {
  for (const r of Object.values(p.model.relations)) {
    if (r.sourceId === id || r.targetId === id) deleteRelation(p, r.id)
  }
  for (const d of p.diagrams) {
    if (d.type === 'class') {
      removeFromDiagram(p, d.id, [id])
    } else {
      for (const l of d.lifelines) if (l.elementId === id) delete l.elementId
    }
  }
  delete p.model.elements[id]
}

// ---------- 關係 ----------

/** 建立關係，並在指定的類別圖上顯示 */
export function addRelation(p: Project, kind: RelationKind, sourceId: Id, targetId: Id, diagramId?: Id): Id {
  const id = newId()
  p.model.relations[id] = { id, kind, sourceId, targetId }
  if (diagramId) getClassDiagram(p, diagramId).edges.push({ relationId: id })
  return id
}

export function deleteRelation(p: Project, id: Id) {
  delete p.model.relations[id]
  for (const d of p.diagrams) {
    if (d.type === 'class') d.edges = d.edges.filter((e) => e.relationId !== id)
  }
}

// ---------- 圖 ----------

export function addDiagram(p: Project, type: Diagram['type'], name: string): Id {
  const id = newId()
  p.diagrams.push(
    type === 'class'
      ? { id, type, name, nodes: [], edges: [], notes: [], packages: [] }
      : { id, type, name, lifelines: [], items: [] },
  )
  return id
}

export function renameDiagram(p: Project, id: Id, name: string) {
  getDiagram(p, id).name = name
}

export function deleteDiagram(p: Project, id: Id) {
  p.diagrams = p.diagrams.filter((d) => d.id !== id)
}

/** 把模型元素放到類別圖上，並自動帶入它與圖上既有元素之間的關係 */
export function addNode(p: Project, diagramId: Id, elementId: Id, x: number, y: number) {
  const d = getClassDiagram(p, diagramId)
  if (d.nodes.some((n) => n.elementId === elementId)) return
  d.nodes.push({ elementId, x, y })
  const onDiagram = new Set(d.nodes.map((n) => n.elementId))
  const shown = new Set(d.edges.map((e) => e.relationId))
  for (const r of Object.values(p.model.relations)) {
    const touches = r.sourceId === elementId || r.targetId === elementId
    if (touches && onDiagram.has(r.sourceId) && onDiagram.has(r.targetId) && !shown.has(r.id)) {
      d.edges.push({ relationId: r.id })
    }
  }
}

/** 註解連結的選取 id */
export const noteLinkId = (noteId: Id, elementId: Id) => `${noteId}>${elementId}`

/**
 * 只從這張圖移除（模型保留）。ids 可混合 elementId、relationId、noteId、packageId 與註解連結 id；
 * 移除節點時連帶移除接在它上的邊、Note 連結與套件成員。刪除套件只移除框，成員留在原位
 */
export function removeFromDiagram(p: Project, diagramId: Id, ids: Id[]) {
  const d = getClassDiagram(p, diagramId)
  const del = new Set(ids)
  d.nodes = d.nodes.filter((n) => !del.has(n.elementId))
  d.edges = d.edges.filter((e) => {
    const r = p.model.relations[e.relationId]
    return !!r && !del.has(e.relationId) && !del.has(r.sourceId) && !del.has(r.targetId)
  })
  d.notes = d.notes.filter((n) => !del.has(n.id))
  for (const n of d.notes) n.links = n.links.filter((el) => !del.has(el) && !del.has(noteLinkId(n.id, el)))
  d.packages = d.packages.filter((k) => !del.has(k.id))
  for (const k of d.packages) k.elementIds = k.elementIds.filter((el) => !del.has(el))
}

/** 移動節點、Note、套件；ids 可混合。套件連同成員移動，成員同時被選取時只移動一次 */
export function moveItems(p: Project, diagramId: Id, ids: Id[], dx: number, dy: number) {
  const d = getClassDiagram(p, diagramId)
  const sel = new Set(ids)
  const nodeIds = new Set(ids)
  for (const k of d.packages) {
    if (!sel.has(k.id)) continue
    k.x += dx
    k.y += dy
    for (const el of k.elementIds) nodeIds.add(el)
  }
  for (const n of [...d.nodes.filter((n) => nodeIds.has(n.elementId)), ...d.notes.filter((n) => sel.has(n.id))]) {
    n.x += dx
    n.y += dy
  }
}

// ---------- 類別圖：連線轉折點 ----------

export function setEdgeBends(p: Project, diagramId: Id, relationId: Id, bends: Point[]) {
  const e = getClassDiagram(p, diagramId).edges.find((x) => x.relationId === relationId)
  if (e) e.bends = bends
}

export function resetEdgeBends(p: Project, diagramId: Id, relationId: Id) {
  const e = getClassDiagram(p, diagramId).edges.find((x) => x.relationId === relationId)
  if (e) delete e.bends
}

// ---------- 類別圖：註解 ----------

export function addNote(p: Project, diagramId: Id, x: number, y: number, text = ''): Id {
  const id = newId()
  getClassDiagram(p, diagramId).notes.push({ id, text, x, y, links: [] })
  return id
}

export function setNoteText(p: Project, diagramId: Id, id: Id, text: string) {
  const n = getClassDiagram(p, diagramId).notes.find((x) => x.id === id)
  if (n) n.text = text
}

export function linkNote(p: Project, diagramId: Id, noteId: Id, elementId: Id) {
  const d = getClassDiagram(p, diagramId)
  const n = d.notes.find((x) => x.id === noteId)
  if (n && !n.links.includes(elementId) && d.nodes.some((x) => x.elementId === elementId)) n.links.push(elementId)
}

// ---------- 類別圖：套件 ----------

export function addPackage(p: Project, diagramId: Id, x: number, y: number, name = 'Package'): Id {
  const id = newId()
  getClassDiagram(p, diagramId).packages.push({ id, name, x, y, elementIds: [] })
  return id
}

export function renamePackage(p: Project, diagramId: Id, id: Id, name: string) {
  const k = getClassDiagram(p, diagramId).packages.find((x) => x.id === id)
  if (k) k.name = name
}

/** 讓元素只屬於 packageId（null = 離開所有套件） */
export function setPackageMembership(p: Project, diagramId: Id, elementId: Id, packageId: Id | null) {
  for (const k of getClassDiagram(p, diagramId).packages) {
    k.elementIds = k.elementIds.filter((el) => el !== elementId)
    if (k.id === packageId) k.elementIds.push(elementId)
  }
}

// ---------- 循序圖：生命線 ----------

export function addLifeline(p: Project, diagramId: Id, name: string, elementId?: Id, index?: number): Id {
  const d = getSequenceDiagram(p, diagramId)
  const id = newId()
  d.lifelines.splice(index ?? d.lifelines.length, 0, elementId ? { id, name, elementId } : { id, name })
  return id
}

export function renameLifeline(p: Project, diagramId: Id, id: Id, name: string) {
  findLifeline(getSequenceDiagram(p, diagramId), id).name = name
}

export function moveLifeline(p: Project, diagramId: Id, id: Id, toIndex: number) {
  const d = getSequenceDiagram(p, diagramId)
  const from = d.lifelines.findIndex((l) => l.id === id)
  const [l] = d.lifelines.splice(from, 1)
  d.lifelines.splice(Math.max(0, Math.min(toIndex, d.lifelines.length)), 0, l)
}

/** 刪除生命線，並刪除所有以它為發送或接收端的訊息；Note 不再覆蓋它，覆蓋全空的 Note 一併刪除 */
export function deleteLifeline(p: Project, diagramId: Id, id: Id) {
  const d = getSequenceDiagram(p, diagramId)
  d.lifelines = d.lifelines.filter((l) => l.id !== id)
  const prune = (items: SeqItem[]): SeqItem[] =>
    items.filter((it) => {
      if (it.kind === 'message') return it.from !== id && it.to !== id
      if (it.kind === 'note') {
        it.over = it.over.filter((l) => l !== id)
        return it.over.length > 0
      }
      for (const o of it.operands) o.items = prune(o.items)
      return true
    })
  d.items = prune(d.items)
}

/**
 * 依快速輸入的寫法找生命線，找不到就在最右側新增：
 * `A` 比對名稱（未命名但綁定類別者以類別名比對）；`A: Class` / `:Class` 比對名稱加綁定的類別，
 * 新增時若模型有該類別就綁定它
 */
export function ensureLifeline(p: Project, diagramId: Id, ref: string): Id {
  const d = getSequenceDiagram(p, diagramId)
  const clsName = (l: { elementId?: Id }) => (l.elementId ? p.model.elements[l.elementId]?.name : undefined)
  const colon = ref.indexOf(':')
  if (colon < 0) {
    const found = d.lifelines.find((l) => l.name === ref || (!l.name && clsName(l) === ref))
    return found ? found.id : addLifeline(p, diagramId, ref)
  }
  const name = ref.slice(0, colon).trim()
  const cls = ref.slice(colon + 1).trim()
  const found = d.lifelines.find((l) => l.name === name && clsName(l) === cls)
  if (found) return found.id
  const el = Object.values(p.model.elements).find((e) => e.name === cls)
  return el ? addLifeline(p, diagramId, name, el.id) : addLifeline(p, diagramId, name || cls)
}

// ---------- 循序圖：訊息與片段 ----------

export function insertMessage(p: Project, diagramId: Id, msg: Omit<Message, 'kind' | 'id'>, pos?: InsertPos): Id {
  const d = getSequenceDiagram(p, diagramId)
  const id = newId()
  insertAt(d, { kind: 'message', id, ...msg }, pos ?? { container: null, index: d.items.length })
  return id
}

export function insertNote(p: Project, diagramId: Id, over: Id[], text: string, pos?: InsertPos): Id {
  const d = getSequenceDiagram(p, diagramId)
  const id = newId()
  insertAt(d, { kind: 'note', id, text, over }, pos ?? { container: null, index: d.items.length })
  return id
}

export function setSeqNoteText(p: Project, diagramId: Id, id: Id, text: string) {
  const hit = findItem(getSequenceDiagram(p, diagramId).items, id)
  if (hit?.item.kind === 'note') hit.item.text = text
}

export function updateMessage(p: Project, diagramId: Id, id: Id, patch: Partial<Omit<Message, 'kind' | 'id'>>) {
  const hit = findItem(getSequenceDiagram(p, diagramId).items, id)
  if (hit?.item.kind === 'message') Object.assign(hit.item, patch)
}

/** 刪除訊息；對片段則是「解除」：移除框，內容依序留在原處 */
export function deleteItem(p: Project, diagramId: Id, id: Id) {
  const hit = findItem(getSequenceDiagram(p, diagramId).items, id)
  if (!hit) return
  const replacement = hit.item.kind === 'fragment' ? hit.item.operands.flatMap((o) => o.items) : []
  hit.list.splice(hit.index, 1, ...replacement)
}

/** 移動項目到 pos（pos 以移動前的位置計算） */
export function moveItem(p: Project, diagramId: Id, id: Id, pos: InsertPos) {
  const d = getSequenceDiagram(p, diagramId)
  const hit = findItem(d.items, id)
  if (!hit) return
  if (pos.container && hit.item.kind === 'fragment' && findItem([hit.item], pos.container.fragmentId)) return
  const target = containerList(d, pos.container)
  let index = pos.index
  if (target === hit.list && hit.index < index) index--
  hit.list.splice(hit.index, 1)
  target.splice(index, 0, hit.item)
}

/** 把同一層中連續的項目包成片段；不連續或不在同一層時回傳 null */
export function wrapInFragment(p: Project, diagramId: Id, ids: Id[], type: FragmentType, guard = ''): Id | null {
  const d = getSequenceDiagram(p, diagramId)
  const hits = ids.map((id) => findItem(d.items, id))
  if (!hits.length || hits.some((h) => !h || h.list !== hits[0]!.list)) return null
  const idx = hits.map((h) => h!.index).sort((a, b) => a - b)
  if (idx.some((v, i) => v !== idx[0] + i)) return null
  const list = hits[0]!.list
  const id = newId()
  const items = list.splice(idx[0], idx.length)
  list.splice(idx[0], 0, { kind: 'fragment', id, type, operands: [{ guard, items }] })
  return id
}

export function addOperand(p: Project, diagramId: Id, fragmentId: Id, guard = 'else') {
  getFragment(getSequenceDiagram(p, diagramId), fragmentId).operands.push({ guard, items: [] })
}

export function setGuard(p: Project, diagramId: Id, fragmentId: Id, operand: number, guard: string) {
  getFragment(getSequenceDiagram(p, diagramId), fragmentId).operands[operand].guard = guard
}

// ---------- 查詢輔助 ----------

export function getElement(p: Project, id: Id): Classifier {
  const el = p.model.elements[id]
  if (!el) throw new Error(`element not found: ${id}`)
  return el
}

export function getDiagram(p: Project, id: Id): Diagram {
  const d = p.diagrams.find((x) => x.id === id)
  if (!d) throw new Error(`diagram not found: ${id}`)
  return d
}

export function getClassDiagram(p: Project, id: Id): ClassDiagram {
  const d = getDiagram(p, id)
  if (d.type !== 'class') throw new Error(`not a class diagram: ${id}`)
  return d
}

export function getSequenceDiagram(p: Project, id: Id): SequenceDiagram {
  const d = getDiagram(p, id)
  if (d.type !== 'sequence') throw new Error(`not a sequence diagram: ${id}`)
  return d
}

function findLifeline(d: SequenceDiagram, id: Id) {
  const l = d.lifelines.find((x) => x.id === id)
  if (!l) throw new Error(`lifeline not found: ${id}`)
  return l
}

export interface ItemHit {
  item: SeqItem
  list: SeqItem[]
  index: number
  container: InsertPos['container']
}

export function findItem(items: SeqItem[], id: Id, container: InsertPos['container'] = null): ItemHit | null {
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (it.id === id) return { item: it, list: items, index: i, container }
    if (it.kind === 'fragment') {
      for (let o = 0; o < it.operands.length; o++) {
        const hit = findItem(it.operands[o].items, id, { fragmentId: it.id, operand: o })
        if (hit) return hit
      }
    }
  }
  return null
}

function getFragment(d: SequenceDiagram, id: Id): Fragment {
  const hit = findItem(d.items, id)
  if (hit?.item.kind !== 'fragment') throw new Error(`fragment not found: ${id}`)
  return hit.item
}

function containerList(d: SequenceDiagram, c: InsertPos['container']): SeqItem[] {
  return c ? getFragment(d, c.fragmentId).operands[c.operand].items : d.items
}

function insertAt(d: SequenceDiagram, item: SeqItem, pos: InsertPos) {
  containerList(d, pos.container).splice(pos.index, 0, item)
}

/** 緊接在某項目之後的插入位置 */
export function posAfter(d: SequenceDiagram, id: Id): InsertPos | null {
  const hit = findItem(d.items, id)
  return hit ? { container: hit.container, index: hit.index + 1 } : null
}
