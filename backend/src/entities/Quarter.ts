import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';

@Entity('quarters')
@Unique(['academicYearId', 'name'])
@Unique(['academicYearId', 'sequenceNumber'])
export class Quarter {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'academic_year_id', type: 'integer' })
  academicYearId!: number;

  @Column({ name: 'institution_id', type: 'integer' })
  institutionId!: number;

  @Column({ name: 'name', type: 'varchar' })
  name!: string;

  @Column({ name: 'sequence_number', type: 'smallint' })
  sequenceNumber!: number;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate!: string | null;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate!: string | null;

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
