INSERT INTO admin_users (email, password_hash, role, display_name)
VALUES
  ('admin@example.com', 'local-dev-password-placeholder', 'manager', '平台管理员'),
  ('operator@example.com', 'local-dev-password-placeholder', 'operator', '平台运营')
ON CONFLICT (email) DO UPDATE
SET
  role = EXCLUDED.role,
  display_name = EXCLUDED.display_name,
  updated_at = now();
