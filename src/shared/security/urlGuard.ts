import dns from 'node:dns/promises';
import net from 'node:net';
import type { LookupFunction } from 'node:net';
import { Agent } from 'undici';
import { AppError } from '../middlewares/errorHandler.js';

// `RequestInit` global deste projeto vem do lib "DOM" do tsconfig (compartilhado com o frontend)
// — esse tipo não conhece a opção `dispatcher` (extensão do Node/undici usada abaixo para fixar a
// conexão real nos endereços já validados), embora o `fetch` global do Node aceite normalmente em
// tempo de execução (é a mesma implementação undici por baixo). `dispatcher` entra via cast só
// para contornar essa lacuna de tipo — continuamos usando o `fetch`/`Response` globais (não os do
// pacote `undici`) para o `Response` devolvido permanecer o mesmo tipo que todo o resto do código
// já espera.

// SSRF: guard genérico para QUALQUER URL fornecida por um usuário/tenant que o servidor vai
// buscar (fetch/POST/HEAD) — webhook de integração (Bitrix24), PABX de telefonia (3CX), ou
// qualquer outro campo futuro do tipo "URL de callback"/"URL de destino" armazenado no banco ou
// recebido em input. Promovido de `src/lib/adapters/crm/Bitrix24Adapter.ts` (onde nasceu só para
// o caso Bitrix, mas já era importado cross-feature pelo 3CX) para `src/shared/security/` —
// mesmo comportamento, local e nome genéricos. Bloqueamos esquemas não-HTTPS e qualquer host que
// resolva para um endereço privado/reservado/loopback/link-local antes de qualquer fetch real.
//
// NÃO usar para URLs de provedor fixas/hardcoded no próprio código (Apollo, Hunter, OpenAI,
// Tavily, DuckDuckGo etc.) — o destino já é conhecido e confiável, não há SSRF ali. Este guard é
// só para URL que veio de um campo de banco ou de input do usuário.
function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
    if (a >= 224) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fe80:')) return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('::ffff:')) {
      const mapped = lower.split(':').pop();
      if (mapped && net.isIPv4(mapped)) return isPrivateOrReservedIp(mapped);
    }
    return false;
  }
  return true;
}

/** Endereços já validados (não-privados/reservados) de um host, resolvidos numa única checagem. */
interface SafeResolution {
  addresses: string[];
}

/**
 * Valida `rawUrl` (esquema HTTPS, host que não é `localhost`, IP literal que não seja
 * privado/reservado) e resolve+valida cada endereço do host, se for um hostname. Lança
 * `AppError(..., 400)` no primeiro problema encontrado. Base compartilhada por
 * `assertSafeExternalUrl` (checagem isolada, sem fetch) e `safeFetch` (checagem + conexão real
 * fixada nos MESMOS endereços validados aqui — ver comentário de `safeFetch` abaixo).
 */
async function resolveSafe(rawUrl: string): Promise<SafeResolution> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError('URL informada é inválida.', 400);
  }

  if (url.protocol !== 'https:') {
    throw new AppError('A URL informada deve usar HTTPS.', 400);
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new AppError('Endereço não permitido.', 400);
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new AppError('Endereço não permitido (IP privado/reservado).', 400);
    }
    return { addresses: [hostname] };
  }

  const records = await dns.lookup(hostname, { all: true }).catch(() => []);
  if (records.length === 0) {
    throw new AppError('Não foi possível resolver o host informado.', 400);
  }
  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new AppError('Endereço não permitido (resolve para IP privado/reservado).', 400);
    }
  }
  return { addresses: records.map((record) => record.address) };
}

/**
 * Valida que `rawUrl` é segura para o servidor buscar (fetch) de verdade: HTTPS, host que não
 * resolve para IP privado/reservado/loopback/link-local. Lança `AppError(..., 400)` caso
 * contrário.
 *
 * Use isto só para validar uma URL SEM fazer o fetch real na mesma chamada (ex.: `connect3CX`
 * validando antes de persistir). Para qualquer fetch real contra URL de usuário/tenant, prefira
 * `safeFetch` abaixo — ela reaproveita esta mesma validação, mas fecha a janela de DNS rebinding
 * que existe aqui: entre este `assertSafeExternalUrl` retornar e o `fetch` seguinte rodar, o host
 * pode responder um IP público desta vez e um IP privado da próxima (a validação e a conexão real
 * resolvem o DNS em dois momentos separados).
 */
export async function assertSafeExternalUrl(rawUrl: string): Promise<void> {
  await resolveSafe(rawUrl);
}

/**
 * Busca `rawUrl` (URL de usuário/tenant — webhook Bitrix24, PABX 3CX, etc.) com o mesmo guard de
 * `assertSafeExternalUrl`, mas fixando ("pinning") a conexão TCP real nos ENDEREÇOS JÁ VALIDADOS
 * nesta mesma chamada — nenhuma segunda resolução de DNS acontece entre a validação e a conexão de
 * verdade, o que fecha a janela de DNS rebinding que `assertSafeExternalUrl` seguido de um `fetch`
 * cru não fecha (o host pode responder um IP público na validação e um IP privado no `fetch`
 * seguinte, que resolve o DNS de novo, de forma independente).
 *
 * Implementado com um `undici.Agent` cuja resolução de DNS (`connect.lookup`) é sobrescrita para
 * devolver sempre os mesmos endereços já validados, para qualquer host perguntado — inclusive um
 * host de redirecionamento HTTP, que por isso nunca é resolvido de verdade: uma resposta 3xx troca
 * de host falha (mismatch de TLS/SNI contra o IP fixado), em vez de abrir uma conexão nova e não
 * validada. Nenhuma das URLs chamadas por este guard (webhook Bitrix24, PABX 3CX) espera
 * redirecionamento hoje.
 */
export async function safeFetch(rawUrl: string, init: RequestInit = {}): Promise<Response> {
  const { addresses } = await resolveSafe(rawUrl);
  const pinnedLookup: LookupFunction = (_hostname, _options, callback) => {
    callback(
      null,
      addresses.map((address) => ({ address, family: net.isIPv6(address) ? 6 : 4 })),
    );
  };

  // Agent de uso único (nunca reaproveitado entre chamadas — cada `safeFetch` valida e fixa seus
  // próprios endereços).
  const dispatcher = new Agent({ connect: { lookup: pinnedLookup } });
  try {
    const response = await fetch(rawUrl, { ...init, dispatcher } as unknown as RequestInit);
    // Materializa o corpo INTEIRO aqui dentro, antes de fechar o dispatcher — devolver a
    // `Response` original ao chamador e só então fechar a conexão quebraria `res.json()`/
    // `res.text()` do chamador (o corpo ainda pode estar em streaming da conexão real quando o
    // `fetch` acima resolve, que só espera os headers). `204`/`205`/`304` nunca têm corpo — passar
    // um `ArrayBuffer` vazio mesmo assim faz o construtor de `Response` rejeitar.
    const bodyBuffer = await response.arrayBuffer();
    const noBodyAllowed = [204, 205, 304].includes(response.status);
    return new Response(noBodyAllowed ? null : bodyBuffer, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } finally {
    await dispatcher.close();
  }
}
