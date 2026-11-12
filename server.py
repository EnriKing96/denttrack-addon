#!/usr/bin/env python3
"""
DentTrack - Server di Sincronizzazione per Raspberry Pi e PC
Include Web Server e API di sincronizzazione per multi-dispositivo (smartphone, tablet, PC).
Zero dipendenze: richiede solo Python 3 standard.
"""

import os
import sys
import json
import socket
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Percorso di salvataggio: se siamo dentro Home Assistant (/config o /data), salva in modo persistente
if os.path.exists("/config"):
    DATA_FILE = "/config/denttrack_data.json"
elif os.path.exists("/data"):
    DATA_FILE = "/data/denttrack_data.json"
else:
    DATA_FILE = os.path.join(BASE_DIR, "denttrack_data.json")

def get_local_ip():
    """Trova l'indirizzo IP locale sulla rete Wi-Fi / Ethernet"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Non invia traffico reale, serve solo per determinare l'interfaccia attiva
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

class DentTrackHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        # Permetti chiamate cross-origin e disabilita cache aggressiva per le API
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        # Endpoint API per ottenere i dati centralizzati
        clean_path = self.path.split('?')[0].rstrip('/')
        if clean_path.endswith('/api/data'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()

            if os.path.exists(DATA_FILE):
                try:
                    with open(DATA_FILE, 'r', encoding='utf-8') as f:
                        data = f.read()
                    self.wfile.write(data.encode('utf-8'))
                except Exception as e:
                    err_msg = json.dumps({"error": str(e)})
                    self.wfile.write(err_msg.encode('utf-8'))
            else:
                # Nessun dato ancora presente sul server
                self.wfile.write(b'{}')
            return

        # Fallback predefinito: servi file statici
        super().do_GET()

    def do_POST(self):
        # Endpoint API per salvare i dati centralizzati da qualsiasi dispositivo
        clean_path = self.path.split('?')[0].rstrip('/')
        if clean_path.endswith('/api/data'):
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_body = self.rfile.read(content_length).decode('utf-8')
                
                # Validazione JSON
                parsed_json = json.loads(post_body)
                
                # Salvataggio atomico sicuro con file temporaneo
                temp_file = DATA_FILE + ".tmp"
                with open(temp_file, 'w', encoding='utf-8') as f:
                    json.dump(parsed_json, f, ensure_ascii=False, indent=2)
                
                if os.path.exists(DATA_FILE):
                    os.replace(temp_file, DATA_FILE)
                else:
                    os.rename(temp_file, DATA_FILE)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                response = json.dumps({
                    "success": True, 
                    "message": "Dati salvati e sincronizzati sul Raspberry!",
                    "shiftsCount": len(parsed_json.get("shifts", [])),
                    "clinicsCount": len(parsed_json.get("clinics", []))
                })
                self.wfile.write(response.encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                err_response = json.dumps({"success": False, "error": str(e)})
                self.wfile.write(err_response.encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

def run_server():
    local_ip = get_local_ip()

    server_address = ('', PORT)
    httpd = HTTPServer(server_address, DentTrackHandler)

    print("=" * 64)
    print("       DENTTRACK - SERVER DI SINCRONIZZAZIONE RASPBERRY PI      ")
    print("              Marchino software  |  Giulia buon lavoro!        ")
    print("=" * 64)
    print(f" [PC / Raspberry Locale]   http://localhost:{PORT}/")
    print(f" [SMARTPHONE / Wi-Fi]      http://{local_ip}:{PORT}/")
    print("=" * 64)
    print(f" File archivio centralizzato: {DATA_FILE}")
    print(" Tutti i dispositivi (PC e Telefono) si sincronizzano su questo file!")
    print("=" * 64)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nArresto del server DentTrack...")
        httpd.server_close()
        sys.exit(0)

if __name__ == '__main__':
    run_server()
