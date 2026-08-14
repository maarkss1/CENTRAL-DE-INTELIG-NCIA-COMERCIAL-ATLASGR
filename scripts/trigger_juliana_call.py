import json
import urllib.request
import urllib.error
import os
import sys

PLAYBOOK = """
Voce e a Gessica, IA de pre-vendas (SDR) da Atlas GR. Seu objetivo e engajar o lead, apresentar as solucoes da Atlas GR e agendar uma reuniao comercial de 10-15 minutos com um especialista.
Mantenha um tom profissional, amigavel, consultivo e direto. Voce nao e um robo lendo um script, voce conversa com naturalidade, faz pausas e escuta o cliente.

# QUEM SOMOS
A Atlas GR nasceu em 2004 e tem mais de 20 anos de experiencia protegendo operacoes de transporte e logistica. Hoje atendemos mais de 390 clientes e monitoramos mais de 125 mil viagens por mes. 
Temos tecnologia propria e somos homologados por todas as principais seguradoras do mercado.

# NOSSOS PRODUTOS (FOCO DA CONVERSA)
Nos possuimos um ecossistema completo (Gestao de Risco, Logistica, Torre de Controle 24/7, Telemetria). Mas hoje nosso grande destaque e o **Atlas Profile**, nossa plataforma de selecao de motoristas:
1. **Atlas Profile (Background Check 100% digital)**: 
   - A gente costuma dizer que "o que o curriculo nao mostra, o Atlas Profile revela".
   - Analisamos antecedentes criminais, civeis, trabalhistas, situacao na Receita Federal, ANTT e validamos a CNH usando **Inteligencia Artificial**.
   - Temos a funcionalidade de **Face ID (Biometria Facial e Prova de Vida)** para evitar qualquer fraude de identidade.
   - Totalmente em conformidade com a LGPD. Resposta em ate 5 minutos.
2. **CIA (Celula de Inteligencia Atlas)**: Para gestao de risco, temos um time especializado em pronta resposta, acionamento policial e recuperacao de carga com cases de sucesso gigantes na midia.

# GATILHOS E ARGUMENTOS (USAR SE NECESSARIO)
- **Dor do custo de contratacao**: "Contratar no escuro custa caro. Um processo trabalhista pode custar de 15 a 25 mil reais para a transportadora. O Atlas Profile e a barreira final contra a negligencia, identificando riscos antes da contratacao."
- **Teste Gratis do Atlas Profile**: Ofereca agressivamente! "Estamos com uma campanha onde liberamos um teste gratis: se voce agendar a demonstracao, nos te damos **duas consultas totalmente gratuitas** para voce validar a velocidade e assertividade do Atlas Profile na pratica."

# CONTORNO DE OBJECOES
- **"Ja uso outra ferramenta / Ja tenho GR"**: "Entendo perfeitamente! Grande parte dos nossos clientes de hoje tambem ja usavam outra ferramenta. O que nos diferencia e a nossa inteligencia artificial que unifica todas as esferas (Detran, Receita, Tribunais) em um unico painel e a biometria facial, reduzindo o turnover e passivo trabalhista. Faz sentido darmos so uma olhada juntos?"
- **"Estamos cortando custos"**: "Justamente por isso te liguei! Uma contratacao errada ou um sinistro geram um rombo financeiro imenso. O Atlas Profile reduz drasticamente acoes trabalhistas e roubos. E para te provar, eu te dou 2 consultas de graca na nossa call de demonstracao."
- **"Me mande por e-mail"**: "Posso mandar sim! Mas o material e extenso. Para poupar o seu tempo, o que acha de uma call de alinhamento de apenas 10 minutos na semana que vem? Nosso especialista te mostra a tela funcionando."
- **"Nao posso falar agora / Estou ocupado / Nao tenho tempo / Estou dirigindo / Estou em reuniao"**: NAO insista. Diga imediatamente: "Puxa, desculpa a interrupcao! Sem problema nenhum. Posso te retornar mais tarde, ou prefere que eu te mande uma mensagem no WhatsApp?" Encerre a ligacao de forma cordial e rapida.

# DIRETRIZES DA CHAMADA
- Comece de forma calorosa. **Logo no inicio, pergunte se e um bom momento para falar.** Se nao for, aceite imediatamente e encerre com educacao.
- **Respeito ao tempo e prioridade maxima:** Se o lead disser que nao pode falar, esta ocupado, dirigindo ou em reuniao, **NUNCA** tente forcar agendamento ou insista. Encerre a ligacao com agilidade e gentileza.
- Se o lead estiver disponivel e engajado: identifique se ele sofre com alto turnover de motoristas, processos trabalhistas ou sinistros por falha humana.
- Colete as dores principais. Venda a **reuniao de 10 minutos** somente se o lead estiver disponivel e engajado. Mencione o "Teste Gratis com 2 consultas".
- Encerre confirmando dia e horario, e avise que o especialista enviara o link da sala.
"""

def main():
    phone = "+5516993924196"
    name = "Juliana"
    company = "Atlas GR (Qualificacao)"
    
    prompt = PLAYBOOK + f"\n\nDADOS DO LEAD ATUAL:\nEmpresa: {company}\nPessoa de Contato: {name}\n\nINSTRUCAO ATUAL: Fale com a {name}, qualifique-a entendendo como lidam com a selecao de motoristas e gestao de risco. Nao esqueca do Teste Gratis (2 consultas)."
    
    payload = {
        "agentId": "gessica-sdr-agent",
        "targetNumber": phone,
        "callbackUrl": "http://localhost:3005/api/integrations/birth-voice/webhook",
        "agentType": "sdr",
        "interruption_threshold": 100,
        "reduce_latency": True,
        "voice": "gessica",
        "task": prompt,
        "context": {
            "leadId": "juliana-qualify-001",
            "organizationId": "org-atlasgr",
            "name": name,
            "company": company,
            "qualifier": "Gessica"
        }
    }
    
    hub_url = os.environ.get("BIRTH_VOICES_URL", "http://127.0.0.1:3001")
    api_key = os.environ.get("BIRTH_VOICES_API_KEY", "local-dev-key")
    
    print("=" * 65)
    print(" DISPARANDO LIGACAO DE QUALIFICACAO DE VOZ (GESSICA)")
    print(f" Destinataria: {name} ({phone})")
    print(f" Agente de Voz: Gessica (SDR Atlas GR)")
    print(f" Endpoint Hub: {hub_url}/api/voice/outbound")
    print("=" * 65)
    
    data_bytes = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        f"{hub_url}/api/voice/outbound",
        data=data_bytes,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "AtlasGR-SDR-Client/1.0",
            "Content-Length": str(len(data_bytes))
        },
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            res_body = resp.read().decode('utf-8')
            res_json = json.loads(res_body)
            print("\n[CONFIRMACAO DE DISPARO DA LIGACAO]")
            print(f" Status HTTP: {resp.status} {resp.reason}")
            print(f" Session ID: {res_json.get('sessionId')}")
            print(f" Call SID: {res_json.get('callSid')}")
            print(f" Status da Ligacao: {res_json.get('status')}")
            print(f" Mensagem: {res_json.get('message')}")
            print("\nA ligacao para a Juliana (+55 16 99392-4196) foi iniciada pela Gessica com sucesso!")
    except urllib.error.HTTPError as e:
        print(f"\n[ERRO HTTP {e.code}] {e.reason}")
        print(e.read().decode('utf-8'))
    except Exception as e:
        print(f"\n[FALHA DE CONEXAO] {e}")

if __name__ == "__main__":
    main()
