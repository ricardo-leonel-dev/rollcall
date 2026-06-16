import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('justifications')
export class Justification {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'enrollment_id', type: 'integer' })
  enrollmentId!: number;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ name: 'notified_by', nullable: true, type: 'varchar' })
  notifiedBy!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
