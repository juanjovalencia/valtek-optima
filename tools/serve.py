"""Servidor local del prototipo Valtek Optima, sin caché.

Uso (desde la raíz del repositorio):
    python3 tools/serve.py          -> http://localhost:5173
    python3 tools/serve.py 8080     -> otro puerto
"""
import http.server
import os
import socket
import sys
from functools import partial

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'valtek-optima')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()


class DualStackServer(http.server.ThreadingHTTPServer):
    """Escucha en localhost por IPv4 e IPv6 (Safari y Chrome usan cualquiera de los dos)."""
    address_family = socket.AF_INET6

    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except (AttributeError, OSError):
            pass
        super().server_bind()


if __name__ == '__main__':
    handler = partial(NoCacheHandler, directory=os.path.abspath(ROOT))
    try:
        httpd = DualStackServer(('::1', PORT), handler)
        # ::1 solo cubre IPv6; además abrimos 127.0.0.1 en paralelo
        import threading
        v4 = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler)
        threading.Thread(target=v4.serve_forever, daemon=True).start()
    except OSError:
        httpd = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler)
    print(f'Valtek Optima en http://localhost:{PORT}  (Ctrl+C para detener)', flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nServidor detenido.')
