import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

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
      { path: 'dashboard',      loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'absences',       loadComponent: () => import('./features/absences/absences.component').then(m => m.AbsencesComponent) },
      { path: 'calendar',       loadComponent: () => import('./features/calendar/calendar.component').then(m => m.CalendarComponent) },
      { path: 'justifications', loadComponent: () => import('./features/justifications/justifications.component').then(m => m.JustificationsComponent) },
      { path: 'students',       loadComponent: () => import('./features/students/students.component').then(m => m.StudentsComponent) },
      { path: 'enrollments',    loadComponent: () => import('./features/enrollments/enrollments.component').then(m => m.EnrollmentsComponent) },
      { path: 'admin',          loadComponent: () => import('./features/admin/admin.component').then(m => m.AdminComponent) },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
