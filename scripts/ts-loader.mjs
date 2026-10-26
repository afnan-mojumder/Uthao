export async function resolve(specifier, context, nextResolve) {
  let resolved;
  try {
    resolved = await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      for (const suffix of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
        try {
          resolved = await nextResolve(specifier + suffix, context);
          break;
        } catch {
          // continue
        }
      }
    }
    if (!resolved) throw err;
  }

  if (resolved.url.endsWith('.json')) {
    return {
      ...resolved,
      importAttributes: {
        ...context.importAttributes,
        type: 'json',
      },
    };
  }
  return resolved;
}
