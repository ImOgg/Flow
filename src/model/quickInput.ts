// 快速輸入語法：解析失敗一律回傳 null，由 UI 標紅並保留原文
import type { Attribute, Message, Operation, Visibility } from './types'

const N = String.raw`[\p{L}\p{N}_]+`
const ATTR = new RegExp(String.raw`^([+\-#~])?\s*(${N})\s*(?::\s*(.+))?$`, 'u')
const OP = new RegExp(String.raw`^([+\-#~])?\s*(${N})\s*\(([^)]*)\)\s*(?::\s*(.+))?$`, 'u')
// 生命線可寫名稱 `A`、或照畫面標題寫 `A: Class` / `:Class`
const REF = String.raw`(?:${N}\s*)?:\s*${N}|${N}`
const MSG = new RegExp(String.raw`^(${REF})\s*(-->|->)\s*(${REF})\s*:\s*(.*)$`, 'u')

/** `- name: string` */
export function parseAttribute(text: string): Attribute | null {
  const m = ATTR.exec(text.trim())
  if (!m) return null
  return { visibility: (m[1] ?? '+') as Visibility, name: m[2], type: (m[3] ?? '').trim() }
}

/** `+ login(id: string): bool` */
export function parseOperation(text: string): Operation | null {
  const m = OP.exec(text.trim())
  if (!m) return null
  return {
    visibility: (m[1] ?? '+') as Visibility,
    name: m[2],
    params: m[3].trim(),
    returnType: (m[4] ?? '').trim(),
  }
}

/** `A -> B: text`（同步）或 `A --> B: text`（回傳）；生命線以名稱或 `名稱: 類別` 表示 */
export function parseMessage(
  text: string,
): { from: string; to: string; text: string; type: Message['type'] } | null {
  const m = MSG.exec(text.trim())
  if (!m) return null
  return { from: m[1], to: m[3], type: m[2] === '-->' ? 'return' : 'sync', text: m[4].trim() }
}

const REF_ONLY = new RegExp(String.raw`^(?:${REF})$`, 'u')
const NOTE = /^note\s+over\s+(.+)$/iu

/**
 * `note over A, B: text`（不分大小寫）。生命線寫法本身可含冒號，
 * 因此以「從左邊起第一個能讓所有生命線寫法都合法的冒號」作為文字分隔
 */
export function parseNote(text: string): { over: string[]; text: string } | null {
  const m = NOTE.exec(text.trim())
  if (!m) return null
  const body = m[1]
  for (let i = body.indexOf(':'); i >= 0; i = body.indexOf(':', i + 1)) {
    const over = body.slice(0, i).split(',').map((r) => r.trim())
    if (over.every((r) => REF_ONLY.test(r))) return { over, text: body.slice(i + 1).trim() }
  }
  return null
}

export const formatAttribute = (a: Attribute) => `${a.visibility} ${a.name}${a.type ? `: ${a.type}` : ''}`

export const formatOperation = (o: Operation) =>
  `${o.visibility} ${o.name}(${o.params})${o.returnType ? `: ${o.returnType}` : ''}`
