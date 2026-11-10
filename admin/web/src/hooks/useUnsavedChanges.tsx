import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { Dialog } from '../components/Dialog';

/**
 * Don't lose work: while `dirty`, leaving the screen (in-app link) asks
 * first, and closing or reloading the tab shows the browser's warning.
 * Render the returned element once on the screen.
 */
export function useUnsavedChanges(dirty: boolean, what = 'these changes') {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  return (
    <Dialog
      open={blocker.state === 'blocked'}
      title="Leave without saving?"
      onClose={() => blocker.reset?.()}
      footer={
        <>
          <button type="button" className="btn" onClick={() => blocker.reset?.()}>
            Stay here
          </button>
          <button type="button" className="btn btn--danger" onClick={() => blocker.proceed?.()}>
            Leave without saving
          </button>
        </>
      }
    >
      <p>You haven’t saved {what} yet. If you leave now, they are lost.</p>
    </Dialog>
  );
}
