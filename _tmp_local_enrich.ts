import 'dotenv/config';
import { prisma } from './src/lib/prisma.js';
import { requestContext } from './src/lib/async-context.js';
import { enrichCompany } from './src/features/prospecting/services/enrichment.service.js';

const ORG_ID = '6143fbf1-4b0d-41e0-bae1-ab39614d1f12';

const LEAD_IDS = [
  'cmtip4ukf0003n8vs821xpk2n','cmtip4z290005n8vsysp11tmw','cmtip525a0007n8vsl70h0v3z','cmtip59jn0009n8vs0uea49ui',
  'cmtip5igp000bn8vsid31ttyf','cmtip5rq1000dn8vs9t5j5cy4','cmtip5zz2000fn8vsjpot5m9d','cmtip67nk000hn8vs4mvc7ioc',
  'cmtip6gdq000jn8vs8wyimxzd','cmtip6p0o000ln8vsp0c3hpdx','cmtip6xxe000nn8vsawjk6nth','cmtip774c000pn8vsyui9xbzb',
  'cmtip7bu5000rn8vsboynw4d4','cmtip7g3c000tn8vsbfva8ra0','cmtirm3fd0000t0vscs9r91t3','cmtirmbvt0002t0vssayadltc',
  'cmtirmjjc0004t0vsewtbsq9d','cmtirmq5o0006t0vs6h9id4lq','cmtirmvui0008t0vshujbb04b','cmtirn1rc000at0vscib4iw8b',
  'cmtirn8dm000ct0vs4vkn6kno','cmtirng9g000et0vs9f79we9v','cmtirnlrm000gt0vs7dm9xu8z','cmtirnrgw000it0vshe3yqkzq',
  'cmtirnxou000kt0vsit1ygxc4','cmtiro52v000mt0vsw14p44qm','cmtirob3m000ot0vstq2cn6z2','cmtiroh71000qt0vsremiq3ua',
  'cmtironhw000st0vs3qivaugj','cmtirougl000ut0vs8b2l42xy','cmtirp239000wt0vsgu06h3hk','cmtirp93s000yt0vs3i4d9w1n',
  'cmtirpewk0010t0vsxsp6u3bt','cmtirpl920012t0vsvjnhwecz','cmtirwib10000scvsu7nedoig','cmtirwom80002scvs99f0234s',
  'cmtirwvuw0004scvswytx8qk4','cmtirx2is0006scvs3xttcee9','cmtirx9gv0008scvsf39ua4w4','cmtirxfdb000ascvs65vd8sbu',
  'cmtirxlch000cscvsnmyew2h6','cmtirxruu000escvspk1s506k','cmtirxxu5000gscvs01i8eic5','cmtiry438000iscvskgbsikni',
  'cmtiryam5000kscvs15bi40jw','cmtiryhvo000mscvs5qxv7oib','cmtiryo8p000oscvsycz2dfma','cmtiryujd000qscvs1wzzckzj',
  'cmtirz0jd000sscvsf3v00le2','cmtirz7bz000uscvsl4cf7d4z',
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  await requestContext.run({ tenantId: ORG_ID, bypassRls: true }, async () => {
    const leads = await prisma.lead.findMany({
      where: { id: { in: LEAD_IDS } },
      select: { id: true, companyId: true, company: { select: { tradeName: true } } },
    });
    console.log(`${leads.length}/${LEAD_IDS.length} leads encontrados.`);

    const results: Array<{ leadId: string; companyId: string; tradeName: string; ok: boolean; googleRating?: number | null }> = [];

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      if (!lead.companyId) continue;
      try {
        const result = await enrichCompany(ORG_ID, lead.companyId, {});
        const rating = (result as { company?: { googleRating?: number | null } })?.company?.googleRating ?? null;
        results.push({ leadId: lead.id, companyId: lead.companyId, tradeName: lead.company?.tradeName ?? '', ok: true, googleRating: rating });
        console.log(`  [${i + 1}/${leads.length}] ${lead.company?.tradeName} -> OK (rating=${rating ?? 'n/a'})`);
      } catch (err) {
        results.push({ leadId: lead.id, companyId: lead.companyId, tradeName: lead.company?.tradeName ?? '', ok: false });
        console.log(`  [${i + 1}/${leads.length}] ${lead.company?.tradeName} -> ERRO: ${err}`);
      }
      await sleep(800); // respiro entre chamadas — não martelar Google Places/GDELT nem o pool do Supabase
    }

    const succeeded = results.filter((r) => r.ok);
    console.log(`\nSucesso: ${succeeded.length}/${leads.length}`);

    const top5 = succeeded
      .slice()
      .sort((a, b) => (b.googleRating ?? 0) - (a.googleRating ?? 0))
      .slice(0, 5);

    console.log('\n=== TOP 5 (para exportar ao Bitrix) ===');
    for (const r of top5) {
      console.log(`${r.leadId}\t${r.tradeName}\trating=${r.googleRating ?? 'n/a'}`);
    }
  });
}

main()
  .catch((err) => {
    console.error('Falha geral:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
