import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('citations')
export class Citation {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'institution_id', type: 'integer' })
  institutionId!: number;

  @Column({ name: 'enrollment_id', type: 'integer' })
  enrollmentId!: number;

  @Column({ name: 'date_from', type: 'date' })
  dateFrom!: string;

  @Column({ name: 'date_to', type: 'date' })
  dateTo!: string;

  @Column({ name: 'time', type: 'time', nullable: true })
  time!: string | null;

  @Column({ type: 'varchar' })
  status!: 'pending' | 'closed';

  @Column({ type: 'text', nullable: true })
  observations!: string | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt!: Date | null;

  @Column({ name: 'closed_by_user_id', type: 'integer', nullable: true })
  closedByUserId!: number | null;

  @Column({ name: 'created_by_user_id', type: 'integer', nullable: true })
  createdByUserId!: number | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
