/**
 * No Express 5 (path-to-regexp v8), `req.params[chave]` é tipado como `string | string[]` porque
 * a sintaxe de rota agora permite captura repetida (ex.: `/files/*path`). Nenhuma rota deste
 * projeto usa captura repetida ou wildcard nos parâmetros nomeados que passam por aqui — todas são
 * segmentos únicos (`/:id`, `/:contactId` etc.), que o Express sempre entrega como `string` em
 * runtime. Este helper só estreita o tipo pra bater com a garantia real da rota; se um dia isso
 * disparar o erro abaixo, é sinal de bug na definição da rota (alguém trocou `:id` por um padrão
 * de captura múltipla), não algo pra silenciar aqui.
 */
export function routeParam(value: string | string[] | undefined, name: string): string {
  if (typeof value === 'string') return value;
  throw new Error(
    `Parâmetro de rota "${name}" esperado como string única, recebeu ${
      Array.isArray(value) ? `array (${JSON.stringify(value)})` : 'undefined'
    }.`,
  );
}
