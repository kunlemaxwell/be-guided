import { Suspense, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ROLE_LABEL } from '../../../shared/api-types';
import { useAuth } from '../auth/AuthProvider';
import { PublishButton } from '../features/publish/PublishButton';
import { readPref, writePref } from '../lib/storage';
import { SITE_URL } from '../lib/site';
import { Icon, type IconName } from './Icon';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/pages', label: 'Pages', icon: 'pages' },
  { to: '/products', label: 'Products', icon: 'products' },
  { to: '/requests', label: 'Updates & requests', icon: 'requests' },
  { to: '/automation', label: 'Automatic checks', icon: 'clock' },
  { to: '/feedback', label: 'Reader feedback', icon: 'thumb' },
  { to: '/audit', label: 'Audit log', icon: 'audit' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
  { to: '/components', label: 'Components', icon: 'components' },
];

/** Accessible name and tooltip of the sidebar's collapse button. */
export function sidebarToggleLabel(collapsed: boolean): string {
  return collapsed ? 'Expand sidebar' : 'Collapse sidebar';
}

/** Icon-only button at the top of the sidebar that collapses it to icons (and back). The tooltip shows on hover and keyboard focus. */
export function SidebarToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const label = sidebarToggleLabel(collapsed);
  return (
    <button type="button" className="icon-btn sidebar__toggle" aria-expanded={!collapsed} aria-controls="admin-menu" aria-label={label} data-tip={label} onClick={onToggle}>
      <Icon name={collapsed ? 'sidebarOpen' : 'sidebarClose'} />
    </button>
  );
}

/** Sidebar (collapsible to icons from the button at its top, remembered per browser) + top bar around every screen. */
export function Layout() {
  const { me } = useAuth();
  const [collapsed, setCollapsed] = useState(() => readPref('sidebar') === 'collapsed');
  const toggle = () =>
    setCollapsed((c) => {
      writePref('sidebar', c ? 'open' : 'collapsed');
      return !c;
    });

  return (
    <div className={`shell${collapsed ? ' shell--collapsed' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar" id="admin-menu" aria-label="Admin menu">
        <div className="sidebar__head">
          <div className="brand">
            <span className="brand__mark" aria-hidden="true">
              P
            </span>
            <span className="brand__text">
              <strong>Be Guided</strong>
              <small>Guide admin</small>
            </span>
          </div>
          <SidebarToggle collapsed={collapsed} onToggle={toggle} />
        </div>
        <nav aria-label="Main">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link${isActive ? ' nav-link--on' : ''}`}
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
            >
              <Icon name={item.icon} />
              <span className="nav-link__text">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__foot">
          <p className="sidebar__who">
            <span className="sidebar__avatar" aria-hidden="true">
              {me.displayName.slice(0, 1).toUpperCase()}
            </span>
            <span className="sidebar__who-text">
              <strong>{me.person ? me.person.name : 'No one chosen'}</strong>
              <small>{me.mode === 'local' ? (me.person ? 'Using this computer' : 'Choose in Settings') : ROLE_LABEL[me.role]}</small>
            </span>
          </p>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span className="topbar__note">{me.mode === 'local' ? 'Only on this computer' : `Signed in as ${me.displayName}`}</span>
          <div className="topbar__actions">
            <a className="btn btn--ghost" href={SITE_URL} target="_blank" rel="noreferrer">
              Open the site ↗
            </a>
            <PublishButton />
          </div>
        </header>
        <main className="content" id="main" tabIndex={-1}>
          <Suspense
            fallback={
              <div className="state state--loading" aria-busy="true">
                <span className="spinner" aria-hidden="true" />
                Loading…
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
