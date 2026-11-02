"""Generador reproducible de datos ficticios; no contiene información personal."""
import csv
import random
from pathlib import Path
from finance import FIELDS, ROOT


def generate(path=ROOT / 'data' / 'demo.csv'):
    rng = random.Random(117)
    rows = []
    def add(month, day, description, category, account, kind, amount):
        rows.append([f'DEMO-{len(rows)+1:04}', f'2026-{month:02}-{day:02}', description, category, account, kind, f'{amount:.2f}'])
    for m in range(1, 11):
        add(m, 1, 'Sueldo mensual', 'Sueldo', 'Cuenta bancaria', 'ingreso', 32000)
        add(m, 18, 'Proyecto freelance', 'Freelance', 'Cuenta bancaria', 'ingreso', rng.randint(45, 110)*100)
        add(m, 3, 'Renta del departamento', 'Vivienda', 'Cuenta bancaria', 'gasto', 9500)
        add(m, 8, 'Internet y electricidad', 'Servicios', 'Cuenta bancaria', 'gasto', rng.randint(11, 17)*100)
        add(m, 12, 'Suscripciones digitales', 'Servicios', 'Tarjeta', 'gasto', 459)
        add(m, 15, 'Consulta o farmacia', 'Salud', 'Tarjeta', 'gasto', rng.randint(3, 12)*100)
        for day in (4, 11, 18, 25):
            add(m, day, 'Compra de supermercado', 'Alimentación', 'Tarjeta', 'gasto', rng.randint(80, 135)*10)
            add(m, day+1, 'Transporte de la semana', 'Transporte', 'Efectivo', 'gasto', rng.randint(25, 45)*10)
        for day in (7, 14, 21):
            add(m, day, 'Salida y entretenimiento', 'Ocio', 'Tarjeta', 'gasto', rng.randint(35, 95)*10)
        if m in (3, 7, 10):
            add(m, 22, 'Curso de Python y SQL', 'Educación', 'Tarjeta', 'gasto', 1490)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(FIELDS)
        writer.writerows(rows)
    return path


if __name__ == '__main__':
    print(generate())

