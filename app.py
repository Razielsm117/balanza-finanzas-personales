"""Servidor local de demostración. Ejecuta: python3 app.py"""
import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
from finance import ROOT, all_transactions, connect, import_csv, snapshot


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'web'), **kwargs)

    def json_response(self, payload, status=200):
        content = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/config.js':
            body = b'window.BALANZA_API = true;'
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed.path.startswith('/api/'):
            try:
                with connect(self.server.db_path) as conn:
                    if parsed.path == '/api/transactions':
                        result = all_transactions(conn)
                    elif parsed.path == '/api/summary':
                        filters = {k: v[0] for k, v in parse_qs(parsed.query).items()}
                        result = snapshot(conn, filters)
                    else:
                        self.json_response({'error': 'Ruta no encontrada.'}, 404)
                        return
                self.json_response(result)
            except ValueError as exc:
                self.json_response({'error': str(exc)}, 400)
            return
        super().do_GET()

    def do_POST(self):
        if self.path != '/api/import':
            self.json_response({'error': 'Ruta no encontrada.'}, 404)
            return
        # Evita que otra página envíe importaciones al servidor local.
        host = self.headers.get('Host', '')
        origin = self.headers.get('Origin')
        if host not in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}') or (origin and origin != 'http://' + host):
            self.json_response({'error': 'Origen no permitido.'}, 403)
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 2_000_000:
                raise ValueError('El CSV debe medir entre 1 byte y 2 MB.')
            content = self.rfile.read(size).decode('utf-8-sig')
            with connect(self.server.db_path) as conn:
                result = import_csv(conn, content)
            self.json_response(result)
        except (ValueError, UnicodeError) as exc:
            self.json_response({'error': str(exc)}, 400)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--db', default=str(ROOT / 'data' / 'finance.sqlite3'))
    parser.add_argument('--empty', action='store_true', help='No cargar datos de ejemplo en una base vacía.')
    args = parser.parse_args()
    with connect(args.db) as conn:
        if not args.empty and not conn.execute('SELECT 1 FROM transactions LIMIT 1').fetchone():
            import_csv(conn, (ROOT / 'data' / 'demo.csv').read_text())
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    server.db_path = args.db
    print(f'Balanza: http://127.0.0.1:{args.port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()

