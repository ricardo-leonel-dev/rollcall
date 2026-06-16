import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';

@Entity('absences')
@Unique(['enrollmentId', 'date'])
export class Absence {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'enrollment_id', type: 'integer' })
  enrollmentId!: number;

  @Column({ name: 'date', type: 'date' })
  date!: string;

  @Column({ name: 'type', length: 5 })
  type!: 'A' | 'AT';

  @Column({ name: 'notes', type: 'varchar', nullable: true })
  notes!: string | null;

  @Column({ name: 'photo_source', type: 'varchar', nullable: true })
  photoSource!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
