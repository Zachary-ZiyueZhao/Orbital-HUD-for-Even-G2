import { validTodoDate, validTodoTime } from './todos'

export const SCHEDULE_KEY = 'eveng2-hud-schedule-v1'
export const REMINDER_KEY = 'eveng2-hud-class-reminders-v1'
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export type Course = {
  id: string; title: string; days: number[]; start: string; end: string; location: string
  fromDate: string; untilDate: string; enabled: boolean
}
export type ClassOccurrence = { key: string; course: Course; date: Date; reminderAt: number }
export type ScheduleData = { courses: Course[]; remindersEnabled: boolean }
export const DEFAULT_SCHEDULE: ScheduleData = { courses: [], remindersEnabled: true }

export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function courseError(course: Omit<Course, 'id'>): string | null {
  if (!course.title.trim() || course.title.length > 80) return 'Enter a class name (up to 80 characters).'
  if (!course.days.length || course.days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) return 'Choose at least one weekday.'
  if (!validTodoTime(course.start) || !validTodoTime(course.end) || course.end <= course.start) return 'End time must be after start time, on the same day.'
  if ((course.fromDate && !validTodoDate(course.fromDate)) || (course.untilDate && !validTodoDate(course.untilDate))) return 'Enter valid term dates.'
  if (course.fromDate && course.untilDate && course.fromDate > course.untilDate) return 'Term end must be on or after term start.'
  if (course.location.length > 80) return 'Keep the room or location within 80 characters.'
  return null
}

export function parseSchedule(raw: string | null): ScheduleData {
  try {
    const saved: unknown = JSON.parse(raw ?? 'null')
    if (!saved || typeof saved !== 'object') return { ...DEFAULT_SCHEDULE, courses: [] }
    const value = saved as Partial<ScheduleData>
    const ids = new Set<string>()
    const courses = (Array.isArray(value.courses) ? value.courses : []).filter((item: unknown): item is Course => {
      if (!item || typeof item !== 'object') return false
      const c = item as Course
      if (typeof c.id !== 'string' || !c.id || ids.has(c.id) || typeof c.title !== 'string'
        || !Array.isArray(c.days) || typeof c.start !== 'string' || typeof c.end !== 'string'
        || typeof c.location !== 'string' || typeof c.fromDate !== 'string' || typeof c.untilDate !== 'string'
        || typeof c.enabled !== 'boolean' || courseError(c)) return false
      ids.add(c.id)
      return true
    }).slice(0, 100)
    return { courses, remindersEnabled: value.remindersEnabled !== false }
  } catch { return { ...DEFAULT_SCHEDULE, courses: [] } }
}

// Construct dates in local wall time, each day separately so DST transitions
// never shift a recurring course by an hour.
export function upcomingClasses(courses: Course[], now = new Date(), daysAhead = 7): ClassOccurrence[] {
  const result: ClassOccurrence[] = []
  for (let offset = 0; offset <= daysAhead; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
    const dateKey = localDateKey(day)
    for (const course of courses) {
      if (!course.enabled || !course.days.includes(day.getDay())
        || (course.fromDate && dateKey < course.fromDate) || (course.untilDate && dateKey > course.untilDate)) continue
      const [hour, minute] = course.start.split(':').map(Number)
      const date = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute)
      if (date.getHours() !== hour || date.getMinutes() !== minute || date.getTime() <= now.getTime()) continue
      result.push({ key: `${course.id}/${dateKey}/${course.start}`, course, date, reminderAt: date.getTime() - 30 * 60_000 })
    }
  }
  return result.sort((a, b) => a.date.getTime() - b.date.getTime() || a.course.title.localeCompare(b.course.title))
}

export function courseDays(course: Course) {
  return [...course.days].sort((a, b) => (a + 6) % 7 - (b + 6) % 7).map(day => WEEKDAYS[day]).join(' / ')
}

export function parseReminderLog(raw: string | null): Record<string, number> {
  try {
    const value: unknown = JSON.parse(raw ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([key, time]) => key.length < 180
      && typeof time === 'number' && Number.isFinite(time) && time > Date.now() - 8 * 86400_000))
  } catch { return {} }
}
