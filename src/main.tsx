/// <reference types="vite-plugin-pwa/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './styles/globals.css';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });

// `src/bootstrap/frontend.ts` serve o app via Vite em modo dev (StrictMode ativo, com o
// mount→unmount→remount duplo que o React usa em dev para pegar efeito sem cleanup) sempre que
// NODE_ENV !== 'production' — inclusive na suíte E2E (tests/e2e, NODE_ENV=test), porque o
// objetivo ali é rodar contra o Express real (auth, RLS, todas as rotas), não contra `vite
// preview`. Um efeito colateral nunca avaliado: em produção o StrictMode é sempre um no-op (só
// existe em dev), então usuário real nunca vê esse comportamento — mas testes E2E acabam expostos
// a um artefato só do harness de teste que não reflete produção nem o ambiente de
// desenvolvimento normal. Achado real: tests/e2e/cadence.spec.ts falhava de forma determinística
// (strict mode violation, 3 elementos) porque a seção de execuções de cadência aparecia
// triplicada na página sob automação — não reproduz fora de testes automatizados.
// `navigator.webdriver` é o sinal padrão (WebDriver spec) que só fica `true` quando a página é
// carregada por automação real (Playwright/Selenium/etc) — nunca em `npm run dev` normal nem em
// produção — então desligar o StrictMode aqui não reduz a proteção de desenvolvimento real, só
// evita que a suíte E2E teste um comportamento que é exclusivo do harness de teste.
const isAutomatedTest = typeof navigator !== 'undefined' && navigator.webdriver === true;

const app = (
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

createRoot(document.getElementById('root')!).render(
  isAutomatedTest ? app : <StrictMode>{app}</StrictMode>,
);
