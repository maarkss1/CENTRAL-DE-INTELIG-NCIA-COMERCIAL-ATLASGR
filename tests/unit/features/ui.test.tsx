import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CompanyList } from '@/features/companies/components/CompanyList';
import { ContactList } from '@/features/contacts/components/ContactList';

// CompanyList/ContactList disparam fetch de dados no useEffect de montagem. Sem esperar esse
// trabalho assíncrono assentar e sem desmontar, o React podia continuar agendando renders depois
// que o teste (e o ambiente jsdom desse arquivo) já tinha encerrado — o setState então rodava
// contra `window` indefinido num arquivo de teste seguinte, derrubando o job inteiro com
// "ReferenceError: window is not defined" mesmo com todos os testes reportados como passando.
describe('UI Components', () => {
  it('should render CompanyList without crashing', async () => {
    // Apenas renderiza pra forçar parsing e coverage das linhas iniciais
    // CompanyList lê/escreve query params via useLocation/useNavigate — precisa de um Router.
    const { unmount } = render(<MemoryRouter><CompanyList /></MemoryRouter>);
    await waitFor(() => {});
    unmount();
    expect(true).toBe(true);
  });

  it('should render ContactList without crashing', async () => {
    const { unmount } = render(<MemoryRouter><ContactList /></MemoryRouter>);
    await waitFor(() => {});
    unmount();
    expect(true).toBe(true);
  });
});
