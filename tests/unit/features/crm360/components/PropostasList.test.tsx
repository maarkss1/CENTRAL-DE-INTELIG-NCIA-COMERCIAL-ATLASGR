import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render as rtlRender, screen, waitFor, cleanup } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../../../../mocks/server';

/**
 * PropostasList.tsx não tinha nenhum teste antes desta correção. Cobre o achado real de uma
 * auditoria desta sessão: POST/PUT /api/crm/documents exigem ADMIN/GESTOR/CLOSER/SDR no backend
 * (`writeRoles`, crm360.routes.ts), mas a tela não fazia nenhuma checagem de papel — um
 * VISUALIZADOR via o botão "Novo Documento" normalmente e só recebia um 403 do backend ao tentar
 * usá-lo. Mesmo padrão de teste já usado em Team.test.tsx (mock de useAuth + MSW real).
 *
 * Com a lista vazia (fixture desta suíte), "Novo Documento" aparece em DOIS lugares quando
 * canWrite é true — o botão do cabeçalho e o CTA do EmptyState — então as asserções usam
 * getAllByRole/queryAllByRole (contagem), não getByRole/queryByRole (que exigem exatamente um).
 */

const useAuthMock = vi.fn(() => ({ currentUser: { id: 'u1', role: 'ADMIN' } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => useAuthMock() }));

import { PropostasList } from '@/features/crm360/components/PropostasList';

const DOCUMENTS_URL = '/api/crm/documents';

function mockDocuments(documents: unknown[]) {
  server.use(http.get(DOCUMENTS_URL, () => HttpResponse.json(documents)));
}

beforeEach(() => {
  mockDocuments([]);
  useAuthMock.mockReturnValue({ currentUser: { id: 'u1', role: 'ADMIN' } });
});

afterEach(() => {
  cleanup();
});

describe('PropostasList — RBAC de escrita', () => {
  it('ADMIN vê o(s) botão(ões) "Novo Documento"', async () => {
    rtlRender(<PropostasList />);
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Novo Documento/i }).length).toBeGreaterThan(0),
    );
  });

  it('SDR (nível mínimo de escrita) também vê o botão', async () => {
    useAuthMock.mockReturnValue({ currentUser: { id: 'u2', role: 'SDR' } });
    rtlRender(<PropostasList />);
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Novo Documento/i }).length).toBeGreaterThan(0),
    );
  });

  it('VISUALIZADOR (abaixo do mínimo exigido pelo backend) não vê nenhum botão de criar documento', async () => {
    useAuthMock.mockReturnValue({ currentUser: { id: 'u3', role: 'VISUALIZADOR' } });
    rtlRender(<PropostasList />);
    await waitFor(() =>
      expect(
        screen.getByText('Orçamentos, propostas, faturas e contratos — com versionamento e assinatura eletrônica.'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryAllByRole('button', { name: /Novo Documento/i })).toHaveLength(0);
  });

  it('sem usuário autenticado, também não mostra o botão (fail-closed)', async () => {
    useAuthMock.mockReturnValue({ currentUser: null });
    rtlRender(<PropostasList />);
    await waitFor(() =>
      expect(
        screen.getByText('Orçamentos, propostas, faturas e contratos — com versionamento e assinatura eletrônica.'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryAllByRole('button', { name: /Novo Documento/i })).toHaveLength(0);
  });
});
