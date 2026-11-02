-- Consultas reproducibles para explorar la base creada por app.py.
-- El dinero se almacena en centavos enteros; se convierte solo al presentar.

-- 1. Balance mensual y porcentaje restante. NULL si no hay ingresos.
WITH monthly AS (
    SELECT substr(date, 1, 7) AS month,
           SUM(CASE WHEN type = 'ingreso' THEN amount_cents ELSE 0 END) AS income,
           SUM(CASE WHEN type = 'gasto' THEN amount_cents ELSE 0 END) AS expense
    FROM transactions GROUP BY month
)
SELECT month, income / 100.0 AS income_mxn, expense / 100.0 AS expense_mxn,
       (income - expense) / 100.0 AS balance_mxn,
       ROUND(100.0 * (income - expense) / NULLIF(income, 0), 2) AS remaining_pct
FROM monthly ORDER BY month;

-- 2. Categorías con mayor participación en los gastos.
SELECT category, SUM(amount_cents) / 100.0 AS total_mxn,
       ROUND(100.0 * SUM(amount_cents) / SUM(SUM(amount_cents)) OVER (), 2) AS share_pct
FROM transactions WHERE type = 'gasto'
GROUP BY category ORDER BY total_mxn DESC;

-- 3. Cambio de los gastos respecto al mes anterior (función de ventana).
WITH monthly AS (
    SELECT substr(date, 1, 7) AS month, SUM(amount_cents) AS expense
    FROM transactions WHERE type = 'gasto' GROUP BY month
)
SELECT month, expense / 100.0 AS expense_mxn,
       (expense - LAG(expense) OVER (ORDER BY month)) / 100.0 AS change_mxn
FROM monthly ORDER BY month;
