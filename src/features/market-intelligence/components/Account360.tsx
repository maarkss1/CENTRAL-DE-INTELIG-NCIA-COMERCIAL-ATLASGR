import { Navigate } from 'react-router-dom';

/** Compatibilidade para deep links antigos do Account 360 removido. */
export function Account360() {
  return <Navigate to="/app/companies" replace />;
}
