import dns from 'node:dns/promises';
import net from 'node:net';
import { AppError } from '../../../shared/middlewares/errorHandler';

// SSRF: usuários autenticados fornecem sua própria URL de webhook do Bitrix24, e o
// servidor faz requisições autenticadas (com PII) para ela. Sem validação, essa URL
// pode apontar para infraestrutura interna (Redis, Postgres, serviços do cluster,
// endpoint de metadados de nuvem). Bloqueamos esquemas não-HTTPS e qualquer host que
// resolva para um endereço privado/reservado/loopback/link-local antes de qualquer fetch.
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

export async function assertSafeWebhookUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError('URL de webhook do Bitrix24 inválida.', 400);
  }

  if (url.protocol !== 'https:') {
    throw new AppError('O webhook do Bitrix24 deve usar HTTPS.', 400);
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new AppError('Endereço de webhook não permitido.', 400);
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new AppError('Endereço de webhook não permitido (IP privado/reservado).', 400);
    }
    return;
  }

  // Resolve todos os endereços do host e valida cada um (mitigação parcial de DNS
  // rebinding — não há pinning de IP na conexão real feita pelo fetch subsequente).
  const records = await dns.lookup(hostname, { all: true }).catch(() => []);
  if (records.length === 0) {
    throw new AppError('Não foi possível resolver o host do webhook do Bitrix24.', 400);
  }
  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new AppError('Endereço de webhook não permitido (resolve para IP privado/reservado).', 400);
    }
  }
}

