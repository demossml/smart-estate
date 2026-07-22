declare module 'suncalc' {
  export function getTimes(
    date: Date,
    lat: number,
    lng: number
  ): {
    solarNoon: Date;
    nadir: Date;
    sunrise: Date;
    sunset: Date;
    sunriseEnd: Date;
    sunsetStart: Date;
    dawn: Date;
    dusk: Date;
    nauticalDawn: Date;
    nauticalDusk: Date;
    nightEnd: Date;
    night: Date;
    goldenHourEnd: Date;
    goldenHour: Date;
  };
  export function getPosition(
    date: Date,
    lat: number,
    lng: number
  ): { azimuth: number; altitude: number };
}
