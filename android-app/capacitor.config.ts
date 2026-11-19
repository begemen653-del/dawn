import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Dawn for Android: a thin native shell around the published site, so every nightly brief and
 * every app update arrives without reinstalling. The site's service worker keeps the app and the
 * last brief available offline after the first start.
 */
const config: CapacitorConfig = {
  appId: "io.github.begemen653.dawn",
  appName: "Dawn",
  // Only shown if the site can't be reached on the very first start (see www/index.html).
  webDir: "www",
  server: {
    url: "https://begemen653-del.github.io/dawn/",
    // Links to news sites open in the phone's browser, not inside the app.
    allowNavigation: [],
    errorPath: "index.html",
  },
  backgroundColor: "#0f141b",
  android: {
    // Matches the app's dark look while it starts.
    backgroundColor: "#0f141b",
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_dawn",
      iconColor: "#e3b36a",
    },
  },
};

export default config;
