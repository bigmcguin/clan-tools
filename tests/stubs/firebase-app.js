// Test stand-in for the Firebase app module (served by Playwright instead of the CDN).
export function initializeApp(config) { return { config }; }
