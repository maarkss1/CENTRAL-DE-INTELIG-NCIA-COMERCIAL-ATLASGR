from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import sys

class SimpleHubHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

    def do_GET(self):
        self._set_headers(200)
        self.wfile.write(json.dumps({"status": "ok", "service": "Birth Voices Hub"}).encode('utf-8'))

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        try:
            payload = json.loads(post_data.decode('utf-8'))
        except Exception:
            payload = {}

        target_number = payload.get("targetNumber", "+5516993924196")
        context = payload.get("context", {})
        name = context.get("name", "Juliana")
        voice = payload.get("voice", "gessica")

        print("\n" + "=" * 65)
        print(" [BIRTH VOICES HUB] LIGACAO DISPARADA E ACEITA COM SUCESSO!")
        print(f" Agente de Voz: {voice.upper()} (SDR Atlas GR)")
        print(f" Destinatario(a): {name} ({target_number})")
        print(f" Status: QUEUED -> IN_PROGRESS")
        print(f" Callback URL: {payload.get('callbackUrl')}")
        print("=" * 65 + "\n")

        sys.stdout.flush()

        response_body = json.dumps({
            "sessionId": "sess-juliana-qualify-2026",
            "callSid": "CA_JULIANA_VOICE_QUALIFICATION_ATLAS_GR",
            "status": "queued",
            "message": f"Ligacao para {name} ({target_number}) disparada com sucesso pela IA Gessica!"
        }).encode('utf-8')

        self._set_headers(200)
        self.wfile.write(response_body)

def run_server():
    server_address = ('127.0.0.1', 3001)
    httpd = HTTPServer(server_address, SimpleHubHandler)
    print("Birth Voices Hub Mock rodando na porta 3001...")
    sys.stdout.flush()
    httpd.serve_forever()

if __name__ == '__main__':
    run_server()
