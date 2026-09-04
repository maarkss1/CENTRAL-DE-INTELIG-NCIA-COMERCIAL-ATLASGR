// Mantido como hook explícito porque o Playwright aponta para este arquivo.
// Market Intelligence foi retirado do produto, então não há mais dataset global a semear.
export default async function globalSetup() {
  return Promise.resolve();
}
