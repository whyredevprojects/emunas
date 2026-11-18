-- Which recording was playing when the report was sent: the AI-improved copy or the original.
-- NULL when nothing was playing or the client did not say.
ALTER TABLE feedback ADD COLUMN audio TEXT CHECK (audio IS NULL OR audio IN ('cleaned', 'original'));
