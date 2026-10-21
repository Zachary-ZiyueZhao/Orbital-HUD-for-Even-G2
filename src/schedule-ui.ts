import { courseDays, courseError, upcomingClasses, WEEKDAYS, type Course, type ScheduleData } from './schedule'

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
let actions: { read: () => ScheduleData; save: (value: ScheduleData) => boolean; open: () => void; notify: (message: string) => void } | undefined
let selectedDay = new Date().getDay()
let page = 0
let editingId: string | null = null

function setEditor(course?: Course) {
  editingId = course?.id ?? null
  el<HTMLFormElement>('class-form').reset()
  el<HTMLInputElement>('class-title').value = course?.title ?? ''
  el<HTMLInputElement>('class-start').value = course?.start ?? '09:00'
  el<HTMLInputElement>('class-end').value = course?.end ?? '10:00'
  el<HTMLInputElement>('class-location').value = course?.location ?? ''
  el<HTMLInputElement>('class-from').value = course?.fromDate ?? ''
  el<HTMLInputElement>('class-until').value = course?.untilDate ?? ''
  el<HTMLInputElement>('class-enabled').checked = course?.enabled ?? true
  document.querySelectorAll<HTMLInputElement>('[name="class-day"]').forEach(input => {
    input.checked = course ? course.days.includes(Number(input.value)) : Number(input.value) === selectedDay
  })
  el<HTMLElement>('class-editor-title').textContent = course ? 'Edit class' : 'New class'
  el<HTMLElement>('class-editor').hidden = false
  el<HTMLElement>('class-browser').hidden = true
  el<HTMLElement>('class-pager').hidden = true
  el<HTMLElement>('class-day-tabs').hidden = true
  el<HTMLElement>('class-new').hidden = true
  el<HTMLElement>('class-error').hidden = true
  el<HTMLInputElement>('class-title').focus()
}

function closeEditor() {
  editingId = null
  el<HTMLElement>('class-editor').hidden = true
  el<HTMLElement>('class-browser').hidden = false
  el<HTMLElement>('class-pager').hidden = false
  el<HTMLElement>('class-day-tabs').hidden = false
  el<HTMLElement>('class-new').hidden = false
  renderScheduleUi()
}

export function renderScheduleUi() {
  if (!actions) return
  const value = actions.read()
  el<HTMLInputElement>('class-reminders').checked = value.remindersEnabled
  el<HTMLElement>('class-timezone').textContent = `Weekly / ${Intl.DateTimeFormat().resolvedOptions().timeZone || 'phone local time'}`
  document.querySelectorAll<HTMLButtonElement>('[data-class-day]').forEach(button => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.classDay) === selectedDay))
  })
  const next = upcomingClasses(value.courses)[0]
  el<HTMLElement>('class-upcoming').textContent = next
    ? `Next: ${WEEKDAYS[next.date.getDay()]} ${next.course.start} / ${next.course.title}${next.course.location ? ` / ${next.course.location}` : ''}`
    : 'No upcoming classes. Add your weekly timetable.'
  const courses = value.courses.filter(course => course.days.includes(selectedDay)).sort((a, b) => a.start.localeCompare(b.start))
  const maxPage = Math.max(0, Math.ceil(courses.length / 4) - 1)
  page = Math.max(0, Math.min(page, maxPage))
  el<HTMLElement>('class-page-label').textContent = `${WEEKDAYS[selectedDay]} / ${page + 1} of ${maxPage + 1}`
  el<HTMLButtonElement>('class-prev').disabled = page === 0
  el<HTMLButtonElement>('class-next').disabled = page === maxPage
  const list = el<HTMLElement>('class-list')
  list.replaceChildren()
  el<HTMLElement>('class-empty').hidden = courses.length !== 0
  for (const course of courses.slice(page * 4, page * 4 + 4)) {
    const row = document.createElement('li')
    row.className = `class-row${course.enabled ? '' : ' is-disabled'}`
    const time = document.createElement('span')
    time.className = 'class-time'
    time.textContent = `${course.start}\n${course.end}`
    const body = document.createElement('div')
    body.className = 'class-description'
    const title = document.createElement('strong')
    title.textContent = course.title
    const detail = document.createElement('small')
    detail.textContent = [course.location, course.enabled ? courseDays(course) : 'Paused',
      course.fromDate || course.untilDate ? `${course.fromDate || '…'} to ${course.untilDate || '…'}` : ''].filter(Boolean).join(' / ')
    body.append(title, detail)
    const edit = document.createElement('button')
    edit.className = 'button-secondary'
    edit.type = 'button'; edit.textContent = 'Edit'; edit.dataset.classEdit = course.id
    edit.setAttribute('aria-label', `Edit ${course.title}`)
    const remove = document.createElement('button')
    remove.className = 'todo-remove'
    remove.type = 'button'; remove.textContent = '×'; remove.dataset.classRemove = course.id
    remove.setAttribute('aria-label', `Delete ${course.title}`)
    row.append(time, body, edit, remove)
    list.append(row)
  }
}

export function bindScheduleUi(callbacks: NonNullable<typeof actions>) {
  actions = callbacks
  el<HTMLButtonElement>('class-new').addEventListener('click', () => setEditor())
  el<HTMLButtonElement>('class-cancel').addEventListener('click', closeEditor)
  el<HTMLButtonElement>('schedule-open').addEventListener('click', callbacks.open)
  document.querySelectorAll<HTMLButtonElement>('[data-class-day]').forEach(button => {
    button.addEventListener('click', () => { selectedDay = Number(button.dataset.classDay); page = 0; renderScheduleUi() })
  })
  for (const [id, delta] of [['class-prev', -1], ['class-next', 1]] as const) {
    el<HTMLButtonElement>(id).addEventListener('click', () => { page += delta; renderScheduleUi(); el<HTMLElement>('class-browser').scrollTo(0, 0) })
  }
  el<HTMLInputElement>('class-reminders').addEventListener('change', event => {
    callbacks.save({ ...callbacks.read(), remindersEnabled: (event.target as HTMLInputElement).checked })
    renderScheduleUi()
  })
  el<HTMLElement>('class-list').addEventListener('click', event => {
    if (!(event.target instanceof Element)) return
    const edit = event.target.closest<HTMLButtonElement>('[data-class-edit]')
    const remove = event.target.closest<HTMLButtonElement>('[data-class-remove]')
    const value = callbacks.read()
    if (edit) { const course = value.courses.find(item => item.id === edit.dataset.classEdit); if (course) setEditor(course) }
    else if (remove) callbacks.save({ ...value, courses: value.courses.filter(item => item.id !== remove.dataset.classRemove) })
  })
  el<HTMLFormElement>('class-form').addEventListener('submit', event => {
    event.preventDefault()
    const value = callbacks.read()
    if (!editingId && value.courses.length >= 100) { callbacks.notify('Up to 100 classes. Remove a class first.'); return }
    const clean = (id: string) => el<HTMLInputElement>(id).value.replace(/\s+/g, ' ').trim()
    const course: Course = {
      id: editingId ?? crypto.randomUUID(), title: clean('class-title'), start: clean('class-start'), end: clean('class-end'),
      location: clean('class-location'), fromDate: clean('class-from'), untilDate: clean('class-until'),
      enabled: el<HTMLInputElement>('class-enabled').checked,
      days: [...document.querySelectorAll<HTMLInputElement>('[name="class-day"]:checked')].map(input => Number(input.value)),
    }
    const error = courseError(course)
    if (error) { el<HTMLElement>('class-error').textContent = error; el<HTMLElement>('class-error').hidden = false; return }
    const courses = editingId ? value.courses.map(item => item.id === editingId ? course : item) : [...value.courses, course]
    if (callbacks.save({ ...value, courses })) { closeEditor(); callbacks.notify('Timetable saved. Times follow your phone timezone.') }
  })
  renderScheduleUi()
}
