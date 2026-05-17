import madge from 'madge'

const RULES: Array<{ from: RegExp; forbids: RegExp[]; label: string }> = [
  {
    label: 'domain must not import from project',
    from: /^domain\//,
    forbids: [/^application\//, /^adapters\//, /^infrastructure\//],
  },
  {
    label: 'application must not import adapters',
    from: /^application\//,
    forbids: [/^adapters\//],
  },
  {
    label: 'application must not import infrastructure (including infrastructure/database)',
    from: /^application\//,
    forbids: [/^infrastructure\//],
  },
  {
    // Adapters may import infrastructure/database (Prisma/Neo4j clients) but
    // must not import HTTP-specific infrastructure (routes, plugins, hooks).
    label: 'adapters must not import infrastructure/http',
    from: /^adapters\//,
    forbids: [/^infrastructure\/http\//],
  },
]

async function main() {
  const res = await madge('src/', { fileExtensions: ['ts'] })
  const graph = res.obj()
  const violations: string[] = []

  for (const [file, deps] of Object.entries(graph)) {
    for (const rule of RULES) {
      if (rule.from.test(file)) {
        for (const dep of deps) {
          for (const forbidden of rule.forbids) {
            if (forbidden.test(dep)) {
              violations.push(`VIOLATION [${rule.label}]: ${file} → ${dep}`)
            }
          }
        }
      }
    }
  }

  if (violations.length > 0) {
    violations.forEach((v) => console.error(v))
    process.exit(1)
  }
  console.log('Dependency rule: OK')
}

main()
