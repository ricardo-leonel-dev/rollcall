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

export interface JustificationAttachment {
  id: number;
  fileName: string;
  originalName: string;
  mimeType: string;
  url: string;
  createdAt: string;
}

export interface Justification {
  id: number;
  enrollmentId: number;
  reason: string;
  notifiedBy: string | null;
  isActive: boolean;
  absenceIds: number[];
  attachments: JustificationAttachment[];
  createdAt: string;
  studentName?: string;
  courseName?: string;
  courseId?: number;
  academicYearId?: number;
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
    courseId: number;
    course: string;
    totalAbsences: number;
    totalTardies: number;
    totalJustified: number;
    breakdown: { date: string; type: 'F' | 'AT'; isJustified: boolean }[];
  }[];
  byCourse: { course: string; totalAbsences: number; totalTardies: number }[];
  absencesByDay: { date: string; count: number }[];
}

export interface InstitutionBranding {
  id: number;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
}

export interface User {
  id: number;
  username: string;
  fullName: string | null;
  email: string | null;
  roleId: number | null;
  roleName: string | null;
  institutionId: number | null;
  avatarUrl: string | null;
  isActive: boolean;
  courseIds?: number[];
  moduleKeys?: string[] | null;
  institution?: InstitutionBranding | null;
}

export interface Institution extends InstitutionBranding {
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
    avatarUrl: string | null;
    institution?: InstitutionBranding | null;
    moduleKeys?: string[] | null;
  };
}

export interface OcrResult {
  date: string;
  records_created: number;
  not_found: string[];
  total_in_photo: number;
}

export interface VoiceAbsenceResult {
  transcription: string;
  enrollmentId:  number;
  studentName:   string;
  type:          'F' | 'AT';
  dateFrom:      string;
  dateTo:        string;
  confidence:    number;
}
