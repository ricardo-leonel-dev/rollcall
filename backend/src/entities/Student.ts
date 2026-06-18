import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('students')
export class Student {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'id_number', type: 'varchar', nullable: true })
  idNumber!: string | null;

  @Column({ name: 'name', type: 'varchar' })
  name!: string;

  @Column({ name: 'institution_id', type: 'integer' })
  institutionId!: number;

  @Column({ name: 'gender', type: 'char', length: 1, nullable: true })
  gender!: string | null;

  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birthDate!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
