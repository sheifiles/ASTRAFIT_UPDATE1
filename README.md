# ASTRAFIT

Crew health app for a 480x320 Raspberry Pi touchscreen. Splash -> crew dropdown login (stays logged in) -> body selector -> pain -> guided probe scan -> ultrasound. VITALS and EMERGENCY are on every crew screen. Admin login = full database download.

    npm install
    npm run dev        # open in a browser; the 480x320 stage scales to fit the window

## Where the hardware goes
`src/sensors.ts` is the only file to edit. See `readMax30102()` and `readMpuMotion()` placeholders, or set `VITE_SENSOR_BRIDGE=ws://localhost:8765` and stream JSON from a Pi service:
`{"hr":72,"spo2":98,"sys":118,"dia":76,"g":1.02,"pitch":4.2,"roll":-1.8}`

## Emergency alerts
`src/api.ts` (bottom) + `api/alerts.ts`. Every crew device polls the shared backend; an incoming alert takes over the screen with a beep until acknowledged. To use a local Pi network instead, replace `getAlerts / sendAlert / alertAction`.

## Crew roster
Six crew are seeded in `api/_lib.ts` and `server/index.js` (rename them there or in the database).
