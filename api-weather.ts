import express from 'express';
import sharp from 'sharp';
import path from 'path';
import * as lucideIcons from 'lucide-static';
import fs from 'fs';
import { chromium } from 'playwright';

const DASHBOARD_WIDTH = 1024;
const DASHBOARD_HEIGHT = 758;
const PORT = 8080; // Different from the other weather server
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const WEATHER_LOCATION = {
    lat: 42.43378,
    lon: -71.14306
};

// Weather icon mapping to Lucide static SVG strings
// Best guess Environment Canada icons to Lucide icons
// Open Meteo docs: https://open-meteo.com/en/docs#:~:text=Weather%20variable%20documentation
const WEATHER_ICONS: { [key: string]: string[] } = {
    '0': [lucideIcons.Sun, 'Clear sky'],
    '1': [lucideIcons.SunMedium, 'Mainly clear'],
    '2': [lucideIcons.CloudSun, 'Partly cloudy'],
    '3': [lucideIcons.Cloud, 'Overcast'],
    '45': [lucideIcons.CloudFog, 'Fog'],
    '46': [lucideIcons.CloudFog, 'Depositing rime fog'],
    '51': [lucideIcons.CloudDrizzle, 'Light drizzle'],
    '53': [lucideIcons.CloudDrizzle, 'Moderate drizzle'],
    '55': [lucideIcons.CloudDrizzle, 'Dense drizzle'],
    '56': [lucideIcons.CloudHail, 'Freezing light drizzle'],
    '57': [lucideIcons.CloudHail, 'Freezing dense drizzle'],
    '61': [lucideIcons.CloudRain, 'Light rain'],
    '63': [lucideIcons.CloudRain, 'Moderate rain'],
    '65': [lucideIcons.CloudRainWind, 'Heavy rain'],
    '66': [lucideIcons.CloudHail, 'Freezing light rain'],
    '67': [lucideIcons.CloudHail, 'Freezing heavy rain'],
    '71': [lucideIcons.CloudSnow, 'Light snow'],
    '73': [lucideIcons.CloudSnow, 'Moderate snow'],
    '75': [lucideIcons.Snowflake, 'Heavy snow'],
    '77': [lucideIcons.Snowflake, 'Snow grains'],
    '80': [lucideIcons.CloudDrizzle, 'Light rain showers'],
    '81': [lucideIcons.CloudRain, 'Moderate rain showers'],
    '82': [lucideIcons.CloudRainWind, 'Violent rain showers'],
    '85': [lucideIcons.CloudSnow, 'Light snow showers'],
    '86': [lucideIcons.Snowflake, 'Heavy snow showers'],
    '95': [lucideIcons.CloudLightning, 'Thunderstorm'],
    '96': [lucideIcons.CloudLightning, 'Thunderstorm with hail'],

    '124': [lucideIcons.Wind, 'Blowing Snow'],
    '125': [lucideIcons.Tornado, 'Funnel Cloud'],
    '133': [lucideIcons.CloudMoonRain, 'Rain Showers Night'], // Night
    '138': [lucideIcons.CloudMoon, 'Cloudy Night'], // Night
    '140': [lucideIcons.Thermometer, 'Hot'],
    '141': [lucideIcons.ThermometerSnowflake, 'Cold'],
    '142': [lucideIcons.Waves, 'Humidity'],
    '143': [lucideIcons.Wind, 'Wind'],
    // Battery
    '144': [lucideIcons.Battery, 'Battery EMPTY'],
    '145': [lucideIcons.BatteryMedium, 'Battery MEDIUM'],
    '146': [lucideIcons.BatteryFull, 'Battery FULL'],
    '147': [lucideIcons.BatteryLow, 'Battery LOW']
};

function getIconSvg(iconCode: string, size: number = 64): string[] {
    let [svgIcon, description] = WEATHER_ICONS[iconCode];
    if (!svgIcon) {
        console.warn(`Icon code ${iconCode} not found, defaulting to Cloud`);
        [svgIcon, description] = WEATHER_ICONS['3'];
    }
    svgIcon = svgIcon
        .replace(/width="24"/, `width="${size}"`)
        .replace(/height="24"/, `height="${size}"`)
        .replace(/stroke="currentColor"/, `stroke="black"`);
    return [svgIcon, description];
}

function formatDateTime() {
    const date = new Date();
    return date.toLocaleString('en-US', {
        day: '2-digit',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/New_York',
        hour12: true
    }).split(' at ').reverse().join(', ');
    //.replace(',', ' |');
}

function transformObject(obj) {
  const keys = Object.keys(obj);
  const len = obj[keys[0]].length;
  const result = [];

  for (let i = 0; i < len; i++) {
    const newObj = {};
    keys.forEach(key => {
      newObj[key] = obj[key][i];
    });
    result.push(newObj);
  }
  return result;
}

function getBatteryIcon(percentage: number): string[] {
    if (percentage < 2) return getIconSvg('144', 48);      // Battery EMPTY
    if (percentage < 10) return getIconSvg('147', 48);     // Battery LOW
    if (percentage > 90) return getIconSvg('146', 48);     // Battery FULL
    return getIconSvg('145', 48);                          // Battery MEDIUM
}

async function fetchWeatherData() {
    try {
//        const response = await fetch(`https://weather.gc.ca/api/app/en/Location/${WEATHER_LOCATION.lat},${WEATHER_LOCATION.lon}?type=city`, {
//        const response = await fetch(`https://api.weather.gov/points/${WEATHER_LOCATION.lat},${WEATHER_LOCATION.lon}`, {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?forecast_days=8&latitude=${WEATHER_LOCATION.lat}&longitude=${WEATHER_LOCATION.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York`, {
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Cache-Control': 'max-age=0,no-cache',
                'Pragma': 'no-cache',
                'User-Agent': '(kindle.cheni.dev)'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching weather data:', error);
        throw error;
    }
}

export async function captureWeatherScreenshot(batteryPercentage: number) {
    console.log('Starting screenshot capture...');
    const browser = await chromium.launch();
    const context = await browser.newContext({
        viewport: {
            width: DASHBOARD_WIDTH,
            height: DASHBOARD_HEIGHT,
        }
    });

    try {
        // First create the HTML file
        const weatherData = await fetchWeatherData();
        await createWeatherImage(weatherData, batteryPercentage);

        const page = await context.newPage();
        await page.goto(`http://localhost:${PORT}/dashapi.html`);

        // Wait for the content to load
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        // Take screenshot
        const screenshot = await page.screenshot();
        console.log('Screenshot captured');

        // Process the image with Sharp
        const buffer = await sharp(screenshot)
            .png()
            .toBuffer();


        await sharp(buffer)
            .toColorspace('b-w')
            .removeAlpha()
            .rotate(90)
            .png()
            .toFile(path.join(PUBLIC_DIR, 'dash.png'));

        console.log('Final dashboard image created');

    } catch (error) {
        console.error('Screenshot capture failed:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

async function createWeatherImage(weatherData: any, batteryPercentage: number) {
    try {
        console.log('Weather data:', weatherData);
        if (Object.keys(weatherData).length === 0 || !weatherData.current) {
            throw new Error('Invalid weather data format');
        }

	const currentData = weatherData.current;
        const currentIconSvg = getIconSvg(currentData.weather_code, 64)[0];
        const currentTemp = currentData.temperature_2m;
        let currentCondition = "";
        if (currentData.snowfall > 0) {
            currentCondition = "Snow";
        } else if (currentData.rain > 0) {
            currentCondition = "Rain";
        } else if (currentData.showers > 0) {
            currentCondition = "Showers";
        }
		//observation.condition;

        // Format current time
        const currentTime = formatDateTime();

        // Format wind data
        const windSpeed = Math.round(currentData.wind_speed_10m);
        const windString = windSpeed > 0 ? `${windSpeed} ${weatherData.current_units.wind_speed_10m}` : 'Calm';

        // Simplify alert: show only the banner text if available
        let alertHtml = '';
//        if (weatherData0.alert && Array.isArray(weatherData0.alert.alerts) && weatherData0.alert.alerts.length > 0) {
//            alertHtml = `<div class="alert"><strong>${weatherData0.alert.alerts[0].alertBannerText || 'Alert'}</strong></div>`;
//        } else {
//            alertHtml = '';
//        }

        const aqhi = "";//weatherData0.aqhi;

        // Hourly forecast reformatted into a list
        let hourlyHtml = '';
        if (weatherData.hourly) {
            // Drop this by 1 if we add in an alert anywhere
            const hourlyCount = 6;
            const nowHour = new Date(new Date().toLocaleString("en-US", {timeZone: "America/New_York"}));
	    const currentDateByHourIndex = weatherData.hourly.time.indexOf(`${nowHour.getFullYear()}-${(nowHour.getMonth()+1).toString().padStart(2, "0")}-${nowHour.getDate().toString().padStart(2, "0")}T${nowHour.getHours().toString().padStart(2, "0")}:00`); 
            let next6Hours = {};
            for (let key in weatherData.hourly) {
                next6Hours[key] = weatherData.hourly[key].slice(currentDateByHourIndex, currentDateByHourIndex + hourlyCount);
            }
            next6Hours = transformObject(next6Hours);
            hourlyHtml = next6Hours.map((hour: any) => {
                const iconSvgAndDesc = getIconSvg(hour.weather_code, 48);
                const iconSvg = iconSvgAndDesc[0];
                const conditionLength = iconSvgAndDesc[1].length;
                const conditionClass = conditionLength > 20 ? 'hourly-condition long-text' : 
                    conditionLength > 15 ? 'hourly-condition medium-text' :
                    'hourly-condition';
                const timeObj = new Date(hour.time);
                const time = `${timeObj.getHours() % 12 || 12} ${timeObj.getHours() < 12 ? 'am' : 'pm'}`;
                return `<div class="hourly-item">
                          <div class="hourly-time">${time}</div>
                          <div class="hourly-icon">${iconSvg}</div>
                          <div class="hourly-temp">
			    <span class="temp-value">${Math.round(hour.temperature_2m)}</span>${weatherData.hourly_units.temperature_2m}  /  
			    <span class="temp-value">${Math.round(hour.apparent_temperature)}</span>${weatherData.hourly_units.apparent_temperature}
			  </div>
                          <!-- <div class="${conditionClass}">${iconSvgAndDesc[1]}</div> -->
                        </div>`;
                }).join('');
                // Add feels like apparent temp above?
        }

        // Daily forecast optimized to show one row per day with day/night split
        let dailyHtml = '';
        if (weatherData.daily) {
            const dailyForecasts = transformObject(weatherData.daily);
            dailyHtml = dailyForecasts.map((forecast: any) => {
                const date = new Date(forecast.time);
                const dateLabel = `${date.toLocaleDateString('en-US', {weekday: 'short'})}, ${date.getDate()}`;
                let rowHtml = '<div class="daily-item">';
                rowHtml += `<div class="daily-header">${dateLabel}</div>`;

                rowHtml += '<div class="temp-group">';
                if (forecast.temperature_2m_max) {
                    const iconAndDesc = getIconSvg(forecast.weather_code, 48);
                    const summaryLength = iconAndDesc[1].length;
                    const conditionClass = summaryLength > 20 ? 'daily-condition long-text': 'daily-condition';
                    rowHtml += `
                            <div class="temp-block">
                                <div class="temp-row">
                                    <div class="daily-icon">${iconAndDesc[0]}</div>
                                    <div class="daily-temp"><span class="temp-value">${Math.round(forecast.temperature_2m_max)}</span>${weatherData.daily_units.temperature_2m_max}  /  `;
		    rowHtml += `<span class="temp-value">${Math.round(forecast.temperature_2m_min)}</span>${weatherData.daily_units.temperature_2m_min}</div>
    				    </div>
                            <!--    <div class="${conditionClass}">${iconAndDesc[1]}</div> -->
                            </div>`;
                }
                rowHtml += '</div>';
             //   rowHtml += '<div class="temp-group">';
             //   if (forecast.temperature_2m_min) {
             //       const iconAndDesc = getIconSvg(forecast.weather_code, 48);
             //       const summaryLength = iconAndDesc[1].length;
             //       const conditionClass = summaryLength > 20 ? 'daily-condition long-text': 'daily-condition';
             //       rowHtml += `
             //               <div class="temp-block">
             //                   <div class="temp-row">
             //                       <!-- <div class="daily-icon">${iconAndDesc[0]}</div> -->
             //                       <div class="daily-temp"><span class="temp-value">${Math.round(forecast.temperature_2m_min)}</span>${weatherData.daily_units.temperature_2m_min}</div>
             //                   </div>
             //               <!--    <div class="${conditionClass}">${iconAndDesc[1]}</div> -->
             //               </div>`;
             //   }
             //   rowHtml += '</div>';
                rowHtml += '</div>';
                return rowHtml;
            }).join('');
        }

        // Build the HTML with fixed dimensions optimized for Kindle
        const htmlString = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --dashboard-width: 1024px;
      --dashboard-height: 758px;
      --aspect-ratio: calc(758 / 1024);
      
      /* Color variables */
      --text-primary: #000000;    /* For the most important information */
      --text-secondary:rgb(75, 75, 75);  /* For supporting information */
      --text-muted: #666666;     /* For less important details */
      
      /* Add new spacing variable */
      --temp-negative-spacing: 0.07em;
    }
    
    body {
      font-family: 'EB Garamond', serif;
      margin: 0;
      background-color: #f0f0f0;
      width: 100vw;
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
    }
    
    .container {
      width: var(--dashboard-width);
      height: var(--dashboard-height);
      aspect-ratio: calc(1024 / 758);
      display: flex;
      background: #fff;
      max-width: 100vw;
      max-height: 100vh;
      overflow: hidden;
    }
    
    .column {
      flex: 1;
      padding: 20px;
      background: #fff;
      box-sizing: border-box;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    
    #left-column {
      border-right: 3px solid #ccc;
    }
    
    .section {
      margin-bottom: 4px;
      flex-shrink: 0;
    }
    
    .alert {
      border: 1px solid red;
      padding: 8px;
      background: #ffe6e6;
      margin-bottom: 8px;
      font-size: min(39px, 2.9vw);
      font-weight: bold;
    }
    
    .hourly-item, .daily-item {
      display: flex;
      align-items: center;
      margin-bottom: 22px;
      gap: 8px;
    }
    
    .hourly-time, .daily-date {
      flex: 0.5;
      font-size: min(45px, 3.2vw);
      font-weight: bold;
    }
    
    .hourly-icon, .daily-icon {
      flex: 0.3;
    }
    
    .hourly-temp, .daily-temp {
      flex: 1;
      font-size: min(45px, 3.2vw);
      font-weight: bold;
    }
    
    .hourly-condition {
      flex: 2.5;
      font-size: min(45px, 3.2vw);
      font-weight: bold;
      color: var(--text-secondary);
      text-align: center;
    }
    
    .hourly-condition.medium-text {
      font-size: min(39px, 2.9vw);
    }
    
    .hourly-condition.long-text {
      font-size: min(33px, 2.4vw);
    }
    
    h2 {
      font-size: min(51px, 3.4vw);
      margin: 8px 0;
      font-weight: bold;
    }
    
    .icon {
      display: inline-block;
      margin-right: 8px;
    }
    
    .current-temp {
      display: flex;
      align-items: center;
      font-size: min(64px, 7.2vw);
      font-weight: bold;
      color: var(--text-primary);
    }

    .current-apparent-temp {
      display: flex;
      align-items: center;
      font-size: min(64px, 7.2vw);
      font-weight: bold;
      color: var(--text-secondary);
    }
    
    .current-condition, .aqhi-status {
      font-size: min(51px, 3.4vw);
      font-weight: bold;
      margin: 4px 0;
      color: var(--text-secondary);
    }
    
    .daily-forecast-group {
        margin-bottom: 24px;
    }

    .daily-item {
        display: flex;
        align-items: flex-start;
        gap: 16px;
        margin-top: 14px;
        margin-bottom: 20px;
        padding-left: 20px;
    }

    .daily-header {
        font-size: min(51px, 3.4vw);
        font-weight: 900;
        min-width: 180px;
        width: 180px;
        padding-top: 8px;
        text-align: left;
        color: var(--text-primary);
    }

    .temp-group {
        flex: 1;
        min-width: 240px;
        text-align: left;
    }
    
    .temp-row {
        display: flex;
        justify-content: flex-start;
        gap: 8px;
        width: 160px;
    }
    
    .daily-icon {
      display: flex;
      justify-content: left;
      align-items: center;
      width: 48px;
    }
    
    .daily-temp {
      font-size: min(51px, 3.4vw);
      font-weight: 900;
      white-space: nowrap;
      width: 100px;
      text-align: left;
      color: var(--text-primary);
    }
    
    .daily-condition {
        font-size: min(45px, 3.2vw);
        font-weight: 900;
        white-space: normal;
        max-width: 280px;
        line-height: 1.3;
        text-align: left;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        color: var(--text-secondary);
    }

    .daily-condition.long-text {
        font-size: min(39px, 2.9vw);
    }

    .daily-condition.extra-long-text {
        font-size: min(33px, 2.4vw);
    }
    
    .header-status {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: min(51px, 3.4vw);
      font-weight: bold;
      margin-bottom: 12px;
      gap: 16px;
    }

    .ten-day-forecast {
      display: flex;
      justify-content: center;
      align-items: center;
      font-size: min(60px, 7.2vw);
      font-weight: bold;
      margin-bottom: 20px;
      gap: 16px;
    }

    .date-battery {
      font-size: min(45px, 3.2vw);
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .current-weather {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .temp-group {
      display: flex;
      align-items: center;
    }

    .current-time {
      font-size: min(28px, 3.4vw);
      font-weight: bold;
      color: var(--text-primary);
    }
    
    @media (max-aspect-ratio: 1024/758) {
      .container {
        width: 100vw;
        height: calc(100vw * var(--aspect-ratio));
      }
    }
    
    @media (min-aspect-ratio: 1024/758) {
      .container {
        height: 100vh;
        width: calc(100vh / var(--aspect-ratio));
      }
    }

    #right-column {
        font-weight: 900;
    }

    .hourly-time {
        color: var(--text-primary);
    }

    .hourly-temp {
        color: var(--text-primary);
    }

    .current-condition {
        font-size: min(51px, 3.4vw);
        font-weight: bold;
        margin: 4px 0;
        color: var(--text-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
    }

    .current-condition > span {
        display: flex;
        align-items: center;
        gap: 4px;
        flex: 1;
        justify-content: flex-start;
    }

    .current-condition.medium-text {
        font-size: min(45px, 3vw);
    }

    .current-condition.long-text {
        font-size: min(30px, 2.6vw);
    }

    .weather-details {
        font-size: min(36px, 3.4vw);
        font-weight: bold;
        margin: 4px 0;
        color: var(--text-secondary);
        display: flex;
        justify-content: flex-start;
        width: 100%;
        gap: 48px;
    }

    .weather-details > span {
        display: flex;
        align-items: center;
        gap: 16px;
        justify-content: flex-start;
        min-width: 180px;
    }

    /* Add this new class */
    .temp-value {
        letter-spacing: var(--temp-negative-spacing);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="column" id="left-column">
      <div class="section">
        <div class="header-status">
          <span class="current-time">
	  Last updated: ${currentTime.trim()}</span>
        </div>
        <div class="current-weather">
         <!-- <div class="temp-group"> -->
            
	      <span class="current-temp">${currentIconSvg} <span class="temp-value">${Math.round(currentTemp)}</span>${weatherData.current_units.temperature_2m}</span>
	    
	    
	      <span class="current-apparent-temp">${getIconSvg('140', 64)[0]} <span class="temp-value">${Math.round(weatherData.current.apparent_temperature || currentTemp)}</span>${weatherData.current_units.apparent_temperature}</span>
	    
	<!-- </div> -->
        </div>
        <div class="current-condition">
            <div class="weather-details">
                <!-- <span>${getIconSvg('140', 48)[0]} <span class="temp-value">${weatherData.current.apparent_temperature || currentTemp}</span>${weatherData.current_units.apparent_temperature}</span> -->
                <span>${getIconSvg('143', 48)[0]} ${windString}</span>
                <span>${getIconSvg('142', 48)[0]} ${weatherData.current.relative_humidity_2m}%</span>
            </div>
        </div>
        <!-- <div class="aqhi-status">AQHI: something (here)</div> -->
      </div>
      <!-- 
      <div class="section">
        ${alertHtml}
      </div>
      -->
      <div class="section">
        ${hourlyHtml}
      </div>
    </div>
    <div class="column" id="right-column">
      <div class="section">
        <div class="date-battery" style="justify-content: flex-end">
          ${getBatteryIcon(batteryPercentage)[0]} ${batteryPercentage}%
        </div>
        <div class="ten-day-forecast">10 Day Forecast</div>
        ${dailyHtml}
      </div>
    </div>
  </div>
</body>
</html>`;

        fs.writeFileSync(path.join(process.cwd(), 'public', 'dashapi.html'), htmlString);
        console.log('Dashboard HTML created successfully');
    } catch (error) {
        console.error('Error creating dashboard HTML:', error);
        throw error;
    }
}
