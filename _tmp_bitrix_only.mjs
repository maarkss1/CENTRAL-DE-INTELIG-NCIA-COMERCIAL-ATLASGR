const BASE = 'https://prospector-atlas-rqwq.onrender.com';
const EMAIL = 'marcelo.nascimento@atlasgr.com.br';
const PASSWORD = 'oti8jYNqbSWd0B82n2EfF0JU';
const BITRIX_WEBHOOK = 'https://atlasgr.bitrix24.com.br/rest/450/gr94fas79p1nizci/';

const TOP5 = [
  { id: 'cmtirmjjc0004t0vsewtbsq9d', name: 'COPETRANS' },
  { id: 'cmtirmvui0008t0vshujbb04b', name: 'CUPELLO' },
  { id: 'cmtirn1rc000at0vscib4iw8b', name: 'DALCOQUIO' },
  { id: 'cmtirwom80002scvs99f0234s', name: 'JH_TRANSP' },
  { id: 'cmtirp93s000yt0vs3i4d9w1n', name: 'HAMMES' },
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
    cookieJar = setCookie
      .split(/,(?=[^;]+?=)/)
      .map((c) => c.split(';')[0])
      .join('; ');
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    // sem corpo JSON
  }
  return { status: res.status, ok: res.ok, body };
}

async function main() {
  const login = await req('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!login.ok) throw new Error(`Login falhou: ${login.status} ${JSON.stringify(login.body)}`);
  console.log('Login OK.');

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  for (const lead of TOP5) {
    const r = await req('/api/leads/export/bitrix24', {
      method: 'POST',
      body: JSON.stringify({ leadId: lead.id }),
    });
    console.log(`Export ${lead.name} (${lead.id}):`, r.status, JSON.stringify(r.body).slice(0, 300));
    await sleep(4000);
  }

  console.log('\n=== FIM ===');
}

main().catch((err) => {
  console.error('Falha:', err);
  process.exitCode = 1;
});
