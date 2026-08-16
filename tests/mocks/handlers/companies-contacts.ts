import { http, HttpResponse } from 'msw';
import type { PaginatedResponse, Company, Contact } from '@/types';

// tests/unit/features/ui.test.tsx monta <CompanyList/> e <ContactList/> reais (via
// useCompanies/useContacts -> companiesDB.list/contactsDB.list -> api.get). Sem handler aqui, o
// MSW deixa a requisição passar pra rede real (onUnhandledRequest: 'bypass', ver
// tests/mocks/setup.ts) — que nunca responde em CI, e o fetch só rejeita depois do timeout padrão
// de apiFetch (15s, ver src/lib/api.ts). O `unmount()`/`waitFor(() => {})` do teste já roda muito
// antes disso, então esse `finally { setLoading(false) }` do useDatabase.ts dispara bem depois,
// contra um ambiente jsdom de um arquivo de teste seguinte que já foi encerrado — daí o
// "ReferenceError: window is not defined" que derrubava o job de Code Quality mesmo com os 643
// testes passando. Responder na hora resolve a causa raiz (nada mais fica pendente).
const emptyCompanies: PaginatedResponse<Company> = {
    data: [],
    meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
};

const emptyContacts: PaginatedResponse<Contact> = {
    data: [],
    meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
};

export const companiesContactsHandlers = [
    http.get('/api/companies', () => HttpResponse.json({ success: true, data: emptyCompanies.data, meta: emptyCompanies.meta })),
    http.get('/api/contacts', () => HttpResponse.json({ success: true, data: emptyContacts.data, meta: emptyContacts.meta })),
];
