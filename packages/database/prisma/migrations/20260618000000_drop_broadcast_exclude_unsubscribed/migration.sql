-- Unsubscribed/bounced contacts are now ALWAYS excluded at dispatch time
-- (legal requirement — CAN-SPAM / GDPR), so the per-broadcast toggle is gone.
ALTER TABLE "Broadcast" DROP COLUMN "excludeUnsubscribed";
