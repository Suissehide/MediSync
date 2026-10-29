BEGIN;
-- Chaque run d'un texte recoit un id, r1, r2... dans son element, comme le modele livre.
-- Le schema l'exige desormais : une ligne laissee sans id serait ecartee a la lecture.
-- Un run qui a deja un id le garde ; une forme inattendue est laissee telle quelle.
CREATE FUNCTION "_pdf_runs_avec_id"(contenu JSONB) RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_set(contenu, '{pages}', (
    SELECT jsonb_agg(
      CASE WHEN page->>'kind' = 'canvas' AND jsonb_typeof(page->'elements') = 'array'
        THEN jsonb_set(page, '{elements}', COALESCE((
          SELECT jsonb_agg(
            CASE WHEN el->>'kind' = 'text' AND jsonb_typeof(el->'runs') = 'array'
              THEN jsonb_set(el, '{runs}', COALESCE((
                SELECT jsonb_agg(
                  CASE WHEN jsonb_typeof(run) = 'object' AND NOT run ? 'id'
                    THEN run || jsonb_build_object('id', 'r' || rang)
                    ELSE run
                  END ORDER BY rang)
                FROM jsonb_array_elements(el->'runs') WITH ORDINALITY AS r(run, rang)
              ), '[]'::JSONB))
              ELSE el
            END ORDER BY rang_el)
          FROM jsonb_array_elements(page->'elements') WITH ORDINALITY AS e(el, rang_el)
        ), '[]'::JSONB))
        ELSE page
      END ORDER BY rang_page)
    FROM jsonb_array_elements(contenu->'pages') WITH ORDINALITY AS p(page, rang_page)
  ))
$$;

UPDATE "PdfDesign" SET "content" = "_pdf_runs_avec_id"("content")
WHERE jsonb_typeof("content"->'pages') = 'array' AND jsonb_array_length("content"->'pages') > 0;
UPDATE "PdfDesignPreset" SET "content" = "_pdf_runs_avec_id"("content")
WHERE jsonb_typeof("content"->'pages') = 'array' AND jsonb_array_length("content"->'pages') > 0;

DROP FUNCTION "_pdf_runs_avec_id"(JSONB);
COMMIT;
