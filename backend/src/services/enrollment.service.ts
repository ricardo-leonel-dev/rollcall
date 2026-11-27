import { EntityManager, IsNull } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Enrollment } from '../entities/Enrollment';
import { Student } from '../entities/Student';
import { Course } from '../entities/Course';
import { AcademicYear } from '../entities/AcademicYear';
import { Guardian } from '../entities/Guardian';
import { Absence } from '../entities/Absence';
import { cascadeSoftDeleteAbsence } from './absence.service';
import { recordEvents } from './domain-event.service';
import { notWithdrawnSql, assertEnrollmentNotWithdrawn } from './enrollment-withdrawal';

const repo = () => AppDataSource.getRepository(Enrollment);

export async function cascadeSoftDeleteEnrollment(em: EntityManager, enrollmentId: number): Promise<void> {
  const absences = await em.find(Absence, { where: { enrollmentId, deletedAt: IsNull() } });
  for (const a of absences) await cascadeSoftDeleteAbsence(em, a.id);
  await em.update(Enrollment, { id: enrollmentId }, { deletedAt: new Date(), isActive: false });
}

async function assertOwnership(institutionId: number, courseIds: number[] | null, data: {
  studentId?: number; courseId?: number; academicYearId?: number; guardianId?: number | null;
}, em: EntityManager = AppDataSource.manager) {
  if (data.studentId !== undefined) {
    const s = await em.getRepository(Student).findOne({ where: { id: data.studentId, institutionId } });
    if (!s) throw Object.assign(new Error('Student not found'), { status: 404 });
  }
  if (data.courseId !== undefined) {
    if (courseIds !== null && !courseIds.includes(data.courseId)) {
      throw Object.assign(new Error('Course not found'), { status: 404 });
    }
    const c = await em.getRepository(Course).findOne({ where: { id: data.courseId, institutionId } });
    if (!c) throw Object.assign(new Error('Course not found'), { status: 404 });
  }
  if (data.academicYearId !== undefined) {
    const ay = await em.getRepository(AcademicYear).findOne({ where: { id: data.academicYearId, institutionId } });
    if (!ay) throw Object.assign(new Error('Academic year not found'), { status: 404 });
  }
  if (data.guardianId) {
    const g = await em.getRepository(Guardian).findOne({ where: { id: data.guardianId, institutionId } });
    if (!g) throw Object.assign(new Error('Guardian not found'), { status: 404 });
  }
}

export async function findAll(institutionId: number, courseIds: number[] | null, courseId?: number, academicYearId?: number, studentId?: number, courseIdsFilter?: number[]) {
  const conditions: string[] = ['institution_id = $1', notWithdrawnSql('v_enrollments_detail', 'enrollment_id')];
  const params: any[] = [institutionId];
  let i = 2;
  if (courseIds !== null)  { conditions.push(`course_id = ANY($${i++})`); params.push(courseIds); }
  if (courseId)       { conditions.push(`course_id = $${i++}`);        params.push(courseId); }
  if (academicYearId) { conditions.push(`academic_year_id = $${i++}`); params.push(academicYearId); }
  if (studentId)      { conditions.push(`student_id = $${i++}`);       params.push(studentId); }
  if (courseIdsFilter && courseIdsFilter.length) { conditions.push(`course_id = ANY($${i++})`); params.push(courseIdsFilter); }

  return AppDataSource.query(
    `SELECT
       enrollment_id   AS "enrollmentId",
       academic_year_id AS "academicYearId",
       academic_year   AS "academicYear",
       course_id       AS "courseId",
       course,
       teacher,
       student_id      AS "studentId",
       roster_number   AS "rosterNumber",
       id_number       AS "idNumber",
       full_name       AS "fullName",
       gender,
       birth_date      AS "birthDate",
       age,
       student_phone   AS "studentPhone",
       student_email   AS "studentEmail",
       guardian_id     AS "guardianId",
       guardian_name   AS "guardianName",
       guardian_phone  AS "guardianPhone",
       whatsapp_link   AS "whatsappLink",
       guardian_email  AS "guardianEmail",
       guardian_id_number AS "guardianIdNumber",
       is_active       AS "isActive"
     FROM v_enrollments_detail
     WHERE ${conditions.join(' AND ')}
     ORDER BY academic_year_id DESC, course, roster_number NULLS LAST, full_name`,
    params
  );
}

export async function findById(institutionId: number, courseIds: number[] | null, id: number) {
  const e = await repo().findOne({ where: { id, institutionId, deletedAt: IsNull() } });
  if (!e || (courseIds !== null && !courseIds.includes(e.courseId))) {
    throw Object.assign(new Error('Enrollment not found'), { status: 404 });
  }
  return e;
}

// The audit snapshot carries the business fields only — the technical ones
// (createdAt/updatedAt/deletedAt) would change the meaning of the record on
// every later read.
export function enrollmentSnapshot(e: {
  id: number; studentId: number; courseId: number; academicYearId: number;
  guardianId: number | null; rosterNumber: number | null;
  studentPhone: string | null; studentEmail: string | null; isActive: boolean;
}) {
  return {
    id: e.id,
    studentId: e.studentId,
    courseId: e.courseId,
    academicYearId: e.academicYearId,
    guardianId: e.guardianId ?? null,
    rosterNumber: e.rosterNumber ?? null,
    studentPhone: e.studentPhone ?? null,
    studentEmail: e.studentEmail ?? null,
    isActive: e.isActive,
  };
}

export async function create(institutionId: number, courseIds: number[] | null, data: {
  studentId: number; courseId: number; academicYearId: number;
  guardianId?: number; rosterNumber?: number;
  studentPhone?: string; studentEmail?: string;
}, createdByUserId: number | null = null) {
  await assertOwnership(institutionId, courseIds, data);
  // The enrollment and the audit event that describes it are written on the
  // same transaction: the event exists if and only if the enrollment was
  // created, and a failing event insert rolls the enrollment back.
  return AppDataSource.transaction(async (em) => {
    if (!data.rosterNumber) {
      const [row] = await em.query(
        `SELECT COALESCE(MAX(roster_number), 0) + 1 AS next
           FROM enrollments
          WHERE course_id = $1 AND academic_year_id = $2 AND deleted_at IS NULL`,
        [data.courseId, data.academicYearId]
      );
      data.rosterNumber = Number(row.next);
    }
    const e = em.create(Enrollment, {
      studentId: data.studentId,
      courseId: data.courseId,
      academicYearId: data.academicYearId,
      guardianId: data.guardianId ?? null,
      rosterNumber: data.rosterNumber,
      studentPhone: data.studentPhone ?? null,
      studentEmail: data.studentEmail ?? null,
      institutionId,
      createdByUserId,
    });
    const saved = await em.save(e);

    await recordEvents(em, [{
      institutionId,
      eventType: 'EnrollmentCreated',
      entityType: 'enrollment',
      entityId: saved.id,
      actorUserId: createdByUserId,
      payload: { before: null, after: enrollmentSnapshot(saved) },
    }]);

    return saved;
  });
}

type EnrollmentSnapshot = ReturnType<typeof enrollmentSnapshot>;

// Only the fields the snapshot carries count as a change: the audit trail
// says what the edit touched, so a request that repeats the same values
// leaves the enrollment exactly as it was for the trail.
function enrollmentChanged(before: EnrollmentSnapshot, after: EnrollmentSnapshot): boolean {
  return before.id !== after.id
    || before.studentId !== after.studentId
    || before.courseId !== after.courseId
    || before.academicYearId !== after.academicYearId
    || before.guardianId !== after.guardianId
    || before.rosterNumber !== after.rosterNumber
    || before.studentPhone !== after.studentPhone
    || before.studentEmail !== after.studentEmail
    || before.isActive !== after.isActive;
}

export async function update(institutionId: number, courseIds: number[] | null, id: number, data: Partial<{
  guardianId: number; rosterNumber: number;
  studentPhone: string; studentEmail: string; isActive: boolean;
}>, actorUserId: number | null = null) {
  // Course-scope check: an enrollment outside the caller's courses is a 404.
  await findById(institutionId, courseIds, id);

  // The row is read and written through the transaction's manager, so the
  // audit event and the edit share one fate: a failing event insert rolls
  // the edit back. The row lock serializes concurrent edits: each one reads
  // the "before" the previous one left.
  return AppDataSource.transaction(async (em) => {
    const current = await em.findOne(Enrollment, {
      where: { id, institutionId, deletedAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    if (!current) throw Object.assign(new Error('Enrollment not found'), { status: 404 });

    // Checked under the row lock: a withdrawal committed before the lock is
    // seen here, so the edit and its event never land on a withdrawn
    // enrollment. A rejection throws, rolling the transaction back.
    await assertEnrollmentNotWithdrawn(id, em);
    if (data.guardianId !== undefined) {
      await assertOwnership(institutionId, courseIds, { guardianId: data.guardianId }, em);
    }

    const before = enrollmentSnapshot(current);

    if (data.guardianId !== undefined) current.guardianId = data.guardianId;
    if (data.rosterNumber !== undefined) current.rosterNumber = data.rosterNumber;
    if (data.studentPhone !== undefined) current.studentPhone = data.studentPhone;
    if (data.studentEmail !== undefined) current.studentEmail = data.studentEmail;
    if (data.isActive !== undefined) current.isActive = data.isActive;

    const after = enrollmentSnapshot(current);

    await em.save(current);

    // An edit that leaves the snapshot as it was leaves no audit trail: the
    // event says what changed, and nothing changed.
    if (enrollmentChanged(before, after)) {
      await recordEvents(em, [{
        institutionId,
        eventType: 'EnrollmentUpdated',
        entityType: 'enrollment',
        entityId: id,
        actorUserId,
        payload: { before, after },
      }]);
    }

    return current;
  });
}

export async function remove(institutionId: number, courseIds: number[] | null, id: number, actorUserId: number | null = null) {
  await findById(institutionId, courseIds, id);
  // The row is read and written through the transaction's manager, so the
  // audit event and the delete share one fate: a failing event insert rolls
  // the delete back. The row lock serializes concurrent deletes and keeps the
  // snapshot in step with the state the delete removed.
  await AppDataSource.transaction(async (em) => {
    const current = await em.findOne(Enrollment, {
      where: { id, institutionId, deletedAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    if (!current) throw Object.assign(new Error('Enrollment not found'), { status: 404 });

    // Checked under the row lock: a withdrawal committed before the lock is
    // seen here, so the delete and its event never land on a withdrawn
    // enrollment. A rejection throws, rolling the transaction back.
    await assertEnrollmentNotWithdrawn(id, em);

    const before = enrollmentSnapshot(current);

    await cascadeSoftDeleteEnrollment(em, id);

    await recordEvents(em, [{
      institutionId,
      eventType: 'EnrollmentDeleted',
      entityType: 'enrollment',
      entityId: id,
      actorUserId,
      payload: { before, after: null },
    }]);
  });
}
