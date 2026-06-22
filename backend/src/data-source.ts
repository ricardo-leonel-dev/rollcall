import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { AcademicYear } from './entities/AcademicYear';
import { Course } from './entities/Course';
import { CourseAcademicYear } from './entities/CourseAcademicYear';
import { Guardian } from './entities/Guardian';
import { Student } from './entities/Student';
import { Enrollment } from './entities/Enrollment';
import { Absence } from './entities/Absence';
import { PhotoLog } from './entities/PhotoLog';
import { Role } from './entities/Role';
import { RolePermission } from './entities/RolePermission';
import { User } from './entities/User';
import { Justification } from './entities/Justification';
import { JustificationAbsence } from './entities/JustificationAbsence';
import { JustificationAttachment } from './entities/JustificationAttachment';
import { Institution } from './entities/Institution';
import { UserCourse } from './entities/UserCourse';
import { UserModule } from './entities/UserModule';

const dbSchema = process.env.DB_SCHEMA || 'attendance';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  schema: dbSchema,
  // TypeORM only schema-qualifies queries built from entity metadata
  // (repositories/QueryBuilder) — raw AppDataSource.query() calls have no
  // metadata to qualify and rely entirely on the connection's search_path,
  // which Postgres defaults to "$user", public. Without this, every raw
  // query (dashboard, enrollment/absence/justification listings, etc.)
  // fails with "relation does not exist" on any non-public schema.
  extra: {
    options: `-c search_path=${dbSchema},public`,
  },
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
  entities: [
    AcademicYear,
    Course,
    CourseAcademicYear,
    Guardian,
    Student,
    Enrollment,
    Absence,
    PhotoLog,
    Role,
    RolePermission,
    User,
    Justification,
    JustificationAbsence,
    JustificationAttachment,
    Institution,
    UserCourse,
    UserModule,
  ],
  migrations: [],
  subscribers: [],
});
