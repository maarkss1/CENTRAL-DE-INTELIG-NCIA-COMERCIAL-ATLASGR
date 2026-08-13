import type { CapacitorConfig } from '@capacitor/cli';

// TEMPORÁRIO: IP local do servidor (mesma rede Wi-Fi/LAN), só pra testar o app
// no celular enquanto não existe hospedagem em produção. Troque para a URL
// pública (https) assim que o deploy definitivo existir, e mude cleartext
// para false — depois rode `npx cap sync android` de novo.
const PRODUCTION_URL = process.env.CAPACITOR_SERVER_URL || 'http://192.168.0.179:3005';
const IS_LOCAL_TEST_URL = PRODUCTION_URL.startsWith('http://');

const config: CapacitorConfig = {
  appId: 'br.com.atlasgr.prospector',
  appName: 'AtlasGR Prospector',
  webDir: 'dist',
  
};

export default config;
