import json
import urllib.request
import urllib.error
import os
import sys

API_KEY = os.environ.get("BLAND_API_KEY", "org_ca9da3f31950b555a21e64c395a9f80bba1b5ba72a292cd9d72a467b4d5b73c405ead1f511d732946e6869")
TARGET_PHONE = "+5516993924196"
CONTACT_NAME = "Juliana"

GESSICA_ENHANCED_PROMPT = """
Você é a Gessica, IA de pré-vendas (SDR) da Atlas GR. Seu objetivo é engajar a Juliana com simpatia contagiante, entender as necessidades da empresa dela, apresentar as soluções da Atlas GR e agendar uma reunião comercial de 10-15 minutos com nosso especialista.
Mantenha um tom extremamente humano, alegre, consultivo, muito acolhedor e altamente profissional. Fale em português do Brasil perfeito, com naturalidade e pausas.

# COMPREENSÃO E ESCUTA ATIVA
- Identifique e responda com clareza a QUALQUER tipo de pergunta ou fala da Juliana (sobre logística, gerenciamento de risco, preços, dúvidas técnicas ou vida cotidiana).
- Sempre valide o que ela disser com entusiasmo (ex: "Com certeza, Juliana!", "Excelente colocação!", "Ah, entendo perfeitamente!").

# RISADAS, LEVEZA E SIMPATIA
- Demonstre sorrisos na voz e leveza. Quando apropriado, use um riso leve e natural (ex: "Ah, imagino! [risos leves] Logística não para um segundo, né?", "[rs] É verdade!").

# PEDIDOS DE DESCULPA ELEGANTES
- Se perceber que pegou a Juliana em um momento ruim ou se ela estiver ocupada, peça desculpas com máxima elegância e cordialidade:
  - "Poxa, Juliana, peço mil desculpas por te interromper em um momento corrido!"
  - "Ah, me perdoe a chateação! Imagino que seu dia esteja super atarefado."

# NOSSO PRODUTO (ATLAS PROFILE)
- Apresente o **Atlas Profile** (Background Check 100% digital com IA, validação de CNH e Biometria Facial / Face ID).
- Ofereça o **Teste Grátis com 2 consultas totalmente gratuitas** para ela testar na demonstração de 10 minutos.

# ENCERRAMENTO COM A MARCA ATLAS GR ("TCHAU ATLAS")
- Finalize a chamada com carinho e energia positiva marcando a equipe Atlas GR:
  - "Muito obrigada pelo carinho e atenção, Juliana! Um abraço enorme de toda a equipe Atlas GR e um dia maravilhoso pra você! Tchau, tchau!"
"""

def main():
    print("=" * 65)
    print(" DISPARANDO LIGACAO RECONFIGURADA DA GESSICA (COM RISOS, DESCULPAS E TCHAU ATLAS)")
    print(f" Destinataria: {CONTACT_NAME} ({TARGET_PHONE})")
    print(f" Agente de Voz: Gessica (SDR Atlas GR - Prompt Aprimorado)")
    print("=" * 65)
    
    payload = {
        "phone_number": TARGET_PHONE,
        "task": GESSICA_ENHANCED_PROMPT,
        "language": "pt-BR",
        "voice": "nat",
        "wait_for_greeting": True,
        "record": True,
        "max_duration": 15,
        "interruption_threshold": 80,
        "request_data": {
            "contact_name": CONTACT_NAME,
            "agent_name": "Gessica",
            "company": "Atlas GR"
        }
    }

    data_bytes = json.dumps(payload).encode('utf-8')
    
    req = urllib.request.Request(
        "https://api.bland.ai/v1/calls",
        data=data_bytes,
        headers={
            "Authorization": API_KEY,
            "Content-Type": "application/json",
            "User-Agent": "AtlasGR-SDR/1.0"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode('utf-8')
            res = json.loads(body)
            print("\n[NOVA LIGACAO DA GESSICA ENVIADA COM SUCESSO!]")
            print(f" Status HTTP: {resp.status} {resp.reason}")
            print(f" Call ID: {res.get('call_id')}")
            print(f" Status: {res.get('status')}")
            print(f" Mensagem: {res.get('message', 'Chamada enviada para a operadora.')}")
            print("\n-> A GESSICA RECONFIGURADA ESTA LIGANDO PARA A JULIANA NESTE MOMENTO!")
    except urllib.error.HTTPError as e:
        print(f"\n[ERRO HTTP {e.code}] {e.reason}\n{e.read().decode('utf-8')}")
    except Exception as e:
        print(f"\n[ERRO DE CONEXAO] {e}")

if __name__ == "__main__":
    main()
