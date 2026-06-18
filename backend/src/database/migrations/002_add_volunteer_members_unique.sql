-- ============================================================
-- Migration: 002_add_volunteer_members_unique
-- Deskripsi : Menambahkan UNIQUE constraint (jemaat_id,
--             volunteer_type_id) pada volunteer_members, sesuai
--             keputusan arsitektur modul Volunteer: satu jemaat
--             tidak boleh terdaftar dua kali untuk jenis volunteer
--             yang sama.
-- ============================================================

ALTER TABLE volunteer_members
ADD CONSTRAINT uq_vm_jemaat_volunteer_type UNIQUE (jemaat_id, volunteer_type_id);