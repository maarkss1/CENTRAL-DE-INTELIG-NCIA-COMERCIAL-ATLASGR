const BASE = 'https://prospector-atlas-rqwq.onrender.com';
const EMAIL = 'marcelo.nascimento@atlasgr.com.br';
const PASSWORD = 'oti8jYNqbSWd0B82n2EfF0JU';
const BITRIX_WEBHOOK = 'https://atlasgr.bitrix24.com.br/rest/450/gr94fas79p1nizci/';

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

let cookieJar = '';

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE,
      ...(cookieJar ? { Cookie: cookieJar } : {}),
      ...(options.headers || {}),
    },
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    // Concatena todos os cookies recebidos (better-auth costuma mandar mais de um Set-Cookie).
    cookieJar = setCookie
      .split(/,(?=[^;]+?=)/)
      .map((c) => c.split(';')[0])
      .join('; ');
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    // resposta sem corpo JSON
  }
  return { status: res.status, ok: res.ok, body };
}

async function login() {
  const r = await req('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`Login falhou: ${r.status} ${JSON.stringify(r.body)}`);
  console.log('Login OK como', EMAIL);
}

async function connectBitrix() {
  const r = await req('/api/bitrix/connect', {
    method: 'POST',
    body: JSON.stringify({ webhookUrl: BITRIX_WEBHOOK, label: 'AtlasGR' }),
  });
  console.log('Conectar Bitrix:', r.status, JSON.stringify(r.body).slice(0, 300));
  return r;
}

async function enrichLead(id) {
  const r = await req(`/api/leads/${id}/enrich`, { method: 'POST', body: '{}' });
  return r;
}

async function exportToBitrix(leadId) {
  const r = await req('/api/leads/export/bitrix24', {
    method: 'POST',
    body: JSON.stringify({ leadId }),
  });
  return r;
}

async function main() {
  await login();
  await connectBitrix();

  console.log(`Enriquecendo ${LEAD_IDS.length} leads...`);
  const enrichResults = [];
  for (let i = 0; i < LEAD_IDS.length; i++) {
    const id = LEAD_IDS[i];
    try {
      const r = await enrichLead(id);
      enrichResults.push({ id, status: r.status, data: r.body?.data });
      console.log(`  [${i + 1}/${LEAD_IDS.length}] ${id} -> ${r.status}`);
    } catch (err) {
      enrichResults.push({ id, status: 'error', error: String(err) });
      console.log(`  [${i + 1}/${LEAD_IDS.length}] ${id} -> ERRO ${err}`);
    }
  }

  const succeeded = enrichResults.filter((r) => r.status === 200);
  console.log(`\nEnriquecidos com sucesso: ${succeeded.length}/${LEAD_IDS.length}`);

  // Escolhe os 5 melhores: prioriza os que têm googleRating mais alto (dado real coletado agora).
  const ranked = succeeded
    .map((r) => ({ id: r.id, rating: r.data?.company?.googleRating ?? r.data?.googleRating ?? 0 }))
    .sort((a, b) => b.rating - a.rating);
  const top5 = ranked.slice(0, 5).map((r) => r.id);
  console.log('\nTop 5 escolhidos para Bitrix:', top5);

  console.log('\nExportando 5 para o Bitrix24...');
  for (const id of top5) {
    const r = await exportToBitrix(id);
    console.log(`  ${id} -> ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  }

  console.log('\n=== FIM ===');
}

main().catch((err) => {
  console.error('Falha geral:', err);
  process.exitCode = 1;
});
