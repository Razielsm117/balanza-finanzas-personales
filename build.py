"""Exporta la demostración web sin base de datos ni datos locales del usuario."""
import json
import shutil
from finance import ROOT, all_transactions, connect, import_csv

if __name__ == '__main__':
    target = ROOT / 'dist'
    shutil.copytree(ROOT / 'web', target, dirs_exist_ok=True)
    with connect(':memory:') as conn:
        import_csv(conn, (ROOT / 'data' / 'demo.csv').read_text())
        (target / 'demo.json').write_text(json.dumps(all_transactions(conn), ensure_ascii=False), encoding='utf-8')
    shutil.copyfile(ROOT / 'data' / 'demo.csv', target / 'ejemplo.csv')
    print('Demo exportada a dist/')
