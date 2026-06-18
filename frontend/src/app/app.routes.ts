import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { moduleGuard } from './core/guards/module.guard';

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
      // 'inicio' has no moduleGuard on purpose: it's the fallback redirect
      // target for users without access to a module, so it must always
      // be reachable (otherwise a fully-restricted user would loop).
      { path: 'inicio',         loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent) },
      { path: 'dashboard',      loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent), canActivate: [moduleGuard], data: { module: 'dashboard' } },
      { path: 'absences',       loadComponent: () => import('./features/absences/absences.component').then(m => m.AbsencesComponent), canActivate: [moduleGuard], data: { module: 'absences' } },
      { path: 'calendar',       loadComponent: () => import('./features/calendar/calendar.component').then(m => m.CalendarComponent), canActivate: [moduleGuard], data: { module: 'calendar' } },
      { path: 'justifications', loadComponent: () => import('./features/justifications/justifications.component').then(m => m.JustificationsComponent), canActivate: [moduleGuard], data: { module: 'justifications' } },
      { path: 'students',       loadComponent: () => import('./features/students/students.component').then(m => m.StudentsComponent), canActivate: [moduleGuard], data: { module: 'students' } },
      { path: 'enrollments',    loadComponent: () => import('./features/enrollments/enrollments.component').then(m => m.EnrollmentsComponent), canActivate: [moduleGuard], data: { module: 'enrollments' } },
      { path: 'admin',          loadComponent: () => import('./features/admin/admin.component').then(m => m.AdminComponent), canActivate: [moduleGuard], data: { module: 'admin' } },
      { path: '', redirectTo: 'inicio', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'inicio' },
];
