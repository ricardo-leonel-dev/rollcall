import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('citation_attachments')
export class CitationAttachment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'citation_id', type: 'integer' })
  citationId!: number;

  @Column({ name: 'file_name', type: 'varchar' })
  fileName!: string;

  @Column({ name: 'original_name', type: 'varchar' })
  originalName!: string;

  @Column({ name: 'mime_type', type: 'varchar' })
  mimeType!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
