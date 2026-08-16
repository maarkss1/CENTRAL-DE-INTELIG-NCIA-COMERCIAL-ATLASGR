import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CompanyList } from '@/features/companies/components/CompanyList';
import { ContactList } from '@/features/contacts/components/ContactList';

// CompanyList/ContactList disparam fetch de dados no useEffect de montagem. O `waitFor(() => {})`
// antigo só esperava um tick e desmontava — mas sem handler MSW para /api/companies e
// /api/contacts (ver tests/mocks/handlers/companies-contacts.ts, adicionado por este fix), a
// requisição passava pra rede real (onUnhandledRequest: 'bypass') e só rejeitava depois do
// timeout padrão de apiFetch (15s, ver src/lib/api.ts) — bem depois do unmount e do fim deste
// arquivo de teste. O `finally { setLoading(false) }` de useDatabase.ts disparava então contra o
// ambiente jsdom de um arquivo de teste JÁ ENCERRADO, derrubando o job inteiro com
// "ReferenceError: window is not defined" mesmo com todos os testes reportados como passando.
// Agora que os handlers respondem na hora, esperamos o spinner de loading desaparecer (indicando
// que o fetch já assentou) antes de desmontar, então não sobra nenhuma promise pendente.
describe('UI Components', () => {
  it('should render CompanyList without crashing', async () => {
    // Apenas renderiza pra forçar parsing e coverage das linhas iniciais
    // CompanyList lê/escreve query params via useLocation/useNavigate — precisa de um Router.
    const { unmount } = render(<MemoryRouter><CompanyList /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.queryByText(/Carregando carteira de empresas/i)).toBeNull();
    });
    unmount();
    expect(true).toBe(true);
  });

  it('should render ContactList without crashing', async () => {
    const { unmount } = render(<MemoryRouter><ContactList /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.queryByText(/Carregando/i)).toBeNull();
    });
    unmount();
    expect(true).toBe(true);
  });
});
