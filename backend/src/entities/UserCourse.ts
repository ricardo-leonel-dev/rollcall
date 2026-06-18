import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity('user_courses')
@Unique(['userId', 'courseId'])
export class UserCourse {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id', type: 'integer' })
  userId!: number;

  @Column({ name: 'course_id', type: 'integer' })
  courseId!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
