declare module 'suncalc' {
  const SunCalc: {
    getMoonIllumination(date: Date): { fraction: number; phase: number; angle: number }
    getMoonTimes(date: Date, latitude: number, longitude: number, inUTC?: boolean): {
      rise?: Date; set?: Date; alwaysUp?: boolean; alwaysDown?: boolean
    }
  }
  export default SunCalc
}
