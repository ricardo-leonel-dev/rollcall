import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('institutions')
export class Institution {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true, type: 'varchar', length: 200 })
  name!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
