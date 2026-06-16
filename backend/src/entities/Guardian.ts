import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('guardians')
export class Guardian {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'name', type: 'varchar' })
  name!: string;

  @Column({ name: 'id_number', type: 'varchar', nullable: true })
  idNumber!: string | null;

  @Column({ name: 'phone', type: 'varchar', nullable: true })
  phone!: string | null;

  @Column({ name: 'whatsapp_link', nullable: true, type: 'varchar' })
  whatsappLink!: string | null;

  @Column({ nullable: true, type: 'varchar' })
  email!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
