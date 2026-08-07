import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.avenirsms.app',
  appName: 'Avenir SIS',
  webDir: 'dist',
  server: {
    // Remove this block (or set androidScheme: 'https') for production builds.
    // For local testing against the live Firebase backend:
    androidScheme: 'https',
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#1e3a5f',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
};

export default config;
