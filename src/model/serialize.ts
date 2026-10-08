import type { Id, Project, SeqItem } from './types'

export const serialize = (p: Project) => JSON.stringify(p, null, 2)

export type ParseResult = { ok: true; project: Project; warnings: string[] } | { ok: false; error: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** 解析專案檔：結構不合格就拒絕；懸空參照則略過該項並回報 warning，不讓整份檔案打不開 */
export function parseProject(text: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: '檔案不是有效的 JSON' }
  }
  if (!isObj(data)) return { ok: false, error: '檔案內容不是專案物件' }
  if (data.version !== 1 && data.version !== 2) return { ok: false, error: `不支援的檔案版本：${String(data.version)}` }
  if (!isObj(data.model) || !isObj(data.model.elements) || !isObj(data.model.relations) || !Array.isArray(data.diagrams)) {
    return { ok: false, error: '專案結構不完整（缺少 model 或 diagrams）' }
  }
  // 版本 1 → 2：類別圖補上 notes / packages，其餘格式相同
  if (data.version === 1) {
    for (const d of data.diagrams) {
      if (isObj(d) && d.type === 'class') {
        d.notes = []
        d.packages = []
      }
    }
    data.version = 2
  }
  const diagramsOk = data.diagrams.every(
    (d) =>
      isObj(d) &&
      ((d.type === 'class' &&
        Array.isArray(d.nodes) &&
        Array.isArray(d.edges) &&
        Array.isArray(d.notes) &&
        Array.isArray(d.packages)) ||
        (d.type === 'sequence' && Array.isArray(d.lifelines) && Array.isArray(d.items))),
  )
  if (!diagramsOk) return { ok: false, error: '圖的結構不正確' }

  const p = data as unknown as Project
  const warnings: string[] = []
  const { elements, relations } = p.model

  for (const r of Object.values(relations)) {
    if (!elements[r.sourceId] || !elements[r.targetId]) {
      delete relations[r.id]
      warnings.push(`略過關係 ${r.id}：端點元素不存在`)
    }
  }
  for (const d of p.diagrams) {
    if (d.type === 'class') {
      d.nodes = d.nodes.filter((n) => {
        if (!elements[n.elementId]) warnings.push(`「${d.name}」略過不存在的元素 ${n.elementId}`)
        return !!elements[n.elementId]
      })
      const onDiagram = new Set(d.nodes.map((n) => n.elementId))
      d.edges = d.edges.filter((e) => {
        const r = relations[e.relationId]
        const ok = r && onDiagram.has(r.sourceId) && onDiagram.has(r.targetId)
        if (!ok) warnings.push(`「${d.name}」略過無效的連線 ${e.relationId}`)
        return ok
      })
      const keep = (ids: Id[], what: string) =>
        ids.filter((id) => {
          if (!onDiagram.has(id)) warnings.push(`「${d.name}」${what}略過圖上不存在的元素 ${id}`)
          return onDiagram.has(id)
        })
      for (const n of d.notes) n.links = keep(n.links, '註解連結')
      for (const k of d.packages) k.elementIds = keep(k.elementIds, `套件 ${k.name} `)
    } else {
      for (const l of d.lifelines) {
        if (l.elementId && !elements[l.elementId]) {
          delete l.elementId
          warnings.push(`「${d.name}」生命線 ${l.name} 綁定的元素不存在，已解除綁定`)
        }
      }
      const lifelines = new Set(d.lifelines.map((l) => l.id))
      const prune = (items: SeqItem[]): SeqItem[] =>
        items.filter((it) => {
          if (it.kind === 'fragment') {
            for (const o of it.operands) o.items = prune(o.items)
            return true
          }
          if (it.kind === 'note') {
            const over = it.over.filter((l) => lifelines.has(l))
            if (over.length < it.over.length) warnings.push(`「${d.name}」註解「${it.text}」略過不存在的生命線`)
            it.over = over
            return over.length > 0
          }
          const ok = lifelines.has(it.from) && lifelines.has(it.to)
          if (!ok) warnings.push(`「${d.name}」略過端點不存在的訊息 ${it.text}`)
          return ok
        })
      d.items = prune(d.items)
    }
  }
  return { ok: true, project: p, warnings }
}
