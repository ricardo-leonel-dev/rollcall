import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';

@Entity('role_permissions')
@Unique(['roleId', 'resource'])
export class RolePermission {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'role_id', type: 'integer' })
  roleId!: number;

  @Column({ length: 100, type: 'varchar' })
  resource!: string;

  @Column({ name: 'can_read', default: false })
  canRead!: boolean;

  @Column({ name: 'can_create', default: false })
  canCreate!: boolean;

  @Column({ name: 'can_update', default: false })
  canUpdate!: boolean;

  @Column({ name: 'can_delete', default: false })
  canDelete!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
