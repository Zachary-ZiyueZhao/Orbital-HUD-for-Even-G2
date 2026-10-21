export type DashboardIcon = 'info' | 'ai' | 'weather' | 'todo' | 'leetcode' | 'study' | 'schedule' | 'algorithms' | 'teleprompt' | 'back'
export const DASHBOARD_ICON_SIZE = 20

// One native display pixel per stroke, matching the bitmap font's thin stems.
// Render at 1:1 resolution; do not use emoji or a browser icon font.
export function drawDashboardIcon(context: CanvasRenderingContext2D, icon: DashboardIcon, x: number, y: number) {
  context.save()
  context.translate(Math.round(x), Math.round(y))
  context.lineWidth = 1
  context.strokeStyle = '#fff'
  context.fillStyle = '#fff'
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  if (icon === 'teleprompt') {
    context.rect(1.5, 2.5, 17, 12)
    context.moveTo(5.5, 6.5); context.lineTo(14.5, 6.5)
    context.moveTo(5.5, 10.5); context.lineTo(12.5, 10.5)
    context.moveTo(9.5, 14.5); context.lineTo(9.5, 18.5)
    context.moveTo(5.5, 18.5); context.lineTo(13.5, 18.5)
  } else if (icon === 'algorithms') {
    context.moveTo(9.5, 4.5); context.lineTo(6.5, 2.5); context.lineTo(.5, 2.5)
    context.lineTo(.5, 16.5); context.lineTo(6.5, 16.5); context.lineTo(9.5, 18.5)
    context.lineTo(12.5, 16.5); context.lineTo(18.5, 16.5); context.lineTo(18.5, 2.5)
    context.lineTo(12.5, 2.5); context.lineTo(9.5, 4.5); context.lineTo(9.5, 18.5)
  } else if (icon === 'study') {
    context.moveTo(1.5, 5.5); context.lineTo(7.5, 5.5); context.lineTo(9.5, 7.5)
    context.lineTo(18.5, 7.5); context.lineTo(18.5, 17.5); context.lineTo(1.5, 17.5); context.closePath()
  } else if (icon === 'schedule') {
    context.rect(2.5, 3.5, 15, 15)
    context.moveTo(2.5, 7.5); context.lineTo(17.5, 7.5)
    context.moveTo(6.5, .5); context.lineTo(6.5, 5.5)
    context.moveTo(13.5, .5); context.lineTo(13.5, 5.5)
    context.moveTo(7.5, 10.5); context.lineTo(7.5, 15.5)
    context.moveTo(12.5, 10.5); context.lineTo(12.5, 15.5)
  } else if (icon === 'back') {
    context.moveTo(8.5, 3.5); context.lineTo(2.5, 9.5); context.lineTo(8.5, 15.5)
    context.moveTo(2.5, 9.5); context.lineTo(17.5, 9.5)
  } else if (icon === 'info') {
    context.arc(9.5, 9.5, 8, 0, Math.PI * 2)
    context.stroke()
    context.fillRect(9, 5, 1, 1)
    context.beginPath()
    context.moveTo(8.5, 8.5)
    context.lineTo(9.5, 8.5)
    context.lineTo(9.5, 14.5)
    context.moveTo(7.5, 14.5)
    context.lineTo(11.5, 14.5)
  } else if (icon === 'ai') {
    context.moveTo(8.5, 1.5)
    context.lineTo(10.5, 7.5)
    context.lineTo(16.5, 9.5)
    context.lineTo(10.5, 11.5)
    context.lineTo(8.5, 17.5)
    context.lineTo(6.5, 11.5)
    context.lineTo(0.5, 9.5)
    context.lineTo(6.5, 7.5)
    context.closePath()
    context.moveTo(16.5, 1.5)
    context.lineTo(16.5, 5.5)
    context.moveTo(14.5, 3.5)
    context.lineTo(18.5, 3.5)
  } else if (icon === 'weather') {
    context.arc(13, 6, 3.5, Math.PI * 0.9, Math.PI * 2.25)
    context.moveTo(13.5, 0.5)
    context.lineTo(13.5, 1.5)
    context.moveTo(18.5, 6.5)
    context.lineTo(19.5, 6.5)
    context.moveTo(17.5, 2.5)
    context.lineTo(18.5, 1.5)
    context.stroke()
    context.beginPath()
    context.moveTo(5, 17.5)
    context.bezierCurveTo(-1, 17.5, -1, 10.5, 5, 10.5)
    context.bezierCurveTo(5, 4, 14, 4, 14, 11.5)
    context.bezierCurveTo(20, 10, 21, 17.5, 15, 17.5)
    context.closePath()
  } else if (icon === 'leetcode') {
    context.moveTo(6.5, 4.5)
    context.lineTo(1.5, 9.5)
    context.lineTo(6.5, 14.5)
    context.moveTo(13.5, 4.5)
    context.lineTo(18.5, 9.5)
    context.lineTo(13.5, 14.5)
    context.moveTo(11.5, 2.5)
    context.lineTo(8.5, 17.5)
  } else {
    context.moveTo(3.5, 1.5)
    context.lineTo(12.5, 1.5)
    context.lineTo(16.5, 5.5)
    context.lineTo(16.5, 18.5)
    context.lineTo(3.5, 18.5)
    context.closePath()
    context.moveTo(12.5, 1.5)
    context.lineTo(12.5, 5.5)
    context.lineTo(16.5, 5.5)
    for (const lineY of [8.5, 11.5, 14.5]) {
      context.moveTo(6.5, lineY)
      context.lineTo(13.5, lineY)
    }
  }
  context.stroke()
  context.restore()
}
