const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

// SkyHigh Flight School - Austin TX (default location)
const DEFAULT_LAT = 30.2672;
const DEFAULT_LON = -97.7431;

export interface WeatherAssessment {
  pass: boolean;
  condition: string;
  description: string;
  temp_f: number;
  wind_mph: number;
  visibility_miles: number;
}

export async function assessWeatherForLesson(
  dateStr: string,
  lat: number = DEFAULT_LAT,
  lon: number = DEFAULT_LON
): Promise<WeatherAssessment> {
  try {
    if (!OPENWEATHER_API_KEY) {
      return fallback('No API key configured');
    }

    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=imperial&cnt=40`;
    const res = await fetch(url);

    if (!res.ok) {
      return fallback('Weather API unavailable');
    }

    const data = await res.json() as any;
    const targetDate = new Date(dateStr).toISOString().split('T')[0];

    // Find forecast entry closest to the lesson date at 10am
    const forecasts = (data.list || []) as any[];
    const match = forecasts.find((f: { dt: number }) => {
      const fDate = new Date(f.dt * 1000).toISOString().split('T')[0];
      return fDate === targetDate;
    }) || forecasts[0];

    if (!match) return fallback('No forecast data for this date');

    const weatherId = match.weather[0].id;
    const description = match.weather[0].description;
    const temp_f = Math.round(match.main.temp);
    const wind_mph = Math.round(match.wind.speed);
    const visibility_miles = match.visibility ? Math.round(match.visibility / 1609) : 10;
    const clouds = match.clouds?.all ?? 0;

    // VFR minimums: visibility > 3mi, ceiling > 1000ft, no thunderstorms
    // Weather IDs: 2xx = thunderstorm, 3xx = drizzle, 5xx = rain, 6xx = snow, 7xx = atmosphere (fog etc)
    const isThunderstorm = weatherId >= 200 && weatherId < 300;
    const isHeavyRain = weatherId >= 500 && weatherId < 600;
    const isSnow = weatherId >= 600 && weatherId < 700;
    const isPoorVisibility = weatherId >= 700 && weatherId < 800;
    const isWindy = wind_mph > 25;
    const isLowVis = visibility_miles < 3;

    let pass = true;
    let condition = 'VFR';

    if (isThunderstorm) {
      pass = false;
      condition = '⛈ Thunderstorm forecast — lesson not recommended';
    } else if (isHeavyRain) {
      pass = false;
      condition = '🌧 Heavy rain forecast — IFR conditions likely';
    } else if (isSnow) {
      pass = false;
      condition = '🌨 Snow forecast — ground ops affected';
    } else if (isPoorVisibility || isLowVis) {
      pass = false;
      condition = '🌫 Poor visibility forecast — below VFR minimums';
    } else if (isWindy) {
      pass = false;
      condition = `💨 High winds (${wind_mph}mph) — exceeds student pilot limits`;
    } else if (clouds > 75) {
      pass = true;
      condition = `⛅ Overcast (${clouds}% cloud cover) — VFR marginal`;
    } else {
      condition = `✅ Clear conditions — ${description}, ${temp_f}°F, winds ${wind_mph}mph`;
    }

    return { pass, condition, description, temp_f, wind_mph, visibility_miles };
  } catch (err) {
    console.error('Weather service error:', err);
    return fallback('Weather check failed');
  }
}

function fallback(reason: string): WeatherAssessment {
  return {
    pass: true,
    condition: `weather data unavailable (${reason})`,
    description: 'unknown',
    temp_f: 0,
    wind_mph: 0,
    visibility_miles: 10,
  };
}
