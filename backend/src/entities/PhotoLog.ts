import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('photo_logs')
export class PhotoLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ nullable: true, type: 'varchar' })
  filename!: string | null;

  @Column({ name: 'list_date', type: 'date', nullable: true })
  listDate!: string | null;

  @Column({ name: 'course_id', nullable: true, type: 'integer' })
  courseId!: number | null;

  @Column({ name: 'academic_year_id', nullable: true, type: 'integer' })
  academicYearId!: number | null;

  @Column({ name: 'records_created', default: 0, type: 'integer' })
  recordsCreated!: number;

  @Column({ name: 'records_not_found', type: 'text', array: true, nullable: true })
  recordsNotFound!: string[] | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
