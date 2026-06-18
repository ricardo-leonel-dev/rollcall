import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity('user_modules')
@Unique(['userId', 'moduleKey'])
export class UserModule {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id', type: 'integer' })
  userId!: number;

  @Column({ name: 'module_key', type: 'varchar', length: 50 })
  moduleKey!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
