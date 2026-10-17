-- Database-level guards. These hold even if application code has a bug.

-- 1. Only teachers and super admins can be recorded as the grader of work.
CREATE OR REPLACE FUNCTION dt_check_grader() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = NEW.graded_by_id AND u.role IN ('teacher', 'super_admin') AND u.status = 'active'
  ) THEN
    RAISE EXCEPTION 'grader % is not an active teacher or super admin', NEW.graded_by_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER grades_grader_guard BEFORE INSERT OR UPDATE ON grades
  FOR EACH ROW EXECUTE FUNCTION dt_check_grader();
--> statement-breakpoint

-- 2. The platform can never be left without an active super admin.
CREATE OR REPLACE FUNCTION dt_keep_one_admin() RETURNS trigger AS $$
BEGIN
  IF OLD.role = 'super_admin' AND OLD.status = 'active'
     AND (NEW.role <> 'super_admin' OR NEW.status <> 'active') THEN
    IF NOT EXISTS (
      SELECT 1 FROM users u
      WHERE u.id <> OLD.id AND u.role = 'super_admin' AND u.status = 'active'
    ) THEN
      RAISE EXCEPTION 'cannot remove the last active super admin'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER users_last_admin_guard BEFORE UPDATE OF role, status ON users
  FOR EACH ROW EXECUTE FUNCTION dt_keep_one_admin();
--> statement-breakpoint

-- 3. A submission attempt can only be graded once it has been handed in.
CREATE OR REPLACE FUNCTION dt_check_gradable() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM submission_attempts a WHERE a.id = NEW.attempt_id AND a.status IN ('submitted', 'graded')
  ) THEN
    RAISE EXCEPTION 'attempt % has not been submitted', NEW.attempt_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER grades_submitted_guard BEFORE INSERT ON grades
  FOR EACH ROW EXECUTE FUNCTION dt_check_gradable();
