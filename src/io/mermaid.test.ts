import { describe, expect, it } from 'vitest'
import { parseMermaidFlowchart, type MermaidFlow } from './mermaid'

function flow(text: string): MermaidFlow {
  const r = parseMermaidFlowchart(text)
  if (!r.ok) throw new Error(r.error)
  return r.flow
}
const edgesOf = (f: MermaidFlow) => f.edges.map((e) => `${e.from}>${e.to}${e.label ? `:${e.label}` : ''}`)

describe('前處理、標頭與錯誤', () => {
  it('含圍欄與標題', () => {
    const f = flow(['```mermaid', '---', 'title: 請假流程', '---', 'flowchart LR', 'A --> B', '```'].join('\n'))
    expect(f.title).toBe('請假流程')
    expect(f.direction).toBe('LR')
    expect(edgesOf(f)).toEqual(['A>B'])
  })

  it('沒有標題；TB 正規化成 TD，省略方向視為 TD', () => {
    expect(flow('graph TD\n A --> B').title).toBeNull()
    expect(flow('flowchart TB\nA').direction).toBe('TD')
    expect(flow('graph\nA').direction).toBe('TD')
  })

  it('%% 註解與結尾分號', () => {
    const f = flow('%%{init: {}}%%\ngraph TD;\n%% 註解\nA --> B;')
    expect(edgesOf(f)).toEqual(['A>B'])
  })

  it('貼了類別圖', () => {
    expect(parseMermaidFlowchart('classDiagram\n class A')).toEqual({ ok: false, error: '目前只支援流程圖' })
    expect(parseMermaidFlowchart('隨便一段文字')).toEqual({ ok: false, error: '目前只支援流程圖' })
  })

  it('沒有節點', () => {
    expect(parseMermaidFlowchart('flowchart TD')).toEqual({ ok: false, error: '找不到任何節點' })
  })
})

describe('陳述行', () => {
  it('五種形狀', () => {
    const f = flow('flowchart TD\nA([開始]) --> B[填表] --> C{通過？}\nD[/輸入資料/]\nE[(資料庫)]\nF((結束))\nH[\\輸出\\]')
    expect(f.nodes.map((n) => [n.shape, n.text])).toEqual([
      ['terminal', '開始'],
      ['process', '填表'],
      ['decision', '通過？'],
      ['io', '輸入資料'],
      ['database', '資料庫'],
      ['terminal', '結束'],
      ['io', '輸出'],
    ])
  })

  it('不支援的形狀轉成處理', () => {
    const f = flow('flowchart TD\nF{{準備}} --> G>旗標]\nI[[子程序]] --> J(圓角)')
    expect(f.nodes.map((n) => [n.shape, n.text])).toEqual([
      ['process', '準備'],
      ['process', '旗標'],
      ['process', '子程序'],
      ['process', '圓角'],
    ])
  })

  it('引號、<br> 與引號內含括號', () => {
    const f = flow('flowchart TD\nA["呼叫 f(x) [重試]"] --> B["第一行<br/>第二行"]')
    expect(f.nodes.map((n) => n.text)).toEqual(['呼叫 f(x) [重試]', '第一行\n第二行'])
  })

  it('重複參照：只建一個節點，取第一次帶括號的寫法；只有 id 時文字為 id', () => {
    const f = flow('flowchart TD\nA --> B\nA[開始] --> C\nA[別的] --> C')
    expect(f.nodes.map((n) => [n.id, n.text])).toEqual([
      ['A', '開始'],
      ['B', 'B'],
      ['C', 'C'],
    ])
    expect(edgesOf(f)).toEqual(['A>B', 'A>C', 'A>C'])
  })

  it('標籤的兩種寫法', () => {
    const f = flow('flowchart TD\nC{通過？} -->|是| D\nC -- 否 --> E\nC == 粗 ==> F\nC -. 虛 .-> G\nC -->|"引號"| H')
    expect(edgesOf(f)).toEqual(['C>D:是', 'C>E:否', 'C>F:粗', 'C>G:虛', 'C>H:引號'])
  })

  it('各種線型都轉成一般箭頭', () => {
    const f = flow('flowchart TD\nA --- B\nA -.- C\nA === D\nA <--> E\nA o--o F\nA x--x G\nA ~~~ H\nA---->I')
    expect(edgesOf(f)).toEqual(['A>B', 'A>C', 'A>D', 'A>E', 'A>F', 'A>G', 'A>H', 'A>I'])
  })

  it('串接與多節點', () => {
    const f = flow('flowchart TD\nA --> B -.-> C\nX & Y ==> Z')
    expect(edgesOf(f)).toEqual(['A>B', 'B>C', 'X>Z', 'Y>Z'])
  })

  it('AI 產生的樣式', () => {
    const f = flow(
      'flowchart TD\nclassDef ok fill:#9f9\nA[開始]:::ok --> B\nA:::ok\nstyle B fill:#f00\n%% 註解\nclass A ok\nlinkStyle 0 stroke:#f00\nclick A callback',
    )
    expect(f.nodes.map((n) => n.id)).toEqual(['A', 'B'])
    expect(f.nodes[0].text).toBe('開始')
    expect(edgesOf(f)).toEqual(['A>B'])
  })

  it('無法解析的行只中止該行，已讀到的保留', () => {
    const f = flow('flowchart TD\nA --> B --> [壞掉\nC --> D')
    expect(edgesOf(f)).toEqual(['A>B', 'C>D'])
  })
})

describe('子圖', () => {
  it('一般子圖', () => {
    const f = flow('flowchart TD\nsubgraph 後端\n V[驗證] --> S[儲存]\nend\nU --> V')
    expect(f.subgraphs).toEqual([{ title: '後端', nodeIds: ['V', 'S'] }])
  })

  it('id [標題] 寫法取括號內文字', () => {
    const f = flow('flowchart TD\nsubgraph be ["後端 服務"]\n A\nend\nsubgraph fe[前端]\n B\nend')
    expect(f.subgraphs.map((g) => g.title)).toEqual(['後端 服務', '前端'])
  })

  it('巢狀子圖攤平，節點只屬於最內層', () => {
    const f = flow('flowchart TD\nsubgraph 系統\n W[網站]\n subgraph 資料層\n  DB[(DB)]\n end\nend')
    expect(f.subgraphs).toEqual([
      { title: '系統', nodeIds: ['W'] },
      { title: '資料層', nodeIds: ['DB'] },
    ])
  })

  it('子圖 id 被當成箭頭端點時略過，也不產生節點', () => {
    const f = flow('flowchart TD\nsubgraph sys [系統]\n A\nend\nB --> sys\nsys --> C\nB --> A')
    expect(f.nodes.map((n) => n.id)).toEqual(['A', 'B', 'C'])
    expect(edgesOf(f)).toEqual(['B>A'])
  })
})
