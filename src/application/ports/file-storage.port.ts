export interface IFileStorage {
  /** Grava o arquivo e devolve a URL pública. */
  save(data: Buffer, ext: string): Promise<string>
  /** Remove pelo URL devolvido em save(); ignora arquivo inexistente. */
  remove(url: string): Promise<void>
}
