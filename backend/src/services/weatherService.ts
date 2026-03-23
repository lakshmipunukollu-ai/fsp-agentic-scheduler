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

    // Check content type before parsing — API returns HTML on errors
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      return fallback(`Weather API unavailable (status ${res.status})`);
    }

    const data = await res.json() as any;

    if (!data || !data.list || !Array.isArray(data.list)) {
      return fallback('Invalid weather response');
    }

    const targetDate = new Date(dateStr).toISOString().split('T')[0];
    const forecasts = data.list as any[];
    const match = forecasts.find((f: any) => {
      const fDate = new Date(f.dt * 1000).toISOString().split('T')[0];
      return fDate === targetDate;
    }) || forecasts[0];

    if (!match) return fallback('No forecast data for this date');

    const weatherId = match.weather[0].id;
    const description = match.weather[0].description;
    const temp_f = Math.round(match.main.temp);
    const wind_mph = Math.round(match.wind.speed);
    const visibility_miles = match.visibility ? Math.round(match.visibility / 1609) : 10;

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
  } catch (err) {
    console.error('Weather service error:', err);
    return fallback('Weather check failed');
  }
}

function fallback(reason: string): WeatherAssessment {
  return {
    pass: true,
    // Explicitly label as simulated so the UI can display it accurately
    condition: `simulated VFR — weather API unavailable (${reason})`,
    description: 'simulated',
    temp_f: 72,
    wind_mph: 8,
    visibility_miles: 10,
  };
}
