import snapshot from './assets/leetcode/binary-tree-inorder-traversal.json'
import diagramOne from './assets/leetcode/binary-tree-inorder-1.png?url'
import diagramTwo from './assets/leetcode/binary-tree-inorder-2.png?url'
import { normalizeDailyProblem } from './leetcode-data'

// Archived multi-image fixture. The production reader no longer imports this
// module and uses the international daily challenge and its separate cache.
export const LEETCODE_IMAGE_TEST = false
export const LEETCODE_IMAGE_TEST_CACHE_KEY = 'orbital-leetcode-image-test-94-v1'
const DIAGRAMS = new Map([
  ['https://assets.leetcode.com/uploads/2024/08/29/screenshot-2024-08-29-202743.png', diagramOne],
  ['https://assets.leetcode.com/uploads/2024/08/29/tree_2.png', diagramTwo],
])

export function imageTestProblem() {
  return normalizeDailyProblem(snapshot)
}

export function bundledTestDiagram(source: string): string | undefined {
  return LEETCODE_IMAGE_TEST ? DIAGRAMS.get(source) : undefined
}
