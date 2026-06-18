export interface AcademicYear {
  id: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
}

export interface Course {
  id: number;
  name: string;
  shift: string;
  isActive: boolean;
}

export interface CourseAcademicYear {
  id: number;
  courseId: number;
  academicYearId: number;
  teacher: string | null;
  isActive: boolean;
}

export interface Guardian {
  id: number;
  name: string;
  idNumber: string | null;
  phone: string | null;
  whatsappLink: string | null;
  email: string | null;
  isActive: boolean;
}

export interface Student {
  id: number;
  idNumber: string | null;
  name: string;
  gender: string | null;
  birthDate: string | null;
  isActive: boolean;
}

export interface Enrollment {
  enrollmentId: number;
  academicYearId: number;
  academicYear: string;
  courseId: number;
  course: string;
  teacher: string | null;
  studentId: number;
  rosterNumber: number | null;
  idNumber: string | null;
  fullName: string;
  gender: string | null;
  birthDate: string | null;
  age: number | null;
  isEnrolled: boolean;
  studentPhone: string | null;
  studentEmail: string | null;
  guardianId: number | null;
  guardianName: string | null;
  guardianPhone: string | null;
  whatsappLink: string | null;
  guardianEmail: string | null;
  guardianIdNumber: string | null;
  isActive: boolean;
}

export interface Absence {
  id: number;
  enrollmentId: number;
  date: string;
  type: 'F' | 'AT';
  notes: string | null;
  photoSource: string | null;
  isJustified: boolean;
  isActive: boolean;
  studentName: string;
  rosterNumber: number | null;
  course: string;
  academicYear: string;
  guardianPhone: string | null;
  whatsappLink: string | null;
}

export interface Justification {
  id: number;
  enrollmentId: number;
  reason: string;
  notifiedBy: string | null;
  isActive: boolean;
  absenceIds: number[];
  createdAt: string;
}

export interface DashboardSummary {
  totalAbsences: number;
  totalTardies: number;
  justifiedCount: number;
  unjustifiedCount: number;
  justifiedPercent: number;
  topStudents: {
    studentName: string;
    rosterNumber: number | null;
    course: string;
    totalAbsences: number;
    totalTardies: number;
  }[];
  absencesByDay: { date: string; count: number }[];
}

export interface User {
  id: number;
  username: string;
  fullName: string | null;
  email: string | null;
  roleId: number | null;
  roleName: string | null;
  institutionId: number | null;
  isActive: boolean;
}

export interface Institution {
  id: number;
  name: string;
  isActive: boolean;
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface RolePermission {
  id: number;
  roleId: number;
  resource: string;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export interface AuthResponse {
  token: string;
  user: {
    id: number;
    username: string;
    fullName: string | null;
    email: string | null;
    roleName: string | null;
    roleId: number | null;
    institutionId: number | null;
  };
}

export interface OcrResult {
  date: string;
  records_created: number;
  not_found: string[];
  total_in_photo: number;
}
