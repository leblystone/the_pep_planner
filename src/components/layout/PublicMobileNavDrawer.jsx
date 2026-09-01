import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { BookOpen, Desktop } from '@phosphor-icons/react';
import { APP_LINKS, PAPER_PLANNER_LINKS } from '../../config/publicNavConfig';

export { APP_LINKS, PAPER_PLANNER_LINKS };

const linkClass =
  'public-mobile-nav-link block px-3 py-2.5 text-sm font-bold tracking-[0.12em] uppercase rounded-lg';

/**
 * Mobile slide-out nav — The App + Paper Planners (flat sections, no cards).
 */
export default function PublicMobileNavDrawer({ open, onClose, theme }) {
  const navigate = useNavigate();

  return (
    <>
      <div
        className="fixed top-16 inset-x-0 bottom-0 z-[103] lg:hidden transition-opacity duration-300"
        style={{
          backgroundColor: 'rgba(0,0,0,0.35)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
        onClick={onClose}
        aria-hidden="true"
      />
      <DrawerPanel open={open} theme={theme} onClose={onClose} navigate={navigate} />
    </>
  );
}

function DrawerPanel({ open, theme, onClose, navigate }) {
  const { pathname } = useLocation();
  const onShop = pathname.startsWith('/shop');

  return (
    <div
      className="public-mobile-nav fixed top-16 left-0 bottom-0 z-[104] lg:hidden flex flex-col"
      style={{
        width: 280,
        backgroundColor: '#FFFFFF',
        boxShadow: '4px 0 24px rgba(0,0,0,0.1)',
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: open ? 'auto' : 'none',
        ['--nav-primary']: theme.primary,
      }}
    >
      <style>{`
        .public-mobile-nav .public-mobile-nav-link {
          transition: transform 0.18s cubic-bezier(0.4, 0, 0.2, 1),
                      background-color 0.18s ease,
                      color 0.18s ease;
        }
        @media (hover: hover) {
          .public-mobile-nav .public-mobile-nav-link:hover {
            transform: translateX(4px);
            background-color: color-mix(in srgb, var(--nav-primary) 14%, transparent) !important;
            color: var(--nav-primary) !important;
          }
        }
        .public-mobile-nav .public-mobile-nav-link:active {
          transform: translateX(2px) scale(0.98);
        }
        .public-mobile-nav .public-mobile-nav-btn {
          transition: transform 0.18s cubic-bezier(0.4, 0, 0.2, 1),
                      box-shadow 0.18s ease,
                      filter 0.18s ease;
        }
        @media (hover: hover) {
          .public-mobile-nav .public-mobile-nav-btn:hover {
            transform: translateY(-1px);
            filter: brightness(1.04);
          }
        }
        .public-mobile-nav .public-mobile-nav-btn:active {
          transform: translateY(0) scale(0.98);
        }
      `}</style>

      <nav className="flex-1 overflow-y-auto py-6 px-4">
        <ProductNavSection
          theme={theme}
          active={!onShop}
          Icon={Desktop}
          title="The App"
          links={APP_LINKS}
          onClose={onClose}
        />

        <div
          className="my-7"
          style={{ height: 1, backgroundColor: `${theme.text}12` }}
          aria-hidden="true"
        />

        <ProductNavSection
          theme={theme}
          active={onShop}
          Icon={BookOpen}
          title="Paper Planners"
          links={PAPER_PLANNER_LINKS}
          onClose={onClose}
        />
      </nav>

      <div className="px-4 py-4 border-t flex gap-2.5" style={{ borderColor: theme.border }}>
        <button
          type="button"
          onClick={() => {
            onClose();
            navigate('/login?trial=true');
          }}
          className="public-mobile-nav-btn flex-1 py-3 rounded-lg text-xs font-bold tracking-[0.12em] uppercase text-white"
          style={{
            backgroundColor: theme.primary,
            boxShadow: '0 2px 8px rgba(95,127,118,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
          }}
        >
          Sign Up
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            navigate('/login');
          }}
          className="public-mobile-nav-btn flex-1 py-3 rounded-lg text-xs font-bold tracking-[0.12em] uppercase border"
          style={{
            color: theme.primary,
            borderColor: theme.primary,
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}
        >
          Log In
        </button>
      </div>
    </div>
  );
}

function ProductNavSection({ theme, active, Icon, title, links, onClose }) {
  const { pathname } = useLocation();

  return (
    <div>
      <div className="flex items-center gap-2.5 px-3 mb-3">
        <Icon
          size={18}
          weight="duotone"
          style={{ color: active ? theme.primary : theme.textLight, flexShrink: 0 }}
          aria-hidden
        />
        <div className="min-w-0">
          <p
            className="text-[15px] font-bold leading-tight tracking-[0.06em]"
            style={{
              color: active ? theme.text : theme.textLight,
              fontFamily: 'Poppins, system-ui, sans-serif',
            }}
          >
            {title}
          </p>
          <div
            className="mt-2"
            style={{
              width: 28,
              height: 1.5,
              borderRadius: 1,
              backgroundColor: theme.primary,
              opacity: active ? 0.7 : 0.35,
            }}
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="space-y-0.5">
        {links.map(({ path, label }) => {
          const isCurrent =
            path === '/'
              ? pathname === '/'
              : path === '/shop'
                ? pathname === '/shop'
                : pathname === path || pathname.startsWith(`${path}/`);
          return (
            <Link
              key={path}
              to={path}
              onClick={onClose}
              className={linkClass}
              style={{
                color: isCurrent ? theme.primary : theme.text,
                backgroundColor: isCurrent ? `${theme.primary}18` : 'transparent',
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
