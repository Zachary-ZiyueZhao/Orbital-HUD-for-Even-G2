import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import * as sdk from '@evenrealities/even_hub_sdk'
import * as pretext from '@evenrealities/pretext'

const source = await readFile(new URL('../src/weather-native.ts', import.meta.url), 'utf8')
const context = vm.createContext({ exports: {}, require: name => {
  if (name === '@evenrealities/even_hub_sdk') return sdk
  if (name === '@evenrealities/pretext') return pretext
  if (name === './weather-scenes') return { WEATHER_TITLES: ['Weather', '10-day forecast', 'Weather details', 'Environment'] }
  throw new Error(`Unexpected import ${name}`)
} })
vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS } }).outputText, context)
const { buildNativeWeatherContainers } = context.exports
const surfaceSource = await readFile(new URL('../src/hud-surface.ts', import.meta.url), 'utf8')
const surface = await import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(surfaceSource,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText).toString('base64'))
const weather = {
  temperature: -23, feelsLike: -31, high: -18, low: -28, code: 71, city: 'Toronto, Ontario',
  latitude: 43.65, longitude: -79.38, fetchedAt: 0, rainInHours: null, rainAmount: 0, rainChance: 100,
  windSpeed: 103, windDirection: 331, gusts: 124, humidity: 100, cloudCover: 100, visibility: 12300,
  dewPoint: -26, pressure: 1029, uvMax: 12, precipPast24: 20, precipNext24: 30,
  sunrise: '2026-10-17T07:34', sunset: '2026-10-17T18:30',
  forecast: Array.from({ length: 10 }, (_, i) => ({ date: `2026-10-${17 + i}`, low: i - 28, high: i - 18, code: 71, rainChance: 100 })),
  moon: { phase: 0.16, illumination: 42, moonset: '23:12', fullInDays: 9 },
}
for (const data of [null, weather]) for (const unit of ['celsius', 'fahrenheit']) for (let view = 0; view < 4; view++) {
  const texts = buildNativeWeatherContainers(data, null, view, unit, 'Toronto\nWeather summary')
  const rects = surface.surfaceRects(surface.surfaceLayoutForPage('weather', true, true, view))
  const images = rects.map((rect, index) => new sdk.ImageContainerProperty({ xPosition: rect.x, yPosition: rect.y,
    width: rect.width, height: rect.height, containerID: 20 + index, containerName: `art-${index}`, zOrderIndex: index + 1 }))
  const payload = new sdk.CreateStartUpPageContainer({ containerTotalNum: texts.length + images.length,
    textObject: texts, imageObject: images })
  const validation = sdk.validateEvenHubPageContainer(payload.toJson())
  assert.equal(validation.valid, true, JSON.stringify(validation))
  assert.ok(texts.length <= 8 && images.length <= 4 && texts.length + images.length <= 12)
  assert.equal(texts.filter(item => item.isEventCapture === 1).length, 1)
  for (const item of texts) {
    assert.ok(Buffer.byteLength(item.content) <= 999)
    assert.ok(item.xPosition >= 0 && item.yPosition >= 0 && item.xPosition + item.width <= 576 && item.yPosition + item.height <= 288)
    if (item.containerName.startsWith('weather-rule-')) {
      assert.equal(item.borderWidth, 1, 'rules must use continuous native borders')
      assert.equal(item.content, ' ')
    } else if (item.containerName !== 'weather-frame') {
      for (const line of item.content.split('\n')) assert.ok(pretext.getTextWidth(line) <= item.width,
        `text must not wrap/scroll: ${item.containerName}: ${line}`)
      assert.ok(item.content.split('\n').length * 27 <= item.height)
    }
  }
  if (view === 1 && data) assert.ok(texts.find(item => item.containerName === 'wx-days-0').content.startsWith('Today'), 'Today must fit without truncation')
}
console.log('Native weather checks passed: all views and units fit SDK budgets, native rules stay continuous, and text fits without wrapping.')
