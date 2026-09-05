import { CanDeactivateFn } from '@angular/router';
import { ProfileComponent } from '../../features/profile/profile.component';

export const profileCanDeactivateGuard: CanDeactivateFn<ProfileComponent> = (component) => {
  return component.canDeactivate();
};