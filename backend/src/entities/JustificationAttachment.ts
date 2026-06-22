import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('justification_attachments')
export class JustificationAttachment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'justification_id', type: 'integer' })
  justificationId!: number;

  @Column({ name: 'file_name', type: 'varchar' })
  fileName!: string;

  @Column({ name: 'original_name', type: 'varchar' })
  originalName!: string;

  @Column({ name: 'mime_type', type: 'varchar' })
  mimeType!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
