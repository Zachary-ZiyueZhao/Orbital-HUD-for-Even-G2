export type TodoItem = { id: string; text: string; completed: boolean; dueDate: string | null; dueTime: string | null }
export type NewTodo = { text: string; dueDate: string | null; dueTime: string | null }

export function validTodoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function validTodoTime(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
}
export function parseTodos(serialized: string | null): TodoItem[] {
  try {
    const saved: unknown = JSON.parse(serialized ?? '[]')
    if (!Array.isArray(saved)) return []
    const seen = new Set<string>()
    return saved.filter(item => item && typeof item.id === 'string' && typeof item.text === 'string'
      && item.text.trim() && typeof item.completed === 'boolean' && !seen.has(item.id) && !!seen.add(item.id))
      .slice(-100).map(item => ({ id: item.id, text: item.text.trim().slice(0, 120), completed: item.completed,
        dueDate: validTodoDate(item.dueDate) ? item.dueDate : null,
        dueTime: validTodoDate(item.dueDate) && validTodoTime(item.dueTime) ? item.dueTime : null }))
  } catch { return [] }
}

export function localTodoDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
export function todoDueLabel(todo: Pick<TodoItem, 'dueDate' | 'dueTime'>, now = new Date()) {
  if (!todo.dueDate) return 'No due date'
  return `Due: ${todo.dueDate}${todo.dueTime ? ` ${todo.dueTime}` : ''}${todo.dueDate < localTodoDate(now) ? ' / Overdue' : ''}`
}

export function mergeNewTodos(existing: readonly TodoItem[], items: readonly NewTodo[]) {
  const next = [...existing], created: TodoItem[] = [], duplicates: TodoItem[] = []
  for (const item of items) {
    const match = next.find(todo => !todo.completed && todo.text.toLocaleLowerCase() === item.text.toLocaleLowerCase()
      && todo.dueDate === item.dueDate && todo.dueTime === item.dueTime)
    if (match) { duplicates.push(match); continue }
    if (next.length >= 100) throw new Error('To-do list is full (100 items). Remove completed items first.')
    const id = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    const todo = { id, ...item, completed: false }
    next.push(todo); created.push(todo)
  }
  return { next, created, duplicates }
}
