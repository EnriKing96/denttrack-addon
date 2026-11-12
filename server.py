#!/usr/bin/env python3
"""
DentTrack - Server di Sincronizzazione per Raspberry Pi e PC
Include Web Server e API di sincronizzazione per multi-dispositivo (smartphone, tablet, PC).
Zero dipendenze: richiede solo Python 3 standard.
"""
#!/usr/bin/env python3
"""
DentTrack - Server di sincronizzazione multi-dispositivo.
Compatibile con Home Assistant OS.
Utilizza esclusivamente librerie Python standard.
"""

import os
import json
import socket
import threading

from http.server import (
    ThreadingHTTPServer,
    SimpleHTTPRequestHandler
)

# ==========================================================
# CONFIGURAZIONE
# ==========================================================

PORT = 8080

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

if os.path.isdir("/config"):
    DATA_FILE = "/config/denttrack_data.json"
elif os.path.isdir("/data"):
    DATA_FILE = "/data/denttrack_data.json"
else:
    DATA_FILE = os.path.join(BASE_DIR, "denttrack_data.json")

MAX_BODY_BYTES = 10 * 1024 * 1024

DATA_LOCK = threading.RLock()


# ==========================================================
# RETE
# ==========================================================

def get_local_ip():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    try:
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        sock.close()

    return ip


# ==========================================================
# ARCHIVIO E REVISIONI
# ==========================================================

def _read_store():
    """
    Legge l'archivio.
    Supporta anche il vecchio formato DentTrack 1.0.6.
    """

    if not os.path.exists(DATA_FILE):
        return 0, {}

    with open(DATA_FILE, "r", encoding="utf-8") as file:
        stored = json.load(file)

    if not isinstance(stored, dict):
        raise ValueError("Archivio DentTrack non valido")

    # Nuovo formato con revisioni
    if isinstance(stored.get("data"), dict):
        revision = stored.get("_syncRevision", 0)

        if not isinstance(revision, int) or revision < 0:
            revision = 0

        return revision, stored["data"]

    # Vecchio formato: archivio JSON diretto
    legacy_data = dict(stored)
    legacy_data.pop("_syncRevision", None)

    return 0, legacy_data


def _write_store(revision, data):
    """
    Salvataggio atomico: evita archivi parziali
    in caso di interruzione durante la scrittura.
    """

    directory = os.path.dirname(DATA_FILE)

    if directory:
        os.makedirs(directory, exist_ok=True)

    temp_file = DATA_FILE + ".tmp"

    store = {
        "_syncRevision": revision,
        "data": data
    }

    try:
        with open(temp_file, "w", encoding="utf-8") as file:
            json.dump(
                store,
                file,
                ensure_ascii=False,
                indent=2
            )
            file.flush()
            os.fsync(file.fileno())

        os.replace(temp_file, DATA_FILE)

    finally:
        if os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except OSError:
                pass


# ==========================================================
# GESTORE HTTP
# ==========================================================

class DentTrackHandler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(
            *args,
            directory=BASE_DIR,
            **kwargs
        )

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS"
        )
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type"
        )
        self.send_header(
            "Cache-Control",
            "no-store, no-cache, must-revalidate"
        )

        super().end_headers()

    def _send_json(self, status, payload):
        body = json.dumps(
            payload,
            ensure_ascii=False
        ).encode("utf-8")

        self.send_response(status)

        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8"
        )

        self.send_header(
            "Content-Length",
            str(len(body))
        )

        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    # ------------------------------------------------------
    # GET
    # ------------------------------------------------------

    def do_GET(self):

        clean_path = self.path.split("?", 1)[0].rstrip("/")

        if clean_path.endswith("/api/data"):

            try:
                with DATA_LOCK:
                    revision, data = _read_store()

                response = dict(data)
                response["_syncRevision"] = revision

                self._send_json(200, response)

            except Exception as exc:
                self._send_json(
                    500,
                    {
                        "success": False,
                        "error": str(exc)
                    }
                )

            return

        super().do_GET()

    # ------------------------------------------------------
    # POST
    # ------------------------------------------------------

    def do_POST(self):

        clean_path = self.path.split("?", 1)[0].rstrip("/")

        if not clean_path.endswith("/api/data"):

            self._send_json(
                404,
                {
                    "success": False,
                    "error": "Endpoint non trovato"
                }
            )

            return

        try:

            content_length = int(
                self.headers.get("Content-Length", "0")
            )

            if content_length <= 0 or content_length > MAX_BODY_BYTES:

                self._send_json(
                    413,
                    {
                        "success": False,
                        "error": "Dimensione richiesta non valida"
                    }
                )

                return

            raw_body = self.rfile.read(
                content_length
            ).decode("utf-8")

            payload = json.loads(raw_body)

            if not isinstance(payload, dict):

                self._send_json(
                    400,
                    {
                        "success": False,
                        "error": "Il contenuto deve essere un oggetto JSON"
                    }
                )

                return

            base_revision = payload.get("baseRevision")

            if (
                not isinstance(base_revision, int)
                or isinstance(base_revision, bool)
                or base_revision < 0
            ):

                self._send_json(
                    428,
                    {
                        "success": False,
                        "error": (
                            "Revisione mancante. "
                            "Aggiorna DentTrack su tutti i dispositivi."
                        )
                    }
                )

                return

            data = payload.get("data")

            if not isinstance(data, dict):

                self._send_json(
                    400,
                    {
                        "success": False,
                        "error": "Campo data mancante o non valido"
                    }
                )

                return

            if (
                not isinstance(data.get("clinics", []), list)
                or not isinstance(data.get("shifts", []), list)
            ):

                self._send_json(
                    400,
                    {
                        "success": False,
                        "error": "Cliniche e turni devono essere array"
                    }
                )

                return

            # Controllo revisione e scrittura protetti
            # dallo stesso lock.

            with DATA_LOCK:

                current_revision, current_data = _read_store()

                if base_revision != current_revision:

                    response = dict(current_data)

                    response["_syncRevision"] = current_revision
                    response["success"] = False
                    response["conflict"] = True

                    self._send_json(409, response)

                    return

                new_revision = current_revision + 1

                _write_store(new_revision, data)

            self._send_json(
                200,
                {
                    "success": True,
                    "revision": new_revision,
                    "message": "Dati salvati sul server",
                    "clinicsCount": len(data.get("clinics", [])),
                    "shiftsCount": len(data.get("shifts", []))
                }
            )

        except json.JSONDecodeError:

            self._send_json(
                400,
                {
                    "success": False,
                    "error": "JSON non valido"
                }
            )

        except Exception as exc:

            print("Errore POST DentTrack:", exc)

            self._send_json(
                500,
                {
                    "success": False,
                    "error": str(exc)
                }
            )


# ==========================================================
# AVVIO SERVER
# ==========================================================

def run_server():

    local_ip = get_local_ip()

    server = ThreadingHTTPServer(
        ("", PORT),
        DentTrackHandler
    )

    print("=" * 64)
    print("       DENTTRACK - SERVER DI SINCRONIZZAZIONE")
    print("=" * 64)

    print(
        f" [PC / Raspberry locale]  http://localhost:{PORT}/"
    )

    print(
        f" [Smartphone / Wi-Fi]     http://{local_ip}:{PORT}/"
    )

    print(
        f" Archivio persistente:    {DATA_FILE}"
    )

    print(
        " Protezione revisioni:    attiva"
    )

    print("=" * 64)

    try:
        server.serve_forever()

    except KeyboardInterrupt:
        print("\nArresto del server DentTrack...")

    finally:
        server.server_close()


if __name__ == "__main__":
    run_server()
