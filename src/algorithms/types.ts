export type AlgorithmNote = {
  kind: 'note'; id: string; parent: string; title: string; use: string; idea: string
  time: string; space: string; steps: string; pitfalls: string; example: string
}
export type AlgorithmFolder = { kind: 'folder'; id: string; parent: string | null; title: string }
export type AlgorithmNode = AlgorithmNote | AlgorithmFolder
export function note(parent: string, id: string, title: string, use: string, idea: string,
  time: string, space: string, steps: string, pitfalls: string, example: string): AlgorithmNote {
  return { kind: 'note', parent, id, title, use, idea, time, space, steps, pitfalls, example }
}
