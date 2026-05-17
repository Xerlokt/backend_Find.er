import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

describe('check-deps SCALE-03 rule', () => {
  it('check-deps.ts RULES array contains the infrastructure rule with label naming infrastructure', () => {
    const content = fs.readFileSync(path.join(__dirname, '../../scripts/check-deps.ts'), 'utf-8')
    expect(content).toContain('application must not import infrastructure')
    expect(content).toContain('/^infrastructure\\//')
  })

  it('npm run check:deps exits 0 on clean codebase (no application/ → infrastructure/ imports)', () => {
    expect(() => {
      execSync('npx ts-node --transpile-only scripts/check-deps.ts', {
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe',
      })
    }).not.toThrow()
  })
})
