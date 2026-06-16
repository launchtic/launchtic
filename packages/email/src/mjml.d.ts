declare module "mjml" {
  const mjml2html: (mjml: string, opts?: Record<string, unknown>) => Promise<{ html: string; errors: unknown[] }>;
  export default mjml2html;
}
