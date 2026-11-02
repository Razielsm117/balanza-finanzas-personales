import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from http.server import ThreadingHTTPServer
from app import Handler
from finance import all_transactions, connect, export_csv, import_csv, parse_csv, snapshot
from report import generate_report

HEADER = 'id,date,description,category,account,type,amount\n'
FIXTURE = HEADER + 'a,2026-10-01,Sueldo,Sueldo,Banco,ingreso,1000.00\n' + 'b,2026-10-02,Comida,Alimentación,Tarjeta,gasto,250.25\n' + 'c,2026-09-02,Internet,Servicios,Banco,gasto,120.00\n'


class FinanceTests(unittest.TestCase):
    def setUp(self):
        self.conn = connect(':memory:')
        import_csv(self.conn, FIXTURE)

    def tearDown(self):
        self.conn.close()

    def test_exact_cents_and_month(self):
        t = snapshot(self.conn, {'month': '2026-10'})['totals']
        self.assertEqual((t['income'], t['expense'], t['balance'], t['count']), (100000, 25025, 74975, 2))
        self.assertAlmostEqual(t['savings_rate'], 74.975)

    def test_zero_income_is_undefined_percentage(self):
        self.assertIsNone(snapshot(self.conn, {'month': '2026-09'})['totals']['savings_rate'])

    def test_negative_balance(self):
        self.assertEqual(snapshot(self.conn, {'month': '2026-09'})['totals']['balance'], -12000)

    def test_account_category_and_history(self):
        d = snapshot(self.conn, {'month': '2026-10', 'account': 'Banco'})
        self.assertEqual(d['totals']['count'], 1)
        self.assertEqual(len(d['months']), 2)
        self.assertEqual(snapshot(self.conn, {'category': 'Alimentación'})['categories'][0]['amount'], 25025)

    def test_identical_import_is_idempotent(self):
        self.assertEqual(import_csv(self.conn, FIXTURE), {'imported': 0, 'skipped': 3})

    def test_conflict_rolls_back_entire_batch(self):
        content = HEADER + 'new,2026-10-03,Nuevo,Ocio,Banco,gasto,10\n' + 'a,2026-10-01,Distinto,Sueldo,Banco,ingreso,20\n'
        with self.assertRaises(ValueError):
            import_csv(self.conn, content)
        self.assertEqual(len(all_transactions(self.conn)), 3)

    def test_invalid_csv_rows_are_rejected(self):
        for value in ('0', '-20', '1.123', 'NaN', '1e4', '100000001'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_csv(HEADER + f'x,2026-10-01,Prueba,Ocio,Banco,gasto,{value}\n')
        for day in ('2026-02-30', '2026-13-01', '0000-01-01', '10/01/2026'):
            with self.subTest(day=day), self.assertRaises(ValueError):
                parse_csv(HEADER + f'x,{day},Prueba,Ocio,Banco,gasto,1\n')

    def test_duplicate_ids_in_file_are_rejected(self):
        with self.assertRaises(ValueError):
            parse_csv(FIXTURE + 'a,2026-10-01,Otro,Ocio,Banco,gasto,1\n')

    def test_bom_quoted_comma_and_newline(self):
        rows = parse_csv('\ufeff' + HEADER + 'x,2026-10-01,"Café, pan\ny fruta",Comida,Banco,gasto,1.20\n')
        self.assertEqual(rows[0]['description'], 'Café, pan\ny fruta')
        self.assertEqual(rows[0]['amount_cents'], 120)

    def test_unterminated_quotes(self):
        with self.assertRaises(ValueError):
            parse_csv(HEADER + 'x,2026-10-01,"sin cierre,Comida,Banco,gasto,1\n')

    def test_empty_and_wrong_headers(self):
        for content in (HEADER, 'date,amount\n2026-10-01,2\n'):
            with self.assertRaises(ValueError):
                parse_csv(content)

    def test_filters_are_parameterized(self):
        self.assertEqual(snapshot(self.conn, {'category': "' OR 1=1 --"})['totals']['count'], 0)
        self.assertEqual(len(all_transactions(self.conn)), 3)

    def test_empty_report_and_invalid_month(self):
        with tempfile.TemporaryDirectory() as temp:
            path = generate_report(self.conn, '2025-01', temp)
            self.assertIn('Movimientos: 0', path.read_text())
            self.assertTrue((Path(temp) / '2025-01.csv').exists())
            with self.assertRaises(ValueError):
                generate_report(self.conn, '../../oops', temp)

    def test_csv_export_neutralizes_formulas(self):
        rows = all_transactions(self.conn)
        rows[0]['description'] = '=1+1'
        self.assertIn("'=1+1", export_csv(rows))


class APITests(unittest.TestCase):
    def test_http_summary_import_and_cross_origin_rejection(self):
        with tempfile.TemporaryDirectory() as temp:
            db = Path(temp) / 'test.sqlite3'
            with connect(db) as conn:
                import_csv(conn, FIXTURE)
            server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
            server.db_path = db
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base = f'http://127.0.0.1:{server.server_port}'
            try:
                with urllib.request.urlopen(base + '/api/summary?month=2026-10') as response:
                    self.assertEqual(json.load(response)['totals']['balance'], 74975)
                request = urllib.request.Request(base + '/api/import', data=FIXTURE.encode(), headers={'Content-Type': 'text/csv'})
                with urllib.request.urlopen(request) as response:
                    self.assertEqual(json.load(response)['skipped'], 3)
                request.add_header('Origin', 'https://another-site.example')
                with self.assertRaises(urllib.error.HTTPError) as rejected:
                    urllib.request.urlopen(request)
                self.assertEqual(rejected.exception.code, 403)
            finally:
                server.shutdown()
                thread.join()
                server.server_close()


if __name__ == '__main__':
    unittest.main()
