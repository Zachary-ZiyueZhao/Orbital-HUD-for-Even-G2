import { readerWindow, wrapReaderText } from '../leetcode-reader'
import { ALGORITHM_ROOT, algorithmNode, algorithmChildren, algorithmText } from './catalogue'
import type { AlgorithmNote } from './types'

export class AlgorithmBrowser {
  folderId = ALGORITHM_ROOT
  articleId: string | null = null
  private selections = new Map<string, number>()
  private offsets = new Map<string, number>()
  private documents = new Map<string, string[]>()
  constructor(private measure: (value: string) => number) {}
  get folder() { return algorithmNode(this.folderId)! }
  get entries() { return algorithmChildren(this.folderId) }
  get selectedIndex() { return Math.max(0, Math.min(this.selections.get(this.folderId) ?? 0, this.entries.length - 1)) }
  get article(): AlgorithmNote | null {
    const node = this.articleId ? algorithmNode(this.articleId) : undefined
    return node?.kind === 'note' ? node : null
  }
  get document() {
    const article = this.article
    if (!article) return { lines: [], images: [] }
    if (!this.documents.has(article.id)) this.documents.set(article.id, wrapReaderText(algorithmText(article), this.measure))
    return { lines: this.documents.get(article.id)!, images: [] }
  }
  get window() { return readerWindow(this.document, this.articleId ? this.offsets.get(this.articleId) ?? 0 : 0) }
  move(direction: -1 | 1) {
    if (this.articleId) {
      const visible = readerWindow(this.document, this.window.start + direction * 2)
      this.offsets.set(this.articleId, visible.start)
    } else {
      const count = this.entries.length
      if (count) this.selections.set(this.folderId, (this.selectedIndex + direction + count) % count)
    }
  }
  open(id = this.entries[this.selectedIndex]?.id) {
    if (!id) return
    const node = algorithmNode(id)
    if (!node) return
    if (node.kind === 'folder') { this.folderId = node.id; this.articleId = null }
    else {
      this.folderId = node.parent
      this.selections.set(node.parent, this.entries.findIndex(item => item.id === id))
      this.articleId = node.id
    }
  }
  back(): boolean {
    if (this.articleId) { this.articleId = null; return true }
    const parent = this.folder.parent
    if (!parent) return false
    this.selections.set(parent, algorithmChildren(parent).findIndex(item => item.id === this.folderId))
    this.folderId = parent
    return true
  }
}
