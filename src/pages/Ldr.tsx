import { Navigate } from 'react-router-dom';

/**
 * Compatibilidade para favoritos antigos após a retirada de Market Intelligence do produto.
 * A Prospecção é o destino funcional que permanece ativo para captação e enriquecimento.
 */
export function Ldr() {
  return <Navigate to="/app/prospect" replace />;
}
