BEGIN;

ALTER TABLE public.stock_history
  ADD COLUMN IF NOT EXISTS sale_id integer REFERENCES public.sales(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS stock_history_sale_id_key ON public.stock_history(sale_id);

-- Only link unambiguous legacy pairs. Never overwrite either record's business data.
WITH candidates AS (
  SELECT s.id AS sale_id, h.id AS history_id,
    count(*) OVER (PARTITION BY s.id) AS sale_matches,
    count(*) OVER (PARTITION BY h.id) AS history_matches
  FROM public.sales s
  JOIN public.stock_history h ON h.transaction_no = s.transaction_no
    AND h.io_type = '출고'
    AND h.product_id IS NOT DISTINCT FROM s.product_id
    AND (s.product_id IS NOT NULL OR h.product_name IS NOT DISTINCT FROM s.product_name)
  WHERE h.sale_id IS NULL AND NULLIF(s.transaction_no, '') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.stock_history linked WHERE linked.sale_id = s.id)
)
UPDATE public.stock_history h SET sale_id = c.sale_id
FROM candidates c WHERE h.id = c.history_id AND c.sale_matches = 1 AND c.history_matches = 1;

COMMIT;
