import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';

/** Shown when a screen crashes, so the owner can carry on. */
export function ErrorFallback() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  if (!notFound) console.error('[admin] screen error', error instanceof Error ? error.message : error);
  return (
    <div className="state state--error" role="alert">
      <h2>{notFound ? 'This screen does not exist.' : 'This screen ran into a problem.'}</h2>
      <p>{notFound ? 'Use the menu to find what you need.' : 'Nothing was lost. Go back to the pages list and try again.'}</p>
      <Link className="btn" to="/pages">
        Go to pages
      </Link>
    </div>
  );
}
