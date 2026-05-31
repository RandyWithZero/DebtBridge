INSERT INTO admin_users (id, email, password_hash, role, display_name)
VALUES
  (
    '00000000-0000-4000-8000-000000000001',
    'admin@example.com',
    'scrypt$debtbridge-admin-1$1973d85cd00d4981f23cad7aafb9710b6cdd502050dbac34ecae0587be24d1e42a747607f7cabc9dbccc8c42a8a9f0c29e73e26a32b18b10c85b38c7f9327b96',
    'manager',
    '平台管理员'
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'operator@example.com',
    'scrypt$debtbridge-admin-2$4e13f4d164cff9936792b4da57246ebfa13bf0af12dd74d2f33358e402503583fc863cea8de125444cd37ac3b7bc4c2aa60bfc75c87c39a481265150d3c99d87',
    'operator',
    '平台运营'
  )
ON CONFLICT (email) DO UPDATE
SET
  id = EXCLUDED.id,
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  display_name = EXCLUDED.display_name,
  updated_at = now();
