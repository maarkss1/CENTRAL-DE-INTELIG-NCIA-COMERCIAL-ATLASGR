import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';

describe('Organization RLS bypass no setup de integração', () => {
  it('bloqueia insert de Organization fora de bypassRls', async () => {
    await expect(
      prisma.organization.create({
        data: { id: 'org-no-bypass', name: 'Org No Bypass' },
      })
    ).rejects.toThrow(/row-level security policy/i);
  });

  it('permite insert de Organization quando bypassRls=true no RequestContext', async () => {
    await requestContext.run({ bypassRls: true }, async () => {
      await prisma.organization.deleteMany({ where: { id: 'org-with-bypass' } });
      await prisma.organization.create({
        data: { id: 'org-with-bypass', name: 'Org With Bypass' },
      });
    });

    await requestContext.run({ bypassRls: true }, async () => {
      await prisma.organization.deleteMany({ where: { id: 'org-with-bypass' } });
    });
  });
});
