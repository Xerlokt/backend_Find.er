import { randomUUID } from 'crypto'
import { mkdir, unlink, writeFile } from 'fs/promises'
import path from 'path'
import { IFileStorage } from '../../application/ports/file-storage.port'

export const UPLOADS_DIR = path.resolve(process.cwd(), process.env.UPLOADS_DIR ?? 'uploads')

/** Guarda em disco local e serve por /uploads (ver app.ts). Trocável por S3 sem mudar a API. */
export class LocalFileStorage implements IFileStorage {
  constructor(private readonly publicUrl: string = process.env.PUBLIC_URL ?? 'http://localhost:3000') {}

  async save(data: Buffer, ext: string): Promise<string> {
    await mkdir(UPLOADS_DIR, { recursive: true })
    const name = `${randomUUID()}.${ext}`
    await writeFile(path.join(UPLOADS_DIR, name), data)
    return `${this.publicUrl.replace(/\/$/, '')}/uploads/${name}`
  }

  async remove(url: string): Promise<void> {
    const name = path.basename(new URL(url, 'http://x').pathname)
    if (!name) return
    try {
      await unlink(path.join(UPLOADS_DIR, name))
    } catch {
      /* já removido */
    }
  }
}
