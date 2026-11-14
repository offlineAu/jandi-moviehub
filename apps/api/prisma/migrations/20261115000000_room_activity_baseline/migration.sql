-- Older activity timestamps did not include room visits or playback. Give existing rooms a fresh inactivity window.
UPDATE "rooms" SET "last_active_at" = CURRENT_TIMESTAMP WHERE "status" = 'OPEN' AND "last_active_at" < CURRENT_TIMESTAMP - INTERVAL '23 days';
