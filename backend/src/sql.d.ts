/** wrangler bundles .sql files as text (see [[rules]] in wrangler.toml). */
declare module '*.sql' {
  const sql: string;
  export default sql;
}
