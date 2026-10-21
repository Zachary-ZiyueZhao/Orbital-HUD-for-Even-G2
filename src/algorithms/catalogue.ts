import { basicNotes } from './basics'
import { graphNotes } from './graphs'
import { dpStringNotes } from './dp-strings'
import { mathNotes } from './math'
import type { AlgorithmFolder, AlgorithmNode, AlgorithmNote } from './types'

const f = (id: string, parent: string | null, title: string): AlgorithmFolder => ({ kind: 'folder', id, parent, title })
export const ALGORITHM_ROOT = 'library'
export const ALGORITHM_NOTES: readonly AlgorithmNote[] = [...basicNotes, ...graphNotes, ...dpStringNotes, ...mathNotes]
export const ALGORITHM_FOLDERS: readonly AlgorithmFolder[] = [
  f('library', null, '算法库 / Algorithms'),
  f('basics', 'library', '基础技巧 / Basics'),
  f('sort', 'library', '排序与选择 / Sorting'),
  f('search', 'library', '搜索与枚举 / Search'),
  f('structures', 'library', '数据结构 / Data structures'),
  f('graphs', 'library', '图论 / Graphs'),
  f('trees', 'library', '树算法 / Trees'),
  f('dp', 'library', '动态规划 / DP'),
  f('greedy', 'library', '贪心 / Greedy'),
  f('strings', 'library', '字符串 / Strings'),
  f('math', 'library', '数学 / Mathematics'),
  f('geometry', 'library', '计算几何 / Geometry'),
  f('bits', 'library', '位运算与博弈 / Bits & games'),
  f('arrays', 'basics', '数组与区间 / Arrays'), f('pointers', 'basics', '双指针与窗口 / Pointers'),
  f('comparison-sort', 'sort', '比较排序 / Comparison'), f('linear-sort', 'sort', '值域排序与选择 / Keys & selection'),
  f('binary-searches', 'search', '二分与三分 / Bounds'), f('enumeration', 'search', '遍历与回溯 / Enumeration'),
  f('linear-structures', 'structures', '线性结构 / Linear'), f('ordered-structures', 'structures', '堆与有序结构 / Ordered'),
  f('range-structures', 'structures', '集合与区间 / Sets & ranges'),
  f('graph-order', 'graphs', '依赖与染色 / Ordering'), f('shortest-path', 'graphs', '最短路径 / Shortest paths'),
  f('spanning-tree', 'graphs', '最小生成树 / MST'), f('connectivity', 'graphs', '连通性 / Connectivity'),
  f('graph-advanced', 'graphs', '匹配与进阶 / Advanced'),
  f('dp-basics', 'dp', '基础状态与序列 / Sequences'), f('knapsack', 'dp', '背包 / Knapsack'), f('dp-advanced', 'dp', '区间树形与状态 / Advanced'),
  f('string-match', 'strings', '字符串匹配 / Matching'), f('string-advanced', 'strings', '字典后缀与回文 / Structures'),
  f('number-theory', 'math', '数论基础 / Number theory'), f('modular', 'math', '同余与组合 / Modular'), f('linear-algebra', 'math', '矩阵与线性代数 / Matrices'),
]
const nodeMap = new Map<string, AlgorithmNode>([...ALGORITHM_FOLDERS, ...ALGORITHM_NOTES].map(node => [node.id, node]))
export function algorithmNode(id: string) { return nodeMap.get(id) }
export function algorithmChildren(id: string): AlgorithmNode[] {
  return [...ALGORITHM_FOLDERS, ...ALGORITHM_NOTES].filter(node => node.parent === id)
}
export function algorithmPath(id: string): AlgorithmNode[] {
  const result: AlgorithmNode[] = []
  let node = algorithmNode(id)
  while (node) { result.unshift(node); node = node.parent ? algorithmNode(node.parent) : undefined }
  return result
}
export function algorithmCount(id: string): number {
  const node = algorithmNode(id)
  return !node ? 0 : node.kind === 'note' ? 1 : algorithmChildren(id).reduce((sum, child) => sum + algorithmCount(child.id), 0)
}
export function algorithmText(note: AlgorithmNote): string {
  return [
    '适用场景', note.use, '', '核心思路', note.idea, '',
    '复杂度', `时间：${note.time}`, `空间：${note.space}`, '',
    '步骤 / 伪代码', note.steps, '', '易错点', note.pitfalls, '', '例子', note.example, '',
    '记号：n/m 为输入长度，V/E 为点数/边数，W 为背包容量。未另作说明时，复杂度按基本数值运算为常数计算。',
    '伪代码用于理解步骤，不是可直接运行的程序。',
  ].join('\n')
}
export function searchAlgorithms(query: string): AlgorithmNote[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  return ALGORITHM_NOTES.filter(note => {
    const text = `${algorithmPath(note.id).map(node => node.title).join(' ')} ${algorithmText(note)}`.toLocaleLowerCase()
    return words.every(word => text.includes(word))
  })
}
