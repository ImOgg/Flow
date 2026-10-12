import { describe, expect, it } from 'vitest'
import { formatAttribute, formatOperation, parseAttribute, parseMessage, parseNote, parseOperation } from './quickInput'

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

describe('parseNote', () => {
  it('單一 / 多條生命線', () => {
    expect(parseNote('note over A: hi')).toEqual({ over: ['A'], text: 'hi' })
    expect(parseNote('note over Client, AuthService: 先驗證 token')).toEqual({
      over: ['Client', 'AuthService'],
      text: '先驗證 token',
    })
  })
  it(':Class 寫法', () => {
    expect(parseNote('note over :Auth, B: x')).toEqual({ over: [':Auth', 'B'], text: 'x' })
  })
  it('文字含冒號：以第一個能讓生命線都合法的冒號分隔', () => {
    expect(parseNote('note over DB: 時間: 3s')).toEqual({ over: ['DB'], text: '時間: 3s' })
  })
  it('不分大小寫、可空文字', () => {
    expect(parseNote('NOTE Over A:')).toEqual({ over: ['A'], text: '' })
  })
  it.each(['note A: x', 'note over : x', 'note over A B: x', 'note over A', 'A -> B: x'])('失敗輸入 %j 回傳 null', (s) => {
    expect(parseNote(s)).toBeNull()
  })
})

describe('format', () => {
  it('與 parse 往返', () => {
    for (const s of ['- name: string', '+ id']) expect(formatAttribute(parseAttribute(s)!)).toBe(s)
    for (const s of ['+ login(id: string): bool', '# reset()']) expect(formatOperation(parseOperation(s)!)).toBe(s)
  })
})
