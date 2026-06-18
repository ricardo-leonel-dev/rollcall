import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('institutions')
export class Institution {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true, type: 'varchar', length: 200 })
  name!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'logo_url', type: 'varchar', length: 500, nullable: true })
  logoUrl!: string | null;

  @Column({ name: 'primary_color', type: 'varchar', length: 7, nullable: true })
  primaryColor!: string | null;

  @Column({ name: 'secondary_color', type: 'varchar', length: 7, nullable: true })
  secondaryColor!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
