export type SidebarIconName =
  | 'dashboard'
  | 'funnel'
  | 'analytics'
  | 'comparison'
  | 'contacts'
  | 'email'
  | 'templates';

export interface SidebarNavigationItem {
  text: string;
  icon: SidebarIconName;
  path: string;
}

export interface SidebarNavigationSection {
  title: string;
  items: readonly SidebarNavigationItem[];
}

export const sidebarSections = [
  {
    title: 'Impact intelligence',
    items: [
      { text: 'Dashboard', icon: 'dashboard', path: '/dashboard' },
      { text: 'New Comer Funnel', icon: 'funnel', path: '/funnel' },
      { text: 'Analytics', icon: 'analytics', path: '/analytics' },
      { text: 'Comparison', icon: 'comparison', path: '/comparison' },
      { text: 'Contacts', icon: 'contacts', path: '/contact-search' },
    ],
  },
  {
    title: 'Email Marketing',
    items: [
      { text: 'Email campaigns', icon: 'email', path: '/email-sender' },
      { text: 'Templates', icon: 'templates', path: '/templates' },
    ],
  },
] as const satisfies readonly SidebarNavigationSection[];
