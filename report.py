"""Genera un reporte mensual en Markdown y CSV, sin intervención manual."""
import argparse
from pathlib import Path
from finance import ROOT, connect, export_csv, import_csv, snapshot


def generate_report(conn, month, output):
    data = snapshot(conn, {'month': month})
    totals = data['totals']
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    money = lambda n: f'${n / 100:,.2f} MXN'
    lines = [f'# Balanza · Reporte de {month}', '',
             'Resumen descriptivo de los movimientos registrados. No incluye recomendaciones financieras.', '',
             f'- Ingresos: {money(totals["income"])}', f'- Gastos: {money(totals["expense"])}',
             f'- Saldo del período: {money(totals["balance"])}', f'- Movimientos: {totals["count"]}', '',
             '## Gastos por categoría', '']
    lines += [f'- {r["category"]}: {money(r["amount"])}' for r in data['categories']]
    (output / f'{month}.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    (output / f'{month}.csv').write_text(export_csv(data['transactions']), encoding='utf-8-sig')
    return output / f'{month}.md'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--month', required=True, help='AAAA-MM')
    parser.add_argument('--db', default=str(ROOT / 'data' / 'finance.sqlite3'))
    parser.add_argument('--csv', type=Path, help='Importar un CSV antes del reporte (sin duplicar movimientos).')
    parser.add_argument('--output', default=str(ROOT / 'reports'))
    args = parser.parse_args()
    try:
        with connect(args.db) as conn:
            if args.csv:
                import_csv(conn, args.csv.read_text(encoding='utf-8-sig'))
            print(generate_report(conn, args.month, args.output))
    except ValueError as exc:
        parser.error(str(exc))

