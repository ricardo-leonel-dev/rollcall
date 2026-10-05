import { Entity, PrimaryColumn, Column } from 'typeorm';

export interface MessageTemplatePlaceholder {
  key: string;
  label: string;
}

@Entity('message_template_actions')
export class MessageTemplateAction {
  @PrimaryColumn({ name: 'action_key', type: 'varchar', length: 50 })
  actionKey!: string;

  @Column({ type: 'varchar', length: 100 })
  label!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  placeholders!: MessageTemplatePlaceholder[];

  @Column({ name: 'default_template', type: 'text' })
  defaultTemplate!: string;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number;

  @Column({ type: 'boolean', default: true })
  active!: boolean;
}