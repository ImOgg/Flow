import type { Measure } from '../model/classLayout'

export const FONT_FAMILY = 'system-ui, "Segoe UI", "Microsoft JhengHei", sans-serif'
export const FONT_SIZE = 13

const ctx = document.createElement('canvas').getContext('2d')!
const cache = new Map<string, number>()

/** 以離屏 canvas 量文字寬度，字型與 SVG 一致；結果快取 */
export const measureText: Measure = (text, bold = false) => {
  const key = `${bold ? 'b' : 'n'}${text}`
  let w = cache.get(key)
  if (w === undefined) {
    ctx.font = `${bold ? 'bold ' : ''}${FONT_SIZE}px ${FONT_FAMILY}`
    w = ctx.measureText(text).width
    cache.set(key, w)
  }
  return w
}
