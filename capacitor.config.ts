import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.droplibrary.app',
  appName: 'Drop Library',
  webDir: 'dist',
  backgroundColor: '#0A0A0A',
  android: {
    backgroundColor: '#0A0A0A',
    allowMixedContent: false,
  },
  plugins: {
    StatusBar: {
      backgroundColor: '#0A0A0A',
      style: 'DARK', // light content on dark background
    },
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;

