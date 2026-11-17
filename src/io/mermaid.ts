// Mermaid flowchart 文字解析成中介結構：逐行處理，每行由左往右掃描。不依賴 Vue，也不知道座標
import type { FlowShape } from '../model/types'

/** TB 解析時正規化成 TD */
export type Direction = 'TD' | 'LR' | 'RL' | 'BT'

export interface MermaidFlow {
  title: string | null
  direction: Direction
  /** 依第一次出現的順序；id 為 Mermaid 原本的 id */
  nodes: { id: string; shape: FlowShape; text: string }[]
  edges: { from: string; to: string; label: string }[]
  subgraphs: { title: string; nodeIds: string[] }[]
}

export type ParseResult = { ok: true; flow: MermaidFlow } | { ok: false; error: string }

const HEADER = /^(flowchart|graph)(?:\s+(TD|TB|LR|RL|BT))?$/
const SKIP = /^(style|classDef|class|linkStyle|click|direction)\b/
const ID = /[\p{L}\p{N}_]+/uy
const CLASS_SUFFIX = /:::[\w-]+/y
const AMP = /\s*&\s*/y
// 「-- 標籤 -->」類寫法，或一般連線後接「|標籤|」
const LINK =
  /\s*(?:[<ox]?(?:--|==|-\.)\s+(.+?)\s*(?:-{2,}|={2,}|\.-+)[>ox]?|[<ox]?(?:-{2,}|={2,}|-\.+-|~{3,})[>ox]?(?:\s*\|([^|]*)\|)?)\s*/y
const QUOTED = /\s*"([^"]*)"\s*/y

/** 開頭記號依長度由長到短比對；結尾可有多種寫法 */
const SHAPES: [string, string[], FlowShape][] = [
  ['([', ['])'], 'terminal'],
  ['((', ['))'], 'terminal'],
  ['[(', [')]'], 'database'],
  ['[/', ['/]', '\\]'], 'io'],
  ['[\\', ['\\]', '/]'], 'io'],
  ['{{', ['}}'], 'process'],
  ['[[', [']]'], 'process'],
  ['[', [']'], 'process'],
  ['{', ['}'], 'decision'],
  ['(', [')'], 'process'],
  ['>', [']'], 'process'],
]

/** 去掉外層引號，<br> 轉成換行 */
const clean = (s: string) =>
  s
    .trim()
    .replace(/^"([\s\S]*)"$/, '$1')
    .replace(/<br\s*\/?>/gi, '\n')

const stick = (re: RegExp, s: string, at: number) => {
  re.lastIndex = at
  return re.exec(s)
}

export function parseMermaidFlowchart(text: string): ParseResult {
  let lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => !l.startsWith('```'))

  // frontmatter
  let title: string | null = null
  const first = lines.findIndex((l) => l)
  if (lines[first] === '---') {
    const close = lines.indexOf('---', first + 1)
    if (close > 0) {
      for (const l of lines.slice(first + 1, close)) {
        const m = /^title:\s*(.+)$/.exec(l)
        if (m) title = clean(m[1]) || null
      }
      lines = lines.slice(close + 1)
    }
  }

  lines = lines.filter((l) => l && !l.startsWith('%%')).map((l) => l.replace(/;+$/, '').trim())
  const header = HEADER.exec(lines[0] ?? '')
  if (!header) return { ok: false, error: '目前只支援流程圖' }
  const dir = header[2] ?? 'TD'
  const direction: Direction = dir === 'TB' ? 'TD' : (dir as Direction)

  const nodes = new Map<string, MermaidFlow['nodes'][number]>()
  const explicit = new Set<string>()
  const edges: MermaidFlow['edges'] = []
  const subgraphs: (MermaidFlow['subgraphs'][number] & { id: string })[] = []
  const stack: MermaidFlow['subgraphs'] = []

  /** 第一次出現時記到最內層子圖；形狀與文字取第一次帶括號的寫法 */
  function touch(id: string, shape?: FlowShape, text?: string) {
    let n = nodes.get(id)
    if (!n) {
      n = { id, shape: 'process', text: id }
      nodes.set(id, n)
      stack.at(-1)?.nodeIds.push(id)
    }
    if (shape && !explicit.has(id)) {
      explicit.add(id)
      Object.assign(n, { shape, text })
    }
  }

  function scanLine(line: string) {
    let pos = 0

    const readNode = (): string | null => {
      const m = stick(ID, line, pos)
      if (!m) return null
      const id = m[0]
      let p = pos + id.length
      let shape: FlowShape | undefined
      let text: string | undefined
      const hit = SHAPES.find(([open]) => line.startsWith(open, p))
      if (hit) {
        const [open, closes, sh] = hit
        p += open.length
        let body: string
        let close: string | undefined
        const q = stick(QUOTED, line, p)
        if (q) {
          body = q[1]
          p += q[0].length
          close = closes.find((c) => line.startsWith(c, p))
          if (!close) return null
        } else {
          const ends = closes.map((c) => [line.indexOf(c, p), c] as const).filter(([i]) => i >= 0)
          if (!ends.length) return null
          const [i, c] = ends.reduce((a, b) => (b[0] < a[0] ? b : a))
          body = line.slice(p, i)
          p = i
          close = c
        }
        p += close.length
        shape = sh
        text = clean(body)
      }
      const cls = stick(CLASS_SUFFIX, line, p)
      if (cls) p += cls[0].length
      pos = p
      touch(id, shape, text)
      return id
    }

    const readGroup = (): string[] | null => {
      const ids: string[] = []
      for (;;) {
        const id = readNode()
        if (!id) return ids.length ? ids : null
        ids.push(id)
        const amp = stick(AMP, line, pos)
        if (!amp) return ids
        pos += amp[0].length
      }
    }

    let left = readGroup()
    while (left) {
      const link = stick(LINK, line, pos)
      if (!link) return
      pos += link[0].length
      const right = readGroup()
      if (!right) return
      const label = clean(link[1] ?? link[2] ?? '')
      for (const from of left) for (const to of right) edges.push({ from, to, label })
      left = right
    }
  }

  for (const line of lines.slice(1)) {
    const sg = /^subgraph(?:\s+(.*))?$/.exec(line)
    if (sg) {
      const rest = (sg[1] ?? '').trim()
      const m = /^([\p{L}\p{N}_]+)\s*\[(.*)\]$/u.exec(rest)
      const g = m ? { id: m[1], title: clean(m[2]) } : { id: rest, title: clean(rest) || '子圖' }
      const entry = { ...g, nodeIds: [] as string[] }
      subgraphs.push(entry)
      stack.push(entry)
    } else if (line === 'end') {
      stack.pop()
    } else if (!SKIP.test(line)) {
      scanLine(line)
    }
  }

  // 子圖 id 被當成節點或箭頭端點時略過
  const sgIds = new Set(subgraphs.map((g) => g.id))
  const nodeList = [...nodes.values()].filter((n) => !sgIds.has(n.id))
  if (!nodeList.length) return { ok: false, error: '找不到任何節點' }
  return {
    ok: true,
    flow: {
      title,
      direction,
      nodes: nodeList,
      edges: edges.filter((e) => !sgIds.has(e.from) && !sgIds.has(e.to)),
      subgraphs: subgraphs.map((g) => ({ title: g.title, nodeIds: g.nodeIds.filter((n) => !sgIds.has(n)) })),
    },
  }
}
