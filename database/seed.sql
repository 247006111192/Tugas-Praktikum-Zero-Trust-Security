-- =====================================================================
-- SEED DATA: Zero Trust Security - Sistem Layanan Nilai Akademik
-- Password demo untuk semua akun: Password123!
-- Hash: $2a$10$9jKIQ2HkHQBqaxKKlEnKc.uEUQxcQ2UVqFozhlAUhUIdy0ccSdlCO
-- =====================================================================

USE `zero_trust_security`;

-- Nonaktifkan Foreign Key Check sementara saat seeding ulang
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE `audit_logs`;
TRUNCATE TABLE `transcripts`;
TRUNCATE TABLE `grades`;
TRUNCATE TABLE `enrollments`;
TRUNCATE TABLE `classes`;
TRUNCATE TABLE `refresh_tokens`;
TRUNCATE TABLE `registered_devices`;
TRUNCATE TABLE `users`;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. Insert Users
INSERT INTO `users` (`id`, `nim`, `name`, `email`, `password_hash`, `role`, `is_active`) VALUES
(1, 'ADM-001', 'Administrator Akademik', 'admin@kampus.ac.id', '$2a$10$9jKIQ2HkHQBqaxKKlEnKc.uEUQxcQ2UVqFozhlAUhUIdy0ccSdlCO', 'admin', 1),
(2, 'DSN-001', 'Dr. Budi Santoso, M.Kom.', 'dosen1@kampus.ac.id', '$2a$10$9jKIQ2HkHQBqaxKKlEnKc.uEUQxcQ2UVqFozhlAUhUIdy0ccSdlCO', 'lecturer', 1),
(3, 'DSN-002', 'Dr. Siti Aminah, M.T.', 'dosen2@kampus.ac.id', '$2a$10$9jKIQ2HkHQBqaxKKlEnKc.uEUQxcQ2UVqFozhlAUhUIdy0ccSdlCO', 'lecturer', 1),
(4, '2021001', 'Ahmad Fauzi', 'mhs1@kampus.ac.id', '$2a$10$9jKIQ2HkHQBqaxKKlEnKc.uEUQxcQ2UVqFozhlAUhUIdy0ccSdlCO', 'student', 1),
(5, '2021002', 'Bunga Citra', 'mhs2@kampus.ac.id', '$2a$10$9jKIQ2HkHQBqaxKKlEnKc.uEUQxcQ2UVqFozhlAUhUIdy0ccSdlCO', 'student', 1),
(6, '2021003', 'Candra Wijaya', 'mhs3@kampus.ac.id', '$2a$10$9jKIQ2HkHQBqaxKKlEnKc.uEUQxcQ2UVqFozhlAUhUIdy0ccSdlCO', 'student', 1),
(7, '2021099', 'Akun Mahasiswa Nonaktif', 'inactive@kampus.ac.id', '$2a$10$9jKIQ2HkHQBqaxKKlEnKc.uEUQxcQ2UVqFozhlAUhUIdy0ccSdlCO', 'student', 0);

-- 2. Insert Registered Devices
INSERT INTO `registered_devices` (`id`, `user_id`, `device_id`, `device_name`, `is_active`) VALUES
(1, 1, 'DEV-ADMIN-01', 'Admin Management Console', 1),
(2, 2, 'DEV-DOSEN-01', 'Laptop ThinkPad Dr. Budi', 1),
(3, 3, 'DEV-DOSEN-02', 'MacBook Air Dr. Siti', 1),
(4, 4, 'DEV-MHS-01', 'Laptop Asus Ahmad', 1),
(5, 4, 'DEV-MHS-REVOKED', 'HP Lama Ahmad (Dinonaktifkan)', 0),
(6, 5, 'DEV-MHS-02', 'Laptop Dell Bunga', 1),
(7, 6, 'DEV-MHS-03', 'Laptop Acer Candra', 1),
(8, 7, 'DEV-INACTIVE-01', 'Perangkat Akun Nonaktif', 1);

-- 3. Insert Classes
INSERT INTO `classes` (`id`, `class_code`, `class_name`, `lecturer_id`, `semester`, `academic_year`, `is_finalized`) VALUES
(1, 'TIF-301', 'Keamanan Informasi', 2, 'Ganjil', '2026/2027', 0),
(2, 'TIF-302', 'Kriptografi Terapan', 3, 'Ganjil', '2026/2027', 0);

-- 4. Insert Enrollments
-- Kelas 1 (TIF-301): Ahmad Fauzi (4), Bunga Citra (5)
-- Kelas 2 (TIF-302): Bunga Citra (5), Candra Wijaya (6)
INSERT INTO `enrollments` (`id`, `class_id`, `student_id`) VALUES
(1, 1, 4),
(2, 1, 5),
(3, 2, 5),
(4, 2, 6);

-- 5. Insert Initial Grades
-- Nilai awal untuk Kelas 1 (Dosen Dr. Budi - id 2)
INSERT INTO `grades` (`id`, `class_id`, `student_id`, `score`, `updated_by`) VALUES
(1, 1, 4, 85.50, 2),
(2, 1, 5, 78.00, 2),
-- Nilai awal untuk Kelas 2 (Dosen Dr. Siti - id 3)
(3, 2, 5, 90.00, 3),
(4, 2, 6, 82.50, 3);
