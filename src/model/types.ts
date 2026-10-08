export type Id = string

export type Visibility = '+' | '-' | '#' | '~'

export interface Attribute {
  visibility: Visibility
  name: string
  type: string
}

export interface Operation {
  visibility: Visibility
  name: string
  params: string
  returnType: string
}

export type ClassifierKind = 'class' | 'interface' | 'enum'

export interface Classifier {
  id: Id
  kind: ClassifierKind
  name: string
  /** enum 時作為列舉值，只使用 name */
  attributes: Attribute[]
  operations: Operation[]
}

export type RelationKind =
  | 'association'
  | 'generalization'
  | 'realization'
  | 'dependency'
  | 'aggregation'
  | 'composition'

export interface Relation {
  id: Id
  kind: RelationKind
  /** 繼承 / 實作：子；聚合 / 組合：整體 */
  sourceId: Id
  targetId: Id
}

export interface ClassNode {
  elementId: Id
  x: number
  y: number
}

export interface ClassDiagram {
  id: Id
  type: 'class'
  name: string
  nodes: ClassNode[]
  edges: { relationId: Id }[]
}

export interface Lifeline {
  id: Id
  name: string
  elementId?: Id
}

export interface Message {
  kind: 'message'
  id: Id
  from: Id
  to: Id
  text: string
  type: 'sync' | 'return'
}

export type FragmentType = 'alt' | 'loop' | 'opt'

export interface Operand {
  guard: string
  items: SeqItem[]
}

export interface Fragment {
  kind: 'fragment'
  id: Id
  type: FragmentType
  operands: Operand[]
}

export type SeqItem = Message | Fragment

export interface SequenceDiagram {
  id: Id
  type: 'sequence'
  name: string
  /** 陣列順序 = 左到右 */
  lifelines: Lifeline[]
  /** 陣列順序 = 上到下 */
  items: SeqItem[]
}

export type Diagram = ClassDiagram | SequenceDiagram

export interface Project {
  version: 1
  model: {
    elements: Record<Id, Classifier>
    relations: Record<Id, Relation>
  }
  diagrams: Diagram[]
}

/** 循序圖中的插入位置：container 為 null 表示最外層，否則為某片段的某個區段 */
export interface InsertPos {
  container: { fragmentId: Id; operand: number } | null
  index: number
}
