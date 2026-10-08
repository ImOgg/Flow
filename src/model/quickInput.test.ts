import { describe, expect, it } from 'vitest'
import { formatAttribute, formatOperation, parseAttribute, parseMessage, parseOperation } from './quickInput'

describe('parseAttribute', () => {
  it('完整語法', () => {
    expect(parseAttribute('- name: string')).toEqual({ visibility: '-', name: 'name', type: 'string' })
  })
  it('省略可見性視為 +，省略型別為空字串', () => {
    expect(parseAttribute('id')).toEqual({ visibility: '+', name: 'id', type: '' })
  })
  it('泛型型別整段保留', () => {
    expect(parseAttribute('# items: List<Order>')?.type).toBe('List<Order>')
  })
  it('中文名稱', () => {
    expect(parseAttribute('~ 名稱: 字串')).toEqual({ visibility: '~', name: '名稱', type: '字串' })
  })
  it.each(['', '+', '+ (: x', 'a b', 'login()', ': string'])('失敗輸入 %j 回傳 null', (s) => {
    expect(parseAttribute(s)).toBeNull()
  })
})

describe('parseOperation', () => {
  it('多參數與回傳型別', () => {
    expect(parseOperation('+ login(id: string, pwd: string): bool')).toEqual({
      visibility: '+',
      name: 'login',
      params: 'id: string, pwd: string',
      returnType: 'bool',
    })
  })
  it('省略可見性與回傳型別', () => {
    expect(parseOperation('reset()')).toEqual({ visibility: '+', name: 'reset', params: '', returnType: '' })
  })
  it('中文名稱', () => {
    expect(parseOperation('- 登入(帳號: string)')?.name).toBe('登入')
  })
  it.each(['', '+ (: x', 'login', 'login(', 'a b()'])('失敗輸入 %j 回傳 null', (s) => {
    expect(parseOperation(s)).toBeNull()
  })
})

describe('parseMessage', () => {
  it('同步訊息 ->', () => {
    expect(parseMessage('Client -> AuthService: login(id)')).toEqual({
      from: 'Client',
      to: 'AuthService',
      text: 'login(id)',
      type: 'sync',
    })
  })
  it('回傳訊息 -->', () => {
    expect(parseMessage('B-->A: ok')).toEqual({ from: 'B', to: 'A', text: 'ok', type: 'return' })
  })
  it('自己對自己、空文字、中文', () => {
    expect(parseMessage('服務 -> 服務:')).toEqual({ from: '服務', to: '服務', text: '', type: 'sync' })
  })
  it('照畫面標題寫生命線', () => {
    expect(parseMessage('A: Class -> B: Class: hi')).toEqual({ from: 'A: Class', to: 'B: Class', text: 'hi', type: 'sync' })
    expect(parseMessage(':Auth --> B: ok')).toEqual({ from: ':Auth', to: 'B', text: 'ok', type: 'return' })
    expect(parseMessage('A: Class->B: Class:')).toEqual({ from: 'A: Class', to: 'B: Class', text: '', type: 'sync' })
  })
  it.each(['Client login', 'A -> B', '-> B: x', 'A => B: x', 'A B -> C: x'])('失敗輸入 %j 回傳 null', (s) => {
    expect(parseMessage(s)).toBeNull()
  })
})

describe('format', () => {
  it('與 parse 往返', () => {
    for (const s of ['- name: string', '+ id']) expect(formatAttribute(parseAttribute(s)!)).toBe(s)
    for (const s of ['+ login(id: string): bool', '# reset()']) expect(formatOperation(parseOperation(s)!)).toBe(s)
  })
})
