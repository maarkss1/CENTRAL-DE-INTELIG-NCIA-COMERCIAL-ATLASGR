import dns from 'node:dns/promises';
import net from 'node:net';
import { AppError } from '../middlewares/errorHandler.js';

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

/**
 * Valida que `rawUrl` é segura para o servidor buscar (fetch) de verdade: HTTPS, host que não
 * resolve para IP privado/reservado/loopback/link-local. Lança `AppError(..., 400)` caso
 * contrário. Chame isto ANTES de qualquer fetch/axios contra uma URL controlada por
 * usuário/tenant — inclusive antes de cada requisição real, não só uma vez no cadastro (mitigação
 * de DNS rebinding: o host pode responder um IP público na validação e outro IP, privado, no
 * fetch seguinte).
 */
export async function assertSafeExternalUrl(rawUrl: string): Promise<void> {
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
    return;
  }

  // Resolve todos os endereços do host e valida cada um (mitigação parcial de DNS rebinding —
  // não há pinning de IP na conexão real feita pelo fetch subsequente).
  const records = await dns.lookup(hostname, { all: true }).catch(() => []);
  if (records.length === 0) {
    throw new AppError('Não foi possível resolver o host informado.', 400);
  }
  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new AppError('Endereço não permitido (resolve para IP privado/reservado).', 400);
    }
  }
}
