import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity('justification_absences')
@Unique(['justificationId', 'absenceId'])
export class JustificationAbsence {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'justification_id', type: 'integer' })
  justificationId!: number;

  @Column({ name: 'absence_id', type: 'integer' })
  absenceId!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
