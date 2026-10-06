import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity('citation_citation_reasons')
@Unique(['citationId', 'citationReasonId'])
export class CitationCitationReason {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'citation_id', type: 'integer' })
  citationId!: number;

  @Column({ name: 'citation_reason_id', type: 'integer' })
  citationReasonId!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
