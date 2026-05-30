/// <reference types="bun" />

import { createPlugin, defineAction } from "../src/index.js";

type CallRecord = {
  route: string;
  at: string;
  details?: Record<string, unknown>;
};

type OpenMeteoForecast = {
  latitude: number;
  longitude: number;
  timezone?: string;
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  current_units?: Record<string, string>;
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    weather_code?: number[];
  };
  daily_units?: Record<string, string>;
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    precipitation_probability?: number[];
    wind_speed_10m?: number[];
  };
  hourly_units?: Record<string, string>;
};

type DailyForecast = {
  date: string;
  high: number | null;
  low: number | null;
  precipitationProbability: number | null;
  weatherCode: number | null;
  conditions: string;
};

const calls: CallRecord[] = [];

function record(route: string, details?: Record<string, unknown>): void {
  const call: CallRecord = {
    route,
    at: new Date().toISOString(),
  };

  if (details !== undefined) {
    call.details = details;
  }

  calls.push(call);
}

const weatherCodeDescriptions = new Map<number, string>([
  [0, "Clear sky"],
  [1, "Mainly clear"],
  [2, "Partly cloudy"],
  [3, "Overcast"],
  [45, "Fog"],
  [48, "Depositing rime fog"],
  [51, "Light drizzle"],
  [53, "Moderate drizzle"],
  [55, "Dense drizzle"],
  [56, "Light freezing drizzle"],
  [57, "Dense freezing drizzle"],
  [61, "Slight rain"],
  [63, "Moderate rain"],
  [65, "Heavy rain"],
  [66, "Light freezing rain"],
  [67, "Heavy freezing rain"],
  [71, "Slight snow fall"],
  [73, "Moderate snow fall"],
  [75, "Heavy snow fall"],
  [77, "Snow grains"],
  [80, "Slight rain showers"],
  [81, "Moderate rain showers"],
  [82, "Violent rain showers"],
  [85, "Slight snow showers"],
  [86, "Heavy snow showers"],
  [95, "Thunderstorm"],
  [96, "Thunderstorm with slight hail"],
  [99, "Thunderstorm with heavy hail"],
]);

function stringParameter(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

function numberParameter(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function selectParameter(value: unknown, fallback: string, allowed: readonly string[]): string {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

function boundedForecastDays(value: unknown): number {
  const parsed = Math.round(numberParameter(value, 3));
  return Math.min(7, Math.max(1, parsed));
}

function weatherDescription(code: number | null | undefined): string {
  if (typeof code !== "number") {
    return "Unknown conditions";
  }

  return weatherCodeDescriptions.get(code) ?? `WMO weather code ${code}`;
}

function round(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function at<T>(values: T[] | undefined, index: number): T | undefined {
  return values?.[index];
}

function buildOpenMeteoUrl(options: {
  latitude: number;
  longitude: number;
  timezone: string;
  forecastDays: number;
  temperatureUnit: string;
  windSpeedUnit: string;
}): string {
  const url = new URL("https://api.open-meteo.com/v1/forecast");

  url.searchParams.set("latitude", String(options.latitude));
  url.searchParams.set("longitude", String(options.longitude));
  url.searchParams.set("timezone", options.timezone);
  url.searchParams.set("forecast_days", String(options.forecastDays));
  url.searchParams.set("temperature_unit", options.temperatureUnit);
  url.searchParams.set("wind_speed_unit", options.windSpeedUnit);
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
  );
  url.searchParams.set("hourly", "temperature_2m,precipitation_probability,wind_speed_10m");
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
  );

  return url.toString();
}

function buildDailyForecast(forecast: OpenMeteoForecast): DailyForecast[] {
  const dates = forecast.daily?.time ?? [];

  return dates.map((date, index) => {
    const code = at(forecast.daily?.weather_code, index) ?? null;

    return {
      date,
      high: round(at(forecast.daily?.temperature_2m_max, index)),
      low: round(at(forecast.daily?.temperature_2m_min, index)),
      precipitationProbability: round(at(forecast.daily?.precipitation_probability_max, index)),
      weatherCode: code,
      conditions: weatherDescription(code),
    };
  });
}

function buildHourlyPreview(forecast: OpenMeteoForecast): Record<string, unknown>[] {
  const times = forecast.hourly?.time?.slice(0, 24) ?? [];

  return times.map((time, index) => ({
    time,
    temperature: round(at(forecast.hourly?.temperature_2m, index)),
    precipitationProbability: round(at(forecast.hourly?.precipitation_probability, index)),
    windSpeed: round(at(forecast.hourly?.wind_speed_10m, index)),
  }));
}

function buildChartUrl(
  locationLabel: string,
  daily: DailyForecast[],
  temperatureUnit: string,
): string {
  const unit = temperatureUnit === "fahrenheit" ? "F" : "C";
  const chart = {
    type: "bar",
    data: {
      labels: daily.map((day) => day.date),
      datasets: [
        {
          type: "line",
          label: `High (${unit})`,
          data: daily.map((day) => day.high),
          borderColor: "#f97316",
          backgroundColor: "rgba(249, 115, 22, 0.12)",
          tension: 0.35,
          yAxisID: "y",
        },
        {
          type: "line",
          label: `Low (${unit})`,
          data: daily.map((day) => day.low),
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.12)",
          tension: 0.35,
          yAxisID: "y",
        },
        {
          type: "bar",
          label: "Precip %",
          data: daily.map((day) => day.precipitationProbability),
          backgroundColor: "rgba(14, 165, 233, 0.35)",
          borderColor: "#0ea5e9",
          yAxisID: "y1",
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          position: "bottom",
        },
        title: {
          display: true,
          text: `${locationLabel} forecast`,
        },
      },
      scales: {
        y: {
          title: {
            display: true,
            text: `Temperature (${unit})`,
          },
        },
        y1: {
          beginAtZero: true,
          max: 100,
          position: "right",
          grid: {
            drawOnChartArea: false,
          },
          title: {
            display: true,
            text: "Precipitation probability",
          },
        },
      },
    },
  };
  const url = new URL("https://quickchart.io/chart");

  url.searchParams.set("version", "4");
  url.searchParams.set("width", "900");
  url.searchParams.set("height", "420");
  url.searchParams.set("devicePixelRatio", "2");
  url.searchParams.set("backgroundColor", "white");
  url.searchParams.set("format", "png");
  url.searchParams.set("c", JSON.stringify(chart));

  return url.toString();
}

const plugin = createPlugin({
  id: "codex-sdk-live",
  label: "Open-Meteo Weather",
  icon: "cloud-sun",
  description: "Weather demo Planelet implemented with planelet-sdk-ts.",
  actions: [
    defineAction({
      id: "weather-briefing",
      label: "Weather Briefing",
      icon: "cloud-sun",
      description: "Fetches a visual Open-Meteo forecast summary for a location.",
      parameters: [
        {
          id: "locationLabel",
          label: "Location Label",
          type: "string",
          required: true,
          default: "San Francisco",
        },
        {
          id: "latitude",
          label: "Latitude",
          type: "number",
          required: true,
          default: 37.7749,
        },
        {
          id: "longitude",
          label: "Longitude",
          type: "number",
          required: true,
          default: -122.4194,
        },
        {
          id: "forecastDays",
          label: "Forecast Days",
          type: "number",
          default: 3,
        },
        {
          id: "temperatureUnit",
          label: "Temperature Unit",
          type: "select",
          default: "fahrenheit",
          options: [
            { label: "Fahrenheit", value: "fahrenheit" },
            { label: "Celsius", value: "celsius" },
          ],
        },
        {
          id: "windSpeedUnit",
          label: "Wind Speed Unit",
          type: "select",
          default: "mph",
          options: [
            { label: "Miles per hour", value: "mph" },
            { label: "Kilometers per hour", value: "kmh" },
          ],
        },
      ],
      execute: async ({ parameters }) => {
        const locationLabel = stringParameter(parameters.locationLabel, "San Francisco");
        const latitude = numberParameter(parameters.latitude, 37.7749);
        const longitude = numberParameter(parameters.longitude, -122.4194);
        const forecastDays = boundedForecastDays(parameters.forecastDays);
        const temperatureUnit = selectParameter(parameters.temperatureUnit, "fahrenheit", [
          "fahrenheit",
          "celsius",
        ]);
        const windSpeedUnit = selectParameter(parameters.windSpeedUnit, "mph", ["mph", "kmh"]);
        const timezone = stringParameter(parameters.timezone, "auto");
        const openMeteoUrl = buildOpenMeteoUrl({
          latitude,
          longitude,
          timezone,
          forecastDays,
          temperatureUnit,
          windSpeedUnit,
        });

        record("actions.weather-briefing.execute", {
          parameters: {
            locationLabel,
            latitude,
            longitude,
            forecastDays,
            temperatureUnit,
            windSpeedUnit,
          },
        });

        const response = await fetch(openMeteoUrl);

        if (!response.ok) {
          const error = await response.text();
          return {
            success: false,
            error: `Open-Meteo returned ${response.status}: ${error}`,
          };
        }

        const forecast = (await response.json()) as OpenMeteoForecast;
        const daily = buildDailyForecast(forecast);
        const currentCode = forecast.current?.weather_code;
        const chartUrl = buildChartUrl(locationLabel, daily, temperatureUnit);
        const temperatureUnitLabel = forecast.current_units?.temperature_2m ?? temperatureUnit;
        const windUnitLabel = forecast.current_units?.wind_speed_10m ?? windSpeedUnit;
        const currentTemperature = round(forecast.current?.temperature_2m);
        const currentConditions = weatherDescription(currentCode);
        const today = daily[0];

        return {
          success: true,
          data: {
            source: "open-meteo",
            sourceUrl: openMeteoUrl,
            fetchedAt: new Date().toISOString(),
            location: {
              label: locationLabel,
              latitude: forecast.latitude,
              longitude: forecast.longitude,
              timezone: forecast.timezone ?? timezone,
            },
            current: {
              time: forecast.current?.time,
              temperature: currentTemperature,
              temperatureUnit: temperatureUnitLabel,
              apparentTemperature: round(forecast.current?.apparent_temperature),
              windSpeed: round(forecast.current?.wind_speed_10m),
              windSpeedUnit: windUnitLabel,
              weatherCode: currentCode ?? null,
              conditions: currentConditions,
            },
            daily,
            hourlyPreview: buildHourlyPreview(forecast),
            summary: `${locationLabel}: ${currentTemperature ?? "unknown"}${temperatureUnitLabel} and ${currentConditions.toLowerCase()} now. Today's range is ${today?.low ?? "unknown"}-${today?.high ?? "unknown"}${temperatureUnitLabel}.`,
            chart: {
              type: "temperature-and-precipitation",
              url: chartUrl,
              imageMarkdown: `![${locationLabel} forecast](${chartUrl})`,
            },
          },
        };
      },
    }),
  ],
  triggers: [],
});

const port = Number(process.env.PORT ?? 3011);

Bun.serve({
  hostname: "0.0.0.0",
  port,
  fetch: async (request) => {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (url.pathname === "/debug/calls") {
      return Response.json({ calls });
    }

    if (url.pathname === "/debug/reset") {
      calls.length = 0;
      return Response.json({ ok: true });
    }

    record("http.request", {
      method: request.method,
      path: url.pathname,
    });

    return plugin.fetch(request);
  },
});

console.log(`Codex SDK Live Planelet listening on http://127.0.0.1:${port}`);
