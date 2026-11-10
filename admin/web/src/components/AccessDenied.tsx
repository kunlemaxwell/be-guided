import { Link } from 'react-router-dom';

/** Shown when the signed-in person's role does not allow a screen (403). */
export function AccessDenied({ what = 'this screen' }: { what?: string }) {
  return (
    <div className="state state--error" role="alert">
      <h2>You don’t have access to {what}.</h2>
      <p>Your role doesn’t include it. Ask an owner to change your role in Settings › People if you need it.</p>
      <Link className="btn" to="/pages">
        Go to pages
      </Link>
    </div>
  );
}
