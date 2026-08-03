import { apiClientHandlers } from './api-client';
import { analyticsHandlers } from './analytics';
import { calendarHandlers } from './calendar';
import { notificationsHandlers } from './notifications';
import { knowledgeHandlers } from './knowledge';
import { automationsHandlers } from './automations';
import { nominatimHandlers } from './nominatim';

/** Handlers MSW padrão, registrados no server global (ver `tests/mocks/server.ts`). */
export const handlers = [
    ...apiClientHandlers,
    ...analyticsHandlers,
    ...calendarHandlers,
    ...notificationsHandlers,
    ...knowledgeHandlers,
    ...automationsHandlers,
    ...nominatimHandlers,
];
