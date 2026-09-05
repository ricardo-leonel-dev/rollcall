export interface SubNavItem {
  route: string;
  icon: string;
  label: string;
  moduleKey?: string;
  placeholder?: boolean;
  superAdminOnly?: boolean;
  queryParams?: Record<string, string>;
}

export interface SectionItem {
  key: string;
  icon: string;
  label: string;
  description: string;
  subnav: SubNavItem[];
}

export const SECTIONS: SectionItem[] = [
  {
    key: 'students',
    icon: 'groups',
    label: 'Estudiantes',
    description: 'Perfil académico, datos personales y seguimiento integral de cada estudiante.',
    subnav: [
      { route: '/students/manage',  icon: 'groups',  label: 'Administración de estudiantes', moduleKey: 'students' },
      { route: '/students/history', icon: 'history', label: 'Historial',                     moduleKey: 'students' },
    ],
  },
  {
    key: 'inspectors',
    icon: 'manage_search',
    label: 'Inspectoría',
    description: 'Control de inasistencias, justificaciones y citaciones de estudiantes.',
    subnav: [
      { route: '/inspectors/dashboard',      icon: 'dashboard',  label: 'Dashboard',                        moduleKey: 'dashboard' },
      { route: '/inspectors/absences',       icon: 'event_busy', label: 'Administración de faltas',         moduleKey: 'absences' },
      { route: '/inspectors/justifications', icon: 'task_alt',   label: 'Administración de justificaciones', moduleKey: 'justifications' },
      { route: '/inspectors/student-report',  icon: 'summarize',  label: 'Informe estudiantil',              moduleKey: 'student-report' },
      { route: '/inspectors/citations',      icon: 'campaign',   label: 'Administración de citaciones',     placeholder: true },
    ],
  },
  {
    key: 'teachers',
    icon: 'school',
    label: 'Profesores',
    description: 'Registro de asistencia, calificaciones, citaciones por docente y novedades del aula.',
    subnav: [
      { route: '/teachers/dashboard', icon: 'dashboard',            label: 'Dashboard',              placeholder: true },
      { route: '/teachers/absences',  icon: 'how_to_reg',           label: 'Manejo de faltas y atrasos', placeholder: true },
      { route: '/teachers/grades',    icon: 'grading',              label: 'Calificaciones',         placeholder: true },
      { route: '/teachers/citations', icon: 'campaign',             label: 'Manejo de citaciones',   placeholder: true },
      { route: '/teachers/news',      icon: 'notifications_active', label: 'Ingreso de novedades',   placeholder: true },
    ],
  },
  {
    key: 'calendar',
    icon: 'calendar_month',
    label: 'Calendario',
    description: 'Vista rápida de eventos, inasistencias, citaciones y justificaciones.',
    subnav: [
      { route: '/calendar', icon: 'calendar_month', label: 'Calendario', moduleKey: 'calendar' },
    ],
  },
  {
    key: 'admin',
    icon: 'admin_panel_settings',
    label: 'Administración',
    description: 'Usuarios, cursos, años lectivos, roles y configuración institucional.',
    subnav: [
      { route: '/admin', icon: 'manage_accounts', label: 'Usuarios',       moduleKey: 'admin', queryParams: { tab: 'users' } },
      { route: '/admin', icon: 'class',           label: 'Cursos',         moduleKey: 'admin', queryParams: { tab: 'courses' } },
      { route: '/admin', icon: 'calendar_today',  label: 'Años lectivos',  moduleKey: 'admin', queryParams: { tab: 'years' } },
      { route: '/admin', icon: 'security',        label: 'Permisos',       moduleKey: 'admin', queryParams: { tab: 'permissions' } },
      { route: '/admin', icon: 'rule',            label: 'Motivos de citación', moduleKey: 'admin', queryParams: { tab: 'citation-reasons' } },
      { route: '/admin', icon: 'upload_file',     label: 'Importar nómina', moduleKey: 'admin', queryParams: { tab: 'roster' } },
      { route: '/admin', icon: 'corporate_fare',  label: 'Instituciones',  moduleKey: 'admin', queryParams: { tab: 'institutions' }, superAdminOnly: true },
    ],
  },
];

export interface ModuleNode {
  key: string;
  label: string;
  children?: ModuleNode[];
}

// Hierarchical module tree for the permission dialog.
export const MODULE_TREE: ModuleNode[] = [
  {
    key: 'dashboard',
    label: 'Dashboard (Inspectoría)',
  },
  {
    key: 'absences',
    label: 'Inasistencias',
    children: [
      { key: 'absences:manual', label: 'Entrada manual' },
      { key: 'absences:voice',  label: 'Reconocimiento de voz' },
      { key: 'absences:photo',  label: 'OCR por foto' },
    ],
  },
  {
    key: 'justifications',
    label: 'Justificaciones',
  },
  {
    key: 'student-report',
    label: 'Informe estudiantil',
  },
  {
    key: 'students',
    label: 'Estudiantes',
  },
  {
    key: 'calendar',
    label: 'Calendario',
  },
  {
    key: 'admin',
    label: 'Administración',
    children: [
      { key: 'admin:users',       label: 'Usuarios' },
      { key: 'admin:courses',     label: 'Cursos' },
      { key: 'admin:years',       label: 'Años lectivos' },
      { key: 'admin:permissions', label: 'Permisos de rol' },
      { key: 'admin:citation-reasons', label: 'Motivos de citación' },
      { key: 'admin:roster',      label: 'Importar nómina' },
    ],
  },
];

// Flat list of module keys for legacy use (module selector dropdown)
export const MODULE_KEYS: { key: string; label: string }[] = [
  { key: 'dashboard',             label: 'Dashboard (Inspectoría)' },
  { key: 'absences',              label: 'Inasistencias' },
  { key: 'absences:manual',       label: '↳ Entrada manual' },
  { key: 'absences:voice',        label: '↳ Voz' },
  { key: 'absences:photo',        label: '↳ Foto OCR' },
  { key: 'justifications',        label: 'Justificaciones' },
  { key: 'student-report',        label: 'Informe estudiantil' },
  { key: 'students',              label: 'Estudiantes' },
  { key: 'calendar',              label: 'Calendario' },
  { key: 'admin',                 label: 'Administración' },
  { key: 'admin:users',           label: '↳ Usuarios' },
  { key: 'admin:courses',         label: '↳ Cursos' },
  { key: 'admin:years',           label: '↳ Años lectivos' },
  { key: 'admin:permissions',     label: '↳ Permisos de rol' },
  { key: 'admin:citation-reasons', label: '↳ Motivos de citación' },
  { key: 'admin:roster',          label: '↳ Importar nómina' },
];
