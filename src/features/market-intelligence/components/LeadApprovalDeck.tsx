import { Navigate } from 'react-router-dom';

/** Compatibilidade para deep links antigos do deck removido. */
export function LeadApprovalDeck() {
  return <Navigate to="/app/prospect" replace />;
}
