// 快速輸入語法：解析失敗一律回傳 null，由 UI 標紅並保留原文
import type { Attribute, Message, Operation, Visibility } from './types'

const N = String.raw`[\p{L}\p{N}_]+`
const ATTR = new RegExp(String.raw`^([+\-#~])?\s*(${N})\s*(?::\s*(.+))?$`, 'u')
const OP = new RegExp(String.raw`^([+\-#~])?\s*(${N})\s*\(([^)]*)\)\s*(?::\s*(.+))?$`, 'u')
const MSG = new RegExp(String.raw`^(${N})\s*(-->|->)\s*(${N})\s*:\s*(.*)$`, 'u')

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

/** `A -> B: text`（同步）或 `A --> B: text`（回傳）；生命線以名稱表示 */
export function parseMessage(
  text: string,
): { from: string; to: string; text: string; type: Message['type'] } | null {
  const m = MSG.exec(text.trim())
  if (!m) return null
  return { from: m[1], to: m[3], type: m[2] === '-->' ? 'return' : 'sync', text: m[4].trim() }
}

export const formatAttribute = (a: Attribute) => `${a.visibility} ${a.name}${a.type ? `: ${a.type}` : ''}`

export const formatOperation = (o: Operation) =>
  `${o.visibility} ${o.name}(${o.params})${o.returnType ? `: ${o.returnType}` : ''}`
