import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';

@Entity('enrollments')
@Unique(['studentId', 'courseId', 'academicYearId'])
export class Enrollment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'student_id', type: 'integer' })
  studentId!: number;

  @Column({ name: 'course_id', type: 'integer' })
  courseId!: number;

  @Column({ name: 'academic_year_id', type: 'integer' })
  academicYearId!: number;

  @Column({ name: 'institution_id', type: 'integer' })
  institutionId!: number;

  @Column({ name: 'guardian_id', nullable: true, type: 'integer' })
  guardianId!: number | null;

  @Column({ name: 'roster_number', nullable: true, type: 'integer' })
  rosterNumber!: number | null;

  @Column({ name: 'is_enrolled', default: true })
  isEnrolled!: boolean;

  @Column({ name: 'student_phone', type: 'varchar', nullable: true })
  studentPhone!: string | null;

  @Column({ name: 'student_email', type: 'varchar', nullable: true })
  studentEmail!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
