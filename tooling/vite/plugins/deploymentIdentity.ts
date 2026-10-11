import type { Plugin } from 'vite';

/** Adds the already resolved deployment SHA to the document head. */
export function deploymentIdentityPlugin(commitSha: string) {
  return {
    name: 'inject-deployment-identity',
    apply: 'build',
    transformIndexHtml(html: string) {
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: { name: 'lolrogue-commit', content: commitSha },
            injectTo: 'head' as const,
          },
        ],
      };
    },
  } satisfies Plugin;
}
