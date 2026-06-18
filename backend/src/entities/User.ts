import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true, length: 100, type: 'varchar' })
  username!: string;

  @Column({ name: 'password_hash', length: 255, type: 'varchar' })
  passwordHash!: string;

  @Column({ name: 'full_name', nullable: true, type: 'varchar' })
  fullName!: string | null;

  @Column({ nullable: true, type: 'varchar' })
  email!: string | null;

  @Column({ name: 'role_id', nullable: true, type: 'integer' })
  roleId!: number | null;

  @Column({ name: 'institution_id', nullable: true, type: 'integer' })
  institutionId!: number | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'notification_template', type: 'text', nullable: true })
  notificationTemplate!: string | null;

  @Column({ name: 'avatar_url', nullable: true, type: 'varchar', length: 500 })
  avatarUrl!: string | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
