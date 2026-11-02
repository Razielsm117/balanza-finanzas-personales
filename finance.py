"""Importación transaccional y análisis SQL. Solo biblioteca estándar de Python."""
import csv
import io
import re
import sqlite3
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIELDS = ['id', 'date', 'description', 'category', 'account', 'type', 'amount']
LIMIT = 10000


def connect(path=ROOT / 'data' / 'finance.sqlite3'):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript((ROOT / 'sql' / 'schema.sql').read_text())
    return conn


def parse_csv(content):
    try:
        return _parse_csv(content)
    except csv.Error as exc:
        raise ValueError('CSV inválido: revisa las comillas y los separadores.') from exc


def _parse_csv(content):
    reader = csv.DictReader(io.StringIO(content.lstrip('\ufeff'), newline=''), strict=True)
    if reader.fieldnames != FIELDS:
        raise ValueError('Columnas requeridas, en este orden: ' + ','.join(FIELDS))
    rows, seen = [], set()
    for line, row in enumerate(reader, 2):
        if len(rows) >= LIMIT:
            raise ValueError('El archivo supera los 10,000 movimientos.')
        if None in row or any(v is None for v in row.values()):
            raise ValueError(f'Fila {line}: número de columnas incorrecto.')
        row = {k: v.strip() for k, v in row.items()}
        if any(not row[k] or len(row[k]) > 120 for k in FIELDS):
            raise ValueError(f'Fila {line}: campos vacíos o demasiado largos.')
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', row['date']):
            raise ValueError(f'Fila {line}: usa fechas AAAA-MM-DD.')
        try:
            date.fromisoformat(row['date'])
        except ValueError as exc:
            raise ValueError(f'Fila {line}: fecha inválida.') from exc
        if row['type'] not in ('ingreso', 'gasto'):
            raise ValueError(f'Fila {line}: tipo inválido; usa ingreso o gasto.')
        if not re.fullmatch(r'\d+(?:\.\d{1,2})?', row['amount']):
            raise ValueError(f'Fila {line}: el importe debe ser positivo y tener máximo dos decimales.')
        whole, _, fraction = row.pop('amount').partition('.')
        row['amount_cents'] = int(whole) * 100 + int(fraction.ljust(2, '0'))
        if not 0 < row['amount_cents'] <= 100_000_000_00:
            raise ValueError(f'Fila {line}: importe fuera de rango.')
        if row['id'] in seen:
            raise ValueError(f'Fila {line}: identificador repetido en el archivo.')
        seen.add(row['id'])
        rows.append(row)
    if not rows:
        raise ValueError('El archivo no contiene movimientos.')
    return rows


def import_csv(conn, content):
    rows = parse_csv(content)
    existing = {r['id']: dict(r) for r in conn.execute('SELECT * FROM transactions')}
    additions = []
    for row in rows:
        if row['id'] in existing:
            if row != existing[row['id']]:
                raise ValueError('Un identificador ya existe con datos distintos: ' + row['id'])
        else:
            additions.append(row)
    if len(existing) + len(additions) > LIMIT:
        raise ValueError('Se permiten hasta 10,000 movimientos en total.')
    with conn:
        conn.executemany('''INSERT INTO transactions
            (id,date,description,category,account,type,amount_cents)
            VALUES (:id,:date,:description,:category,:account,:type,:amount_cents)''', additions)
    return {'imported': len(additions), 'skipped': len(rows) - len(additions)}


def all_transactions(conn):
    return [dict(r) for r in conn.execute('SELECT * FROM transactions ORDER BY date DESC, id DESC')]


def where(filters, include_month=True):
    clauses, params = [], []
    for field in ('category', 'account'):
        if filters.get(field):
            clauses.append(field + ' = ?')
            params.append(filters[field])
    if include_month and filters.get('month'):
        if not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', filters['month']):
            raise ValueError('Mes inválido.')
        clauses.append('substr(date,1,7) = ?')
        params.append(filters['month'])
    return (' WHERE ' + ' AND '.join(clauses) if clauses else ''), params


def snapshot(conn, filters=None):
    filters = filters or {}
    clause, params = where(filters)
    totals = dict(conn.execute('''SELECT
        COALESCE(SUM(CASE WHEN type='ingreso' THEN amount_cents ELSE 0 END),0) AS income,
        COALESCE(SUM(CASE WHEN type='gasto' THEN amount_cents ELSE 0 END),0) AS expense,
        COUNT(*) AS count FROM transactions''' + clause, params).fetchone())
    totals['balance'] = totals['income'] - totals['expense']
    totals['savings_rate'] = totals['balance'] / totals['income'] * 100 if totals['income'] else None
    categories = [dict(r) for r in conn.execute('''SELECT category, SUM(amount_cents) AS amount
        FROM transactions''' + clause + (' AND ' if clause else ' WHERE ') + "type='gasto' GROUP BY category ORDER BY amount DESC, category", params)]
    history_clause, history_params = where(filters, include_month=False)
    months = [dict(r) for r in conn.execute('''SELECT substr(date,1,7) AS month,
        SUM(CASE WHEN type='ingreso' THEN amount_cents ELSE 0 END) AS income,
        SUM(CASE WHEN type='gasto' THEN amount_cents ELSE 0 END) AS expense
        FROM transactions''' + history_clause + ' GROUP BY month ORDER BY month', history_params)]
    transactions = [dict(r) for r in conn.execute('SELECT * FROM transactions' + clause + ' ORDER BY date DESC, id DESC', params)]
    return {'totals': totals, 'categories': categories, 'months': months, 'transactions': transactions}


def export_csv(rows):
    output = io.StringIO(newline='')
    writer = csv.writer(output)
    writer.writerow(FIELDS)
    for row in rows:
        # Neutraliza fórmulas al abrir el CSV en una hoja de cálculo.
        text = [row[k] for k in FIELDS[:-1]]
        text = ["'" + v if v.startswith(('=', '+', '-', '@', '\t', '\r')) else v for v in text]
        writer.writerow(text + [f"{row['amount_cents'] // 100}.{row['amount_cents'] % 100:02d}"])
    return output.getvalue()

