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

function assessForecastEntry(match: Record<string, unknown>): WeatherAssessment {
  const weather = (match.weather as Array<{ id: number; description: string }>)[0];
  const main = match.main as { temp: number };
  const wind = match.wind as { speed: number };
  const visRaw = match.visibility as number | undefined;

  const weatherId = weather.id;
  const description = weather.description;
  const temp_f = Math.round(main.temp);
  const wind_mph = Math.round(wind.speed);
  const visibility_miles = visRaw ? Math.round(visRaw / 1609) : 10;

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
  } else {
    condition = `✅ Clear conditions — ${description}, ${temp_f}°F, winds ${wind_mph}mph`;
  }

  return { pass, condition, description, temp_f, wind_mph, visibility_miles };
}

/**
 * Assess weather for multiple dates with a SINGLE API call.
 * Returns a map of dateStr → WeatherAssessment.
 */
export async function assessWeatherForDates(
  dates: string[],
  lat: number = DEFAULT_LAT,
  lon: number = DEFAULT_LON
): Promise<Map<string, WeatherAssessment>> {
  const result = new Map<string, WeatherAssessment>();
  const fb = fallback('Weather API unavailable');

  try {
    if (!OPENWEATHER_API_KEY) {
      dates.forEach(d => result.set(d, fallback('No API key configured')));
      return result;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=imperial&cnt=40`,
      { signal: controller.signal }
    );
    clearTimeout(timer);

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      dates.forEach(d => result.set(d, fb));
      return result;
    }

    const data = await res.json() as { list?: unknown[] };
    if (!data?.list || !Array.isArray(data.list)) {
      dates.forEach(d => result.set(d, fb));
      return result;
    }

    const forecasts = data.list as Array<Record<string, unknown>>;

    for (const dateStr of dates) {
      const targetDate = new Date(dateStr).toISOString().split('T')[0];
      const match = forecasts.find(f => {
        const fDate = new Date((f.dt as number) * 1000).toISOString().split('T')[0];
        return fDate === targetDate;
      }) ?? forecasts[0];

      result.set(dateStr, match ? assessForecastEntry(match) : fallback('No forecast data for this date'));
    }
  } catch (err) {
    console.error('Weather service error:', err);
    dates.forEach(d => result.set(d, fb));
  }

  return result;
}

/** Single-date convenience wrapper (used by legacy callers). */
export async function assessWeatherForLesson(
  dateStr: string,
  lat: number = DEFAULT_LAT,
  lon: number = DEFAULT_LON
): Promise<WeatherAssessment> {
  const map = await assessWeatherForDates([dateStr], lat, lon);
  return map.get(dateStr) ?? fallback('Unknown error');
}

function fallback(reason: string): WeatherAssessment {
  return {
    pass: true,
    condition: `simulated VFR — weather API unavailable (${reason})`,
    description: 'simulated',
    temp_f: 72,
    wind_mph: 8,
    visibility_miles: 10,
  };
}
