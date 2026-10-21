export const HOME_SECTIONS = ['info', 'ai', 'weather', 'todo', 'study'] as const
export const STUDY_SECTIONS = ['schedule', 'leetcode', 'algorithms', 'teleprompt', 'back'] as const
export type HomeFolder = 'root' | 'study'
export type HomeSection = typeof HOME_SECTIONS[number] | typeof STUDY_SECTIONS[number]
export function homeSections(folder: HomeFolder): readonly HomeSection[] {
  return folder === 'study' ? STUDY_SECTIONS : HOME_SECTIONS
}
export const HOME_SECTION_TITLES: Record<HomeSection, string> = {
  info: 'Information', ai: 'AI assistant', weather: 'Weather', todo: 'To-do list', study: 'Study',
  leetcode: 'LeetCode daily', schedule: 'Timetable', algorithms: 'Algorithms', teleprompt: 'Teleprompt', back: 'Back',
}
// One native text column gives every marker the same x coordinate, independent
// of title widths. Its native line height matches the five 27px menu rows.
export function homeNativeIndicators(selected: HomeSection, folder: HomeFolder = 'root'): string {
  return homeSections(folder).map(section => section === selected ? '<' : '-').join('\n')
}

export function homeSelectionStep(selected: HomeSection, direction: -1 | 1, folder: HomeFolder = 'root'): HomeSection {
  const sections = homeSections(folder)
  return sections[(sections.indexOf(selected) + direction + sections.length) % sections.length]
}

export function homeSectionLabel(section: HomeSection): string {
  return HOME_SECTION_TITLES[section]
}
