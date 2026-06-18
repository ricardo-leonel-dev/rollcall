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
import { Institution } from './entities/Institution';
import { UserCourse } from './entities/UserCourse';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  schema: process.env.DB_SCHEMA || 'attendance',
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
    Institution,
    UserCourse,
  ],
  migrations: [],
  subscribers: [],
});
