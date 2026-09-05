import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { moduleGuard } from './core/guards/module.guard';

const placeholder = (title: string) => ({
  loadComponent: () => import('./shared/components/placeholder/placeholder.component').then(m => m.PlaceholderComponent),
  data: { title },
});

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: '',
    loadComponent: () => import('./shared/layout/layout.component').then(m => m.LayoutComponent),
    canActivate: [authGuard],
    children: [
      // 'home' has no moduleGuard: it's the fallback for users without access to any module
      { path: 'home', loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent) },

      // Students section
      {
        path: 'students',
        children: [
          { path: 'manage',  loadComponent: () => import('./features/students/student-management.component').then(m => m.StudentManagementComponent), canActivate: [moduleGuard], data: { module: 'students' } },
          { path: 'history', loadComponent: () => import('./features/students/student-history.component').then(m => m.StudentHistoryComponent), canActivate: [moduleGuard], data: { module: 'students' } },
          { path: '',        redirectTo: 'manage', pathMatch: 'full' },
        ],
      },

      // Inspectors section
      {
        path: 'inspectors',
        children: [
          { path: 'dashboard',      loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent), canActivate: [moduleGuard], data: { module: 'dashboard' } },
          { path: 'absences',       loadComponent: () => import('./features/absences/absences.component').then(m => m.AbsencesComponent), canActivate: [moduleGuard], data: { module: 'absences' } },
          { path: 'absences/edit/:id', loadComponent: () => import('./features/absences/absence-edit.component').then(m => m.AbsenceEditComponent), canActivate: [moduleGuard], data: { module: 'absences' } },
          { path: 'justifications', loadComponent: () => import('./features/justifications/justifications.component').then(m => m.JustificationsComponent), canActivate: [moduleGuard], data: { module: 'justifications' } },
          { path: 'student-report', loadComponent: () => import('./features/student-report/student-report.component').then(m => m.StudentReportComponent), canActivate: [moduleGuard], data: { module: 'student-report' } },
          { path: 'citations',      loadComponent: () => import('./features/citations/citations.component').then(m => m.CitationsComponent), canActivate: [moduleGuard], data: { module: 'citations' } },
          { path: '',               redirectTo: 'dashboard', pathMatch: 'full' },
        ],
      },

      // Teachers section (all placeholder)
      {
        path: 'teachers',
        children: [
          { path: 'dashboard', ...placeholder('Dashboard de profesores') },
          { path: 'absences',  ...placeholder('Manejo de faltas y atrasos') },
          { path: 'grades',    ...placeholder('Calificaciones') },
          { path: 'citations', ...placeholder('Manejo de citaciones') },
          { path: 'news',      ...placeholder('Ingreso de novedades') },
          { path: '',          redirectTo: 'dashboard', pathMatch: 'full' },
        ],
      },

      // Single-route sections
      { path: 'calendar', loadComponent: () => import('./features/calendar/calendar.component').then(m => m.CalendarComponent), canActivate: [moduleGuard], data: { module: 'calendar' } },
      { path: 'admin',    loadComponent: () => import('./features/admin/admin.component').then(m => m.AdminComponent), canActivate: [moduleGuard], data: { module: 'admin' } },

      // Backward-compat redirects
      { path: 'inicio',         redirectTo: 'home',                       pathMatch: 'full' },
      { path: 'dashboard',      redirectTo: 'inspectors/dashboard',        pathMatch: 'full' },
      { path: 'absences',       redirectTo: 'inspectors/absences',         pathMatch: 'full' },
      { path: 'justifications', redirectTo: 'inspectors/justifications',   pathMatch: 'full' },
      { path: 'enrollments',           redirectTo: 'students/manage',      pathMatch: 'full' },
      { path: 'students/list',         redirectTo: 'students/manage',      pathMatch: 'full' },
      { path: 'students/enrollments',  redirectTo: 'students/manage',      pathMatch: 'full' },

      { path: '', redirectTo: 'home', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'home' },
];
