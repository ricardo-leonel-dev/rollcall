export interface NavItem {
  key: string;
  route: string;
  icon: string;
  label: string;
  section: 'main' | 'mgmt';
  description: string;
}

// Single source of truth for the app's navigable modules — used by the
// sidebar, the "Inicio" launcher, the per-user module permission UI in
// Admin, and the module route guard. `key` matches the route path and the
// module_key stored in user_modules.
export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard',      route: '/dashboard',      icon: 'dashboard',            label: 'Dashboard',       section: 'main', description: 'Resumen de asistencia, indicadores y top de inasistencias.' },
  { key: 'absences',       route: '/absences',       icon: 'event_busy',           label: 'Inasistencias',   section: 'main', description: 'Marcar faltas y atrasos por estudiante y rango de fechas.' },
  { key: 'calendar',       route: '/calendar',       icon: 'calendar_month',       label: 'Calendario',      section: 'main', description: 'Vista mensual de inasistencias por curso.' },
  { key: 'justifications', route: '/justifications', icon: 'task_alt',             label: 'Justificaciones', section: 'main', description: 'Crear y revisar justificaciones de inasistencias.' },
  { key: 'students',       route: '/students',       icon: 'groups',               label: 'Estudiantes',     section: 'mgmt', description: 'Datos de estudiantes y sus representantes.' },
  { key: 'enrollments',    route: '/enrollments',    icon: 'assignment_ind',       label: 'Matrículas',      section: 'mgmt', description: 'Matricular estudiantes a cursos y años lectivos.' },
  { key: 'admin',          route: '/admin',          icon: 'admin_panel_settings', label: 'Administración',  section: 'mgmt', description: 'Usuarios, cursos, años lectivos, permisos e instituciones.' },
];
