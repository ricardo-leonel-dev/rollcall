import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';

@Entity('course_academic_years')
@Unique(['courseId', 'academicYearId'])
export class CourseAcademicYear {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'course_id', type: 'integer' })
  courseId!: number;

  @Column({ name: 'academic_year_id', type: 'integer' })
  academicYearId!: number;

  @Column({ name: 'teacher', type: 'varchar', nullable: true })
  teacher!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
