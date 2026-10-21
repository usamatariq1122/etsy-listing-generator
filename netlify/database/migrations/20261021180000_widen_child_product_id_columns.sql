-- Widen the child references that point at an owned product or job id.
--
-- Since Phase 2 a listing's primary key carries its owner (`<user>:<uuid>`), which
-- is up to 73 characters, and the user_accounts migration widened products.id and
-- bulk_jobs.id to VARCHAR(80) to hold it. The child columns that store that same
-- id were left at VARCHAR(36), so the moment the pipeline saved the two PDF
-- documents for a fresh listing (or an image, or a bulk row) Postgres rejected it
-- with `value too long for type character varying(36)` and the generation failed.
-- Bring every one of them to VARCHAR(80) so they match the key they reference.

ALTER TABLE product_images    ALTER COLUMN product_id TYPE VARCHAR(80);
ALTER TABLE product_documents ALTER COLUMN product_id TYPE VARCHAR(80);
ALTER TABLE bulk_rows         ALTER COLUMN job_id      TYPE VARCHAR(80);
ALTER TABLE bulk_rows         ALTER COLUMN product_id  TYPE VARCHAR(80);
