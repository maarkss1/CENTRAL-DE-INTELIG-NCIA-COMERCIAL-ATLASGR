import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { CompanyUseCases } from '../../src/features/companies/application/CompanyUseCases';
import { PrismaCompanyRepository } from '../../src/features/companies/infra/PrismaCompanyRepository';
import { CompanyFactory } from '../helpers/factories';

const companyUseCases = new CompanyUseCases(new PrismaCompanyRepository());

describe('CompanyUseCases Integration', () => {
  beforeEach(async () => {
    await prisma.company.deleteMany();
  });

  describe('create', () => {
    it('should create a new company successfully', async () => {
      const data = CompanyFactory.build({ organizationId: 'test-org-id' });
      delete (data as any).id;
      const result = await companyUseCases.createCompany('test-org-id', data as never);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.legalName).toBe(data.legalName);
    });

    it('should fail with invalid data', async () => {
      const data = { legalName: '' };
      await expect(companyUseCases.createCompany('test-org-id', data as never)).rejects.toThrow();
    });
  });

  describe('findAll', () => {
    it('should return all companies', async () => {
      const c1 = CompanyFactory.build({ legalName: 'Alpha Corp', organizationId: 'test-org-id' });
      const c2 = CompanyFactory.build({ legalName: 'Beta Inc', organizationId: 'test-org-id' });
      delete (c1 as any).id;
      delete (c2 as any).id;

      await prisma.company.create({ data: { ...c1, tags: undefined } as any });
      await prisma.company.create({ data: { ...c2, tags: undefined } as any });

      const companies = await companyUseCases.findCompanies('test-org-id');
      expect(companies.data.length).toBeGreaterThanOrEqual(2);
    });
  });
});
