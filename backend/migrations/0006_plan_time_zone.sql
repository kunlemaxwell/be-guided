-- Ready-made update plans start in UTC (they used one fixed city's zone).
-- People pick their own zone when they edit or copy a plan.
UPDATE update_plans SET time_zone = 'UTC' WHERE built_in = 1 AND time_zone = 'Africa/Lagos';
